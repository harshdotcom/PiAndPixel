"""check_export, the copy/re-encode decision and compose_export against fake ffmpeg/ffprobe."""

from dataclasses import replace
from pathlib import Path

import pytest
from core_helpers import fake_ffmpeg, fake_ffprobe, ffmpeg_calls, probe_payload
from pnp_core.compose import (
    ComposeRequest,
    ComposeResult,
    can_stream_copy,
    check_export,
    compose_export,
    concat_list,
    ffmpeg_command,
)
from pnp_core.probe import MediaInfo
from pnp_core.process import CancelToken, RenderLimits
from pnp_core.render import ToolPaths

GOOD = MediaInfo(160, 90, 15.0, 3.0, "h264", "yuv420p", False)
CLIP = MediaInfo(160, 90, 15.0, 1.0, "h264", "yuv420p", False)
REQ = ComposeRequest((Path("/c/a.mp4"),), 160, 90, 15)


def check(
    info: MediaInfo, durations: list[float] | None = None, max_s: float = 1800.0
) -> tuple[str, str] | None:
    return check_export(
        info, width=160, height=90, fps=15, clip_durations=durations or [1.0, 1.0, 1.0],
        max_duration_s=max_s,
    )  # fmt: skip


def test_check_export_accepts_valid_export() -> None:
    assert check(GOOD) is None
    assert check(replace(GOOD, duration_s=3.0 + 3 / 15 - 0.001)) is None


@pytest.mark.parametrize(
    ("info", "code", "text"),
    [
        (replace(GOOD, video_streams=2), "validation_error", "2 video streams"),
        (replace(GOOD, width=320, video_streams=0), "validation_error", "0 video streams"),
        (replace(GOOD, width=320, fps=30.0), "validation_error", "size is 320x90"),
        (replace(GOOD, fps=15.02, duration_s=0.0), "validation_error", "frame rate is 15.02"),
        (replace(GOOD, duration_s=1801.0), "duration_exceeded", "exceeds the 1800s limit"),
        (replace(GOOD, duration_s=0.0), "validation_error", "duration is zero"),
        (replace(GOOD, duration_s=3.21), "validation_error", "does not match"),
        (replace(GOOD, duration_s=2.79), "validation_error", "does not match"),
    ],
)
def test_check_export_first_problem_wins(info: MediaInfo, code: str, text: str) -> None:
    problem = check(info)
    assert problem is not None and problem[0] == code
    assert text in problem[1]


def test_check_export_uses_max_duration() -> None:
    assert check(GOOD, max_s=2.0) == ("duration_exceeded", "duration 3.0s exceeds the 2s limit")


def test_stream_copy_only_when_every_clip_matches_the_request() -> None:
    assert can_stream_copy([CLIP, CLIP], REQ)
    assert can_stream_copy([CLIP, replace(CLIP, fps=15.001)], REQ)
    assert not can_stream_copy([CLIP, replace(CLIP, video_codec="hevc")], REQ)
    assert not can_stream_copy([CLIP, replace(CLIP, pix_fmt="yuv444p")], REQ)
    assert not can_stream_copy([CLIP, replace(CLIP, fps=30.0)], REQ)
    assert not can_stream_copy([replace(CLIP, width=320, height=180)], REQ)
    assert not can_stream_copy([CLIP], replace(REQ, fps=30))


def test_concat_list_escapes_quotes(tmp_path: Path) -> None:
    clips = [tmp_path / "a.mp4", tmp_path / "it's.mp4", tmp_path / "a.mp4"]
    assert concat_list(clips).splitlines() == [
        f"file '{tmp_path}/a.mp4'", f"file '{tmp_path}/it'\\''s.mp4'", f"file '{tmp_path}/a.mp4'",
    ]  # fmt: skip


def test_ffmpeg_command_copy_and_reencode(tmp_path: Path) -> None:
    head = ["ffmpeg", "-hide_banner", "-nostdin", "-y", "-f", "concat", "-safe", "0",
            "-i", str(tmp_path / "clips.txt"), "-map", "0:v:0", "-an"]  # fmt: skip
    tail = ["-movflags", "+faststart", "-progress", "pipe:1", "-nostats",
            str(tmp_path / "export.mp4")]  # fmt: skip
    assert ffmpeg_command("ffmpeg", REQ, tmp_path, copy=True) == [*head, "-c", "copy", *tail]
    assert ffmpeg_command("ffmpeg", REQ, tmp_path, copy=False) == [
        *head, "-vf", "scale=160:90,fps=15", "-c:v", "libx264", "-preset", "medium",
        "-crf", "18", "-pix_fmt", "yuv420p", *tail,
    ]  # fmt: skip


PROGRESS_BODY = """\
print("[concat @ 0x1] Auto-inserting filter", flush=True)
print("frame=15", flush=True)
print("out_time_us=N/A", flush=True)
print("out_time_us=1000000", flush=True)
print("out_time_us=9000000", flush=True)
print("progress=end", flush=True)
out.write_bytes(b"export")
"""


