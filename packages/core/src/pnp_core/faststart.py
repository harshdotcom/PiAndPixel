"""Move an MP4's index (moov atom) to the front so browsers can start playback early."""

import os
from collections import deque
from pathlib import Path

from pnp_core.errors import PnpError
from pnp_core.process import CancelToken, RenderLimits, run_process

_KILLED = {
    "timed_out": "exceeded the time limit",
    "cancelled": "was cancelled",
    "too_large": "output exceeded the size limit",
}


def ffmpeg_env(workdir: Path) -> dict[str, str]:
    """Allowlisted env only: ffmpeg must never see the agent's tokens or keys."""
    home = workdir / "home"
    home.mkdir(parents=True, exist_ok=True)
    return {"PATH": os.environ.get("PATH", os.defpath), "HOME": str(home), "LANG": "C.UTF-8"}


def remux_faststart(
    src: Path,
    dest: Path,
    *,
    ffmpeg: str,
    limits: RenderLimits,
    log_path: Path,
    cancel: CancelToken | None = None,
) -> None:
    """Stream-copy src to dest with -movflags +faststart; output is appended to log_path.

    Raises PnpError when ffmpeg fails or is killed (timeout/cancel).
    """
    workdir = dest.parent
    cmd = [
        ffmpeg, "-hide_banner", "-nostdin", "-y", "-i", str(src),
        "-map", "0", "-c", "copy", "-movflags", "+faststart", str(dest),
    ]  # fmt: skip
    recent: deque[str] = deque(maxlen=20)
    try:
        outcome = run_process(
            cmd, cwd=workdir, env=ffmpeg_env(workdir), log_path=log_path, output_dir=workdir,
            limits=limits, on_line=recent.append, cancel=cancel,
        )  # fmt: skip
    except OSError as exc:
        raise PnpError(f"faststart could not run ffmpeg: {exc}") from None
    if outcome.killed_for is None and outcome.exit_code == 0:
        return
    dest.unlink(missing_ok=True)
    if outcome.killed_for is not None:
        raise PnpError(f"faststart {_KILLED[outcome.killed_for]}")
    detail = next((ln.strip() for ln in reversed(recent) if ln.strip()), "no output")
    raise PnpError(f"faststart failed (ffmpeg exit {outcome.exit_code}): {detail}")
