"""Render one Manim scene from a project snapshot in an isolated working directory."""

import json
import os
import re
import shutil
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import pnp

from pnp_core.context import build_render_context
from pnp_core.discovery import discover_scenes
from pnp_core.errors import PnpError
from pnp_core.faststart import remux_faststart
from pnp_core.fileops import EXCLUDED_NAMES
from pnp_core.formats import Format, Quality, resolve_output
from pnp_core.manifest import parse_scene_ref
from pnp_core.paths import safe_join
from pnp_core.process import CancelToken, RenderLimits, run_process

__all__ = [
    "CancelToken",
    "RenderLimits",
    "RenderRequest",
    "RenderResult",
    "RenderStatus",
    "ToolPaths",
    "render_scene",
]

_SNAPSHOT_IGNORE = shutil.ignore_patterns(*EXCLUDED_NAMES)
_EXCEPTION_LINE = re.compile(r"^[A-Za-z_][\w.]*(Error|Exception|Interrupt|Exit)\b(:|$)")
# What Python reports when RLIMIT_AS (memory) or RLIMIT_NPROC (fork) is hit.
_RESOURCE_ERROR = re.compile(r"MemoryError|Cannot allocate memory|Resource temporarily unavailable")

RenderStatus = Literal["completed", "failed", "timed_out", "cancelled"]


@dataclass(frozen=True)
class ToolPaths:
    manim: str = "manim"
    ffmpeg: str = "ffmpeg"
    ffprobe: str = "ffprobe"


@dataclass(frozen=True)
class RenderRequest:
    project_root: Path
    scene_ref: str
    fmt: Format
    quality: Quality
    params: Mapping[str, Any] = field(default_factory=dict[str, Any])
    theme: Mapping[str, str] | None = None
    brand_name: str | None = None
    # Explicit choices that win over the quality preset (pnp_core.formats.resolve_output).
    resolution: str | None = None
    fps: int | None = None


@dataclass(frozen=True)
class RenderResult:
    status: RenderStatus
    output: Path | None
    exit_code: int | None
    log_path: Path
    error: str | None
    duration_s: float


