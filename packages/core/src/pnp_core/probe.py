"""Read and validate video files with ffprobe."""

import json
import subprocess
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any

from pnp_core.errors import ProbeError

_PROBE_TIMEOUT_S = 60
_FPS_TOLERANCE = 0.01
MAX_CLIP_DURATION_S = 1800.0


@dataclass(frozen=True)
class MediaInfo:
    width: int
    height: int
    fps: float
    duration_s: float
    video_codec: str
    pix_fmt: str
    has_audio: bool
    video_streams: int = 1


def _run_ffprobe(path: Path, ffprobe: str) -> dict[str, Any]:
    cmd = [ffprobe, "-v", "error", "-print_format", "json", "-show_streams", "-show_format"]
    try:
        proc = subprocess.run(
            [*cmd, str(path)], capture_output=True, text=True, timeout=_PROBE_TIMEOUT_S
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ProbeError(f"ffprobe could not run: {exc}") from None
    if proc.returncode != 0:
        detail = proc.stderr.strip().splitlines()[-1:] or ["unknown error"]
        raise ProbeError(f"ffprobe failed on {path.name}: {detail[0]}")
    try:
        data: Any = json.loads(proc.stdout)
    except json.JSONDecodeError:
        raise ProbeError("ffprobe returned invalid JSON") from None
    if not isinstance(data, dict):
        raise ProbeError("ffprobe returned unexpected output")
    return data  # pyright: ignore[reportUnknownVariableType]


def _fps(rate: str) -> float:
    try:
        return float(Fraction(rate))
    except (ValueError, ZeroDivisionError):
        return 0.0


def probe(path: Path, *, ffprobe: str = "ffprobe") -> MediaInfo:
    data = _run_ffprobe(path, ffprobe)
    streams: list[dict[str, Any]] = data.get("streams") or []
    videos = [s for s in streams if s.get("codec_type") == "video"]
    if not videos:
        raise ProbeError(f"{path.name} has no video stream")
    video = videos[0]
    fmt: dict[str, Any] = data.get("format") or {}
    duration = video.get("duration") or fmt.get("duration") or 0
    try:
        return MediaInfo(
            width=int(video.get("width", 0)),
            height=int(video.get("height", 0)),
            fps=_fps(str(video.get("r_frame_rate", "0/1"))),
            duration_s=float(duration),
            video_codec=str(video.get("codec_name", "")),
            pix_fmt=str(video.get("pix_fmt", "")),
            has_audio=any(s.get("codec_type") == "audio" for s in streams),
            video_streams=len(videos),
        )
    except (TypeError, ValueError) as exc:
        raise ProbeError(f"ffprobe output for {path.name} is malformed: {exc}") from None


def check_clip(
    info: MediaInfo,
    *,
    width: int,
    height: int,
    fps: float,
    max_duration_s: float = MAX_CLIP_DURATION_S,
) -> list[str]:
    """Return human-readable problems with the clip; an empty list means it is valid."""
    problems: list[str] = []
    if (info.width, info.height) != (width, height):
        problems.append(f"size is {info.width}x{info.height}, expected {width}x{height}")
    if abs(info.fps - fps) > _FPS_TOLERANCE:
        problems.append(f"frame rate is {info.fps:g} fps, expected {fps:g}")
    if info.duration_s <= 0:
        problems.append("duration is zero")
    elif info.duration_s > max_duration_s:
        problems.append(f"duration {info.duration_s:.1f}s exceeds the {max_duration_s:g}s limit")
    return problems
