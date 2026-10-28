"""Concatenate rendered clips into one MP4 and validate the final export."""

import re
import time
from collections import deque
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from pnp_core.errors import ProbeError
from pnp_core.faststart import ffmpeg_env
from pnp_core.probe import MediaInfo, probe
from pnp_core.process import CancelToken, RenderLimits, run_process
from pnp_core.render import RenderStatus, ToolPaths

MAX_EXPORT_DURATION_S = 1800.0
_DEFAULT_TOOLS = ToolPaths()
_DEFAULT_LIMITS = RenderLimits()
_FPS_TOLERANCE = 0.01
# `-progress pipe:1` prints key=value lines; ffmpeg's own messages never start like this.
_PROGRESS_LINE = re.compile(r"^\w+=")

_KILL_REASONS: dict[str, tuple[RenderStatus, str, str]] = {
    "timed_out": ("timed_out", "timeout", "export exceeded the time limit"),
    "cancelled": ("cancelled", "cancelled", "export was cancelled"),
    "too_large": ("failed", "render_failed", "export output exceeded the size limit"),
}


@dataclass(frozen=True)
class ComposeRequest:
    clips: tuple[Path, ...]  # in playback order; the same file may appear more than once
    width: int
    height: int
    fps: int
    max_duration_s: float = MAX_EXPORT_DURATION_S
    audio: Path | None = None
    audio_duration_s: float | None = None
    audio_start_s: float = 0
    audio_clips: tuple["ComposeAudioClip", ...] = ()
    audio_required: bool = False


@dataclass(frozen=True)
class ComposeAudioClip:
    path: Path
    start_s: float = 0
    source_start_s: float = 0
    source_end_s: float | None = None
    gain: float = 1


@dataclass(frozen=True)
class ComposeResult:
    status: RenderStatus
    output: Path | None  # <workdir>/export.mp4, validated, faststart
    exit_code: int | None
    log_path: Path  # <workdir>/composite.log
    error: str | None
    error_code: str | None  # "duration_exceeded", "validation_error", "probe_error", ...
    duration_s: float


def check_export(
    info: MediaInfo,
    *,
    width: int,
    height: int,
    fps: float,
    clip_durations: Sequence[float],
    max_duration_s: float = MAX_EXPORT_DURATION_S,
) -> tuple[str, str] | None:
    """Return (error_code, message) for the first problem, or None when the export is valid."""
    expected = sum(clip_durations)
    if info.video_streams != 1:
        return "validation_error", f"export has {info.video_streams} video streams, expected 1"
    if (info.width, info.height) != (width, height):
        return "validation_error", f"size is {info.width}x{info.height}, expected {width}x{height}"
    if abs(info.fps - fps) > _FPS_TOLERANCE:
        return "validation_error", f"frame rate is {info.fps:g} fps, expected {fps:g}"
    if info.duration_s > max_duration_s:
        message = f"duration {info.duration_s:.1f}s exceeds the {max_duration_s:g}s limit"
        return "duration_exceeded", message
    if info.duration_s <= 0:
        return "validation_error", "duration is zero"
    if abs(info.duration_s - expected) > len(clip_durations) / fps:
        message = f"duration {info.duration_s:.2f}s does not match the clips' {expected:.2f}s"
        return "validation_error", message
    return None


def can_stream_copy(infos: Sequence[MediaInfo], req: ComposeRequest) -> bool:
    """True when every clip already has one codec, pixel format and the requested geometry."""
    codec = (infos[0].video_codec, infos[0].pix_fmt)
    return all(
        (i.video_codec, i.pix_fmt) == codec
        and (i.width, i.height) == (req.width, req.height)
        and abs(i.fps - req.fps) <= _FPS_TOLERANCE
        for i in infos
    )


def concat_list(clips: Sequence[Path]) -> str:
    """The concat demuxer's input list; a quote inside a path is written as '\\''."""
    lines = ["file '" + str(c.resolve()).replace("'", "'\\''") + "'" for c in clips]
    return "\n".join(lines) + "\n"


def _audio_sources(req: ComposeRequest) -> list[ComposeAudioClip]:
    if req.audio_clips:
        return list(req.audio_clips)
    if req.audio:
        return [
            ComposeAudioClip(
                req.audio,
                start_s=req.audio_start_s,
                source_end_s=req.audio_duration_s,
            )
        ]
    return []