def _snapshot(project_root: Path, dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    # symlinks=True keeps links as links, so an escaping link is caught by safe_join
    # instead of its target being copied into the snapshot.
    shutil.copytree(project_root, dest, ignore=_SNAPSHOT_IGNORE, symlinks=True)


def _check_scene(src: Path, scene_ref: str) -> tuple[str, str]:
    """Return (file, class_name) or raise PnpError if the scene is not in the snapshot."""
    file, class_name = parse_scene_ref(scene_ref)
    scene_path = safe_join(src, file)
    if not scene_path.is_file():
        raise PnpError(f"scene file {file} does not exist")
    rel = scene_path.relative_to(src.resolve()).as_posix()
    scenes, _errors = discover_scenes(src)
    if not any(s.file == rel and s.class_name == class_name for s in scenes):
        raise PnpError(f"no scene class {class_name} found in {file}")
    return rel, class_name


def _write_context(req: RenderRequest, path: Path) -> tuple[int, int, int]:
    out = resolve_output(req.fmt, quality=req.quality, resolution=req.resolution, fps=req.fps)
    width, height, fps = out.geometry
    context = build_render_context(
        fmt=req.fmt,
        quality=req.quality,
        width=width,
        height=height,
        fps=fps,
        params=req.params,
        theme=req.theme,
        brand_name=req.brand_name,
    )
    path.write_text(json.dumps(context, indent=2), encoding="utf-8")
    return width, height, fps


def _write_frame_config(geometry: tuple[int, int, int], path: Path) -> None:
    """Keep the frame 8 units high with square pixels at any resolution.

    `--resolution` alone keeps manim's 16:9 frame width, which squashes portrait and
    square renders; manim only takes the frame size from a config file.
    """
    width, height, _fps = geometry
    path.write_text(
        f"[CLI]\nframe_height = 8.0\nframe_width = {8.0 * width / height!r}\n", encoding="utf-8"
    )


def _render_env(workdir: Path) -> dict[str, str]:
    """Allowlisted env only: the render must never see the agent's tokens or keys."""
    home = workdir / "home"
    home.mkdir(exist_ok=True)
    return {
        "PATH": os.environ.get("PATH", os.defpath),
        "HOME": str(home),
        "LANG": "C.UTF-8",
        "PNP_RENDER_CONTEXT": str(workdir / "ctx.json"),
        "PYTHONPATH": str(workdir / "sdk"),
        "PYTHONDONTWRITEBYTECODE": "1",
        "NO_COLOR": "1",
        "TERM": "dumb",
        "COLUMNS": "200",
    }


def _find_output(media: Path, class_name: str) -> list[Path]:
    videos = media / "videos"
    if not videos.is_dir():
        return []
    found = videos.glob(f"**/{class_name}.mp4")
    return sorted(p for p in found if "partial_movie_files" not in p.parts)


def _error_from_log(log_path: Path) -> str:
    lines = [ln.strip(" \t│|") for ln in log_path.read_text(encoding="utf-8").splitlines()]
    lines = [ln.strip() for ln in lines if ln.strip()]
    exceptions = [ln for ln in lines if _EXCEPTION_LINE.match(ln)]
    line = (exceptions or lines or ["manim failed without output"])[-1]
    if _RESOURCE_ERROR.search(line):
        return f"resource_limit: the render hit the memory or process limit ({line})"
    return line


def _manim_command(
    tools: ToolPaths, file: str, class_name: str, geometry: tuple[int, int, int], workdir: Path
) -> list[str]:
    width, height, fps = geometry
    return [
        tools.manim, "render", file, class_name,
        "--config_file", str(workdir / "manim.cfg"),
        "--resolution", f"{width},{height}",
        "--fps", str(fps),
        "--media_dir", str(workdir / "media"),
        "--format", "mp4",
        "--disable_caching",
        "--progress_bar", "none",
        "-v", "INFO",
    ]  # fmt: skip


_DEFAULT_TOOLS = ToolPaths()
_DEFAULT_LIMITS = RenderLimits()

_KILL_REASONS: dict[str, tuple[RenderStatus, str]] = {
    "timed_out": ("timed_out", "render exceeded the time limit"),
    "cancelled": ("cancelled", "render was cancelled"),
    "too_large": ("failed", "render output exceeded the size limit"),
}


@dataclass(frozen=True)
class _Prepared:
    file: str
    class_name: str
    geometry: tuple[int, int, int]
    env: dict[str, str]


def _prepare(req: RenderRequest, workdir: Path) -> _Prepared:
    """Snapshot the project and stage the sdk and context next to it."""
    src = workdir / "src"
    _snapshot(req.project_root, src)
    file, class_name = _check_scene(src, req.scene_ref)
    sdk_dest = workdir / "sdk" / "pnp"
    if sdk_dest.exists():
        shutil.rmtree(sdk_dest)
    sdk_source = Path(pnp.__file__).parent
    shutil.copytree(sdk_source, sdk_dest, ignore=shutil.ignore_patterns("__pycache__"))
    geometry = _write_context(req, workdir / "ctx.json")
    _write_frame_config(geometry, workdir / "manim.cfg")
    return _Prepared(file, class_name, geometry, _render_env(workdir))


def _log_note(log_path: Path, message: str) -> None:
    with log_path.open("a", encoding="utf-8") as log:
        log.write(f"[pnp] {message}\n")


def _faststart_output(
    media: Path,
    class_name: str,
    workdir: Path,
    tools: ToolPaths,
    limits: RenderLimits,
    cancel: CancelToken | None,
) -> tuple[RenderStatus, str | None, Path | None]:
    """Find manim's single video and remux it to <workdir>/out.mp4 with faststart."""
    videos = _find_output(media, class_name)
    if len(videos) != 1:
        problem = "no video" if not videos else f"{len(videos)} videos"
        return "failed", f"manim exited 0 but produced {problem}", None
    out, log_path = workdir / "out.mp4", workdir / "render.log"
    try:
        remux_faststart(
            videos[0], out, ffmpeg=tools.ffmpeg, limits=limits, log_path=log_path, cancel=cancel
        )
    except PnpError as exc:
        _log_note(log_path, str(exc))
        cancelled = cancel is not None and cancel.cancelled
        return ("cancelled" if cancelled else "failed"), str(exc), None
    return "completed", None, out


def render_scene(
    req: RenderRequest,
    workdir: Path,
    *,
    tools: ToolPaths = _DEFAULT_TOOLS,
    limits: RenderLimits = _DEFAULT_LIMITS,
    on_line: Callable[[str], None] | None = None,
    cancel: CancelToken | None = None,
) -> RenderResult:
    started = time.monotonic()
    workdir.mkdir(parents=True, exist_ok=True)
    log_path = workdir / "render.log"
    log_path.touch()

    def done(
        status: RenderStatus, error: str | None, code: int | None, out: Path | None = None
    ) -> RenderResult:
        return RenderResult(status, out, code, log_path, error, time.monotonic() - started)

    try:
        prep = _prepare(req, workdir)
        media = workdir / "media"
        cmd = _manim_command(tools, prep.file, prep.class_name, prep.geometry, workdir)
        outcome = run_process(
            cmd, cwd=workdir / "src", env=prep.env, log_path=log_path, output_dir=media,
            limits=limits, on_line=on_line, cancel=cancel,
        )  # fmt: skip
    except (PnpError, OSError) as exc:
        _log_note(log_path, str(exc))
        return done("failed", str(exc), None)
    code = outcome.exit_code
    if outcome.killed_for is not None:
        status, message = _KILL_REASONS[outcome.killed_for]
        _log_note(log_path, message)
        return done(status, message, code)
    if code != 0:
        return done("failed", _error_from_log(log_path), code)
    status, error, out = _faststart_output(media, prep.class_name, workdir, tools, limits, cancel)
    return done(status, error, code, out)