def compose(
    tmp_path: Path, ffmpeg_body: str, output: dict[str, object] | None = None, **kw: object
) -> ComposeResult:
    clips = tmp_path / "clips"
    clips.mkdir(exist_ok=True)
    for name in ("a.mp4", "b.mp4"):
        (clips / name).write_bytes(b"clip")
    payloads = {"a.mp4": probe_payload(160, 90, 15, 1.0), "b.mp4": probe_payload(160, 90, 15, 1.0)}
    payloads["export.mp4"] = output or probe_payload(160, 90, 15, 3.0)
    tools = ToolPaths(
        ffmpeg=fake_ffmpeg(tmp_path, ffmpeg_body), ffprobe=fake_ffprobe(tmp_path, payloads)
    )
    req = ComposeRequest((clips / "a.mp4", clips / "b.mp4", clips / "a.mp4"), 160, 90, 15)
    return compose_export(req, tmp_path / "work", tools=tools, **kw)  # type: ignore[arg-type]


def test_compose_reports_measured_progress_and_log_lines(tmp_path: Path) -> None:
    lines: list[str] = []
    progress: list[float] = []
    result = compose(tmp_path, PROGRESS_BODY, on_line=lines.append, on_progress=progress.append)
    work = tmp_path / "work"
    assert result.status == "completed", result.error
    assert (result.output, result.exit_code, result.error_code) == (work / "export.mp4", 0, None)
    assert result.log_path == work / "composite.log"
    assert lines == ["[concat @ 0x1] Auto-inserting filter"]
    assert progress == [pytest.approx(100 / 3), 100.0]
    [call] = ffmpeg_calls(work)
    assert call[call.index("-c") + 1] == "copy"
    assert (work / "clips.txt").read_text().count("a.mp4") == 2


def test_compose_over_limit_never_runs_ffmpeg(tmp_path: Path) -> None:
    clip = tmp_path / "a.mp4"
    clip.write_bytes(b"clip")
    tools = ToolPaths(
        ffmpeg=fake_ffmpeg(tmp_path),
        ffprobe=fake_ffprobe(tmp_path, {"a.mp4": probe_payload(160, 90, 15, 1.0)}),
    )
    req = ComposeRequest((clip, clip, clip), 160, 90, 15, max_duration_s=2.5)
    result = compose_export(req, tmp_path / "work", tools=tools)
    assert (result.status, result.error_code, result.output) == (
        "failed",
        "duration_exceeded",
        None,
    )
    assert ffmpeg_calls(tmp_path / "work") == []
    assert "over the 2.5s limit" in result.log_path.read_text()


def test_compose_probe_failure(tmp_path: Path) -> None:
    (tmp_path / "missing.mp4").touch()
    tools = ToolPaths(ffmpeg=fake_ffmpeg(tmp_path), ffprobe=fake_ffprobe(tmp_path, {}))
    req = ComposeRequest((tmp_path / "missing.mp4",), 160, 90, 15)
    result = compose_export(req, tmp_path / "work", tools=tools)
    assert (result.status, result.error_code) == ("failed", "probe_error")


def test_compose_without_clips_fails(tmp_path: Path) -> None:
    result = compose_export(ComposeRequest((), 160, 90, 15), tmp_path / "work")
    assert (result.status, result.error_code) == ("failed", "validation_error")


def test_compose_ffmpeg_failure_uses_last_message(tmp_path: Path) -> None:
    body = "print('frame=1')\nprint('Unsafe file name')\nprint('progress=end')\nsys.exit(1)"
    result = compose(tmp_path, body)
    assert (result.status, result.exit_code) == ("failed", 1)
    assert (result.error_code, result.error) == ("render_failed", "Unsafe file name")


def test_compose_invalid_export_is_deleted(tmp_path: Path) -> None:
    result = compose(tmp_path, "out.write_bytes(b'x')", output=probe_payload(320, 180, 15, 3.0))
    assert (result.status, result.error_code, result.output) == ("failed", "validation_error", None)
    assert not (tmp_path / "work" / "export.mp4").exists()


def test_compose_reencodes_mismatched_clips(tmp_path: Path) -> None:
    clip = tmp_path / "a.mp4"
    clip.write_bytes(b"clip")
    payloads = {
        "a.mp4": probe_payload(320, 180, 30, 1.0),
        "export.mp4": probe_payload(160, 90, 15, 1.0),
    }
    tools = ToolPaths(
        ffmpeg=fake_ffmpeg(tmp_path, "out.write_bytes(b'x')"),
        ffprobe=fake_ffprobe(tmp_path, payloads),
    )
    result = compose_export(ComposeRequest((clip,), 160, 90, 15), tmp_path / "work", tools=tools)
    assert result.status == "completed", result.error
    [call] = ffmpeg_calls(tmp_path / "work")
    assert call[call.index("-c:v") + 1] == "libx264"


def test_compose_timeout_and_cancel(tmp_path: Path) -> None:
    result = compose(tmp_path, "time.sleep(60)", limits=RenderLimits(timeout_s=0.3))
    assert (result.status, result.error_code) == ("timed_out", "timeout")
    token = CancelToken()
    token.cancel()
    result = compose(tmp_path, "time.sleep(60)", cancel=token)
    assert (result.status, result.error_code) == ("cancelled", "cancelled")