def ffmpeg_command(
    ffmpeg: str, req: ComposeRequest, workdir: Path, *, copy: bool, duration_s: float = 0.0
) -> list[str]:
    head = [
        ffmpeg, "-hide_banner", "-nostdin", "-y", "-f", "concat", "-safe", "0",
        "-i", str(workdir / "clips.txt"),
    ]  # fmt: skip
    audio_sources = _audio_sources(req)
    for source in audio_sources:
        head += ["-i", str(source.path)]
    if req.audio_required and not audio_sources:
        head += [
            "-f",
            "lavfi",
            "-t",
            f"{duration_s:.6f}",
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=48000",
        ]
    head += ["-map", "0:v:0"]
    if audio_sources:
        filters: list[str] = []
        labels: list[str] = []
        for index, source in enumerate(audio_sources, start=1):
            label = f"a{index}"
            trim = f"atrim=start={source.source_start_s:.6f}"
            if source.source_end_s is not None:
                trim += f":end={source.source_end_s:.6f}"
            delay_ms = round(source.start_s * 1000)
            filters.append(
                f"[{index}:a]{trim},asetpts=PTS-STARTPTS,volume={source.gain:.4f},"
                f"adelay={delay_ms}|{delay_ms},apad,"
                f"atrim=duration={duration_s:.6f},aresample=48000[{label}]"
            )
            labels.append(f"[{label}]")
        filters.append(
            f"{''.join(labels)}amix=inputs={len(labels)}:duration=longest:"
            "dropout_transition=0:normalize=0[mix]"
        )
        head += ["-filter_complex", ";".join(filters), "-map", "[mix]"]
    elif req.audio_required:
        head += ["-map", "1:a"]
    else:
        head += ["-an"]
    if copy and not audio_sources and not req.audio_required:
        codec = ["-c", "copy"]
    else:
        codec = [
            "-vf", f"scale={req.width}:{req.height},fps={req.fps}",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        ]  # fmt: skip
    if audio_sources or req.audio_required:
        codec += ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"]
    tail = ["-movflags", "+faststart", "-progress", "pipe:1", "-nostats"]
    return [*head, *codec, *tail, str(workdir / "export.mp4")]


class _OutputSplitter:
    """Turns ffmpeg's merged output into measured progress and plain log lines."""

    def __init__(
        self,
        total_s: float,
        on_line: Callable[[str], None] | None,
        on_progress: Callable[[float], None] | None,
    ) -> None:
        self._total_s = total_s
        self._on_line = on_line
        self._on_progress = on_progress
        self._recent: deque[str] = deque(maxlen=20)

    def __call__(self, line: str) -> None:
        if not _PROGRESS_LINE.match(line):
            self._recent.append(line)
            if self._on_line is not None:
                self._on_line(line)
            return
        key, _, value = line.partition("=")
        if key != "out_time_us" or self._on_progress is None or self._total_s <= 0:
            return
        try:
            seconds = int(value) / 1e6
        except ValueError:  # "N/A" before the first frame
            return
        self._on_progress(min(100.0, max(0.0, seconds / self._total_s * 100)))

    def last_line(self) -> str:
        return next((ln.strip() for ln in reversed(self._recent) if ln.strip()), "no output")


def _probe_clips(req: ComposeRequest, ffprobe: str) -> list[MediaInfo]:
    """MediaInfo per clip in playback order; each distinct file is probed once."""
    distinct = {clip: probe(clip, ffprobe=ffprobe) for clip in dict.fromkeys(req.clips)}
    return [distinct[clip] for clip in req.clips]


def _validate(
    req: ComposeRequest, out: Path, infos: list[MediaInfo], ffprobe: str
) -> tuple[str, str] | None:
    try:
        info = probe(out, ffprobe=ffprobe)
    except ProbeError as exc:
        return "probe_error", str(exc)
    durations = [i.duration_s for i in infos]
    problem = check_export(
        info, width=req.width, height=req.height, fps=req.fps,
        clip_durations=durations, max_duration_s=req.max_duration_s,
    )  # fmt: skip
    if problem is not None:
        return problem
    has_audio = bool(_audio_sources(req) or req.audio_required)
    if has_audio and not info.has_audio:
        return "validation_error", "export is missing the requested narration audio"
    if has_audio and info.audio_codec != "aac":
        return "validation_error", f"audio codec is {info.audio_codec}, expected aac"
    if has_audio and info.audio_sample_rate != 48000:
        return "validation_error", "narration audio sample rate is not 48000 Hz"
    if has_audio and (
        info.audio_duration_s is None or abs(info.audio_duration_s - info.duration_s) > 0.15
    ):
        return "validation_error", "audio duration does not match the video duration"
    return None


_Outcome = tuple[RenderStatus, int | None, tuple[str, str] | None]


def _concat(
    req: ComposeRequest,
    workdir: Path,
    infos: list[MediaInfo],
    tools: ToolPaths,
    limits: RenderLimits,
    splitter: _OutputSplitter,
    cancel: CancelToken | None,
) -> _Outcome:
    """Run ffmpeg's concat into <workdir>/export.mp4, then probe and check the result."""
    (workdir / "clips.txt").write_text(concat_list(req.clips), encoding="utf-8")
    cmd = ffmpeg_command(
        tools.ffmpeg,
        req,
        workdir,
        copy=can_stream_copy(infos, req),
        duration_s=sum(info.duration_s for info in infos),
    )
    try:
        outcome = run_process(
            cmd, cwd=workdir, env=ffmpeg_env(workdir), log_path=workdir / "composite.log",
            output_dir=workdir, limits=limits, on_line=splitter, cancel=cancel,
        )  # fmt: skip
    except OSError as exc:
        return "failed", None, ("render_failed", f"ffmpeg could not run: {exc}")
    code = outcome.exit_code
    if outcome.killed_for is not None:
        status, error_code, message = _KILL_REASONS[outcome.killed_for]
        return status, code, (error_code, message)
    if code != 0:
        return "failed", code, ("render_failed", splitter.last_line())
    problem = _validate(req, workdir / "export.mp4", infos, tools.ffprobe)
    return ("completed" if problem is None else "failed"), code, problem


def compose_export(
    req: ComposeRequest,
    workdir: Path,
    *,
    tools: ToolPaths = _DEFAULT_TOOLS,
    limits: RenderLimits = _DEFAULT_LIMITS,
    on_line: Callable[[str], None] | None = None,
    on_progress: Callable[[float], None] | None = None,
    cancel: CancelToken | None = None,
) -> ComposeResult:
    """Concat (stream copy when clips match, else libx264 yuv420p), +faststart, validate."""
    started = time.monotonic()
    workdir.mkdir(parents=True, exist_ok=True)
    log_path, out = workdir / "composite.log", workdir / "export.mp4"
    log_path.touch()

    def done(
        status: RenderStatus, code: int | None, problem: tuple[str, str] | None
    ) -> ComposeResult:
        error_code, error = problem or (None, None)
        if error is not None:
            with log_path.open("a", encoding="utf-8") as log:
                log.write(f"[pnp] {error}\n")
            out.unlink(missing_ok=True)
        output = out if status == "completed" else None
        elapsed = time.monotonic() - started
        return ComposeResult(status, output, code, log_path, error, error_code, elapsed)

    if not req.clips:
        return done("failed", None, ("validation_error", "the export has no clips"))
    try:
        infos = _probe_clips(req, tools.ffprobe)
    except ProbeError as exc:
        return done("failed", None, ("probe_error", str(exc)))
    total_s = sum(i.duration_s for i in infos)
    if total_s > req.max_duration_s:
        message = f"clips add up to {total_s:.1f}s, over the {req.max_duration_s:g}s limit"
        return done("failed", None, ("duration_exceeded", message))
    for audio in _audio_sources(req):
        source_duration = (audio.source_end_s or 0) - audio.source_start_s
        if audio.start_s + source_duration > total_s + 1 / req.fps:
            return done("failed", None, ("validation_error", "narration is longer than the video"))
    splitter = _OutputSplitter(total_s, on_line, on_progress)
    status, code, problem = _concat(req, workdir, infos, tools, limits, splitter, cancel)
    return done(status, code, problem)
