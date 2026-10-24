"""What this machine can do: hardware, OS and external tool versions."""

import os
import platform
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any

from pnp_core.render import ToolPaths

from pnp_agent import __version__

_VERSION_TIMEOUT_S = 20


def _tool_version(binary: str, flag: str) -> dict[str, Any]:
    path = shutil.which(binary)
    if path is None:
        return {"available": False, "version": None, "path": None}
    try:
        proc = subprocess.run(
            [path, flag], capture_output=True, text=True, timeout=_VERSION_TIMEOUT_S, check=False
        )
    except (OSError, subprocess.TimeoutExpired):
        return {"available": False, "version": None, "path": path}
    lines = [ln.strip() for ln in (proc.stdout + proc.stderr).splitlines() if ln.strip()]
    return {"available": proc.returncode == 0, "version": lines[0] if lines else None, "path": path}


def detect_tools(tools: ToolPaths) -> dict[str, dict[str, Any]]:
    return {
        "manim": _tool_version(tools.manim, "--version"),
        "ffmpeg": _tool_version(tools.ffmpeg, "-version"),
        "ffprobe": _tool_version(tools.ffprobe, "-version"),
        "latex": _tool_version("latex", "--version"),
    }


class ToolReport:
    """Detects tool versions once (they take seconds) and caches the result."""

    def __init__(self, tools: ToolPaths) -> None:
        self._tools = tools
        self._lock = threading.Lock()
        self._result: dict[str, dict[str, Any]] | None = None

    def start(self) -> None:
        threading.Thread(target=self.get, daemon=True).start()

    def get(self) -> dict[str, dict[str, Any]]:
        with self._lock:
            if self._result is None:
                self._result = detect_tools(self._tools)
            return self._result


def _target() -> str:
    if os.environ.get("COLAB_RELEASE_TAG"):
        return "colab"
    if Path("/.dockerenv").exists():
        return "docker"
    return "local"


def _meminfo_mb() -> tuple[int, int]:
    values: dict[str, int] = {}
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            key, _, rest = line.partition(":")
            values[key] = int(rest.split()[0]) // 1024
    except (OSError, ValueError, IndexError):
        return 0, 0
    return values.get("MemTotal", 0), values.get("MemAvailable", 0)


def agent_info(
    workspace: Path, tools: dict[str, dict[str, Any]], *, terminal: bool = False
) -> dict[str, Any]:
    ram_total, ram_free = _meminfo_mb()
    disk_root = workspace if workspace.exists() else Path.cwd()
    return {
        "version": __version__,
        "target": _target(),
        "os": platform.platform(),
        "cpu_count": os.cpu_count() or 1,
        "ram_total_mb": ram_total,
        "ram_free_mb": ram_free,
        "disk_free_mb": shutil.disk_usage(disk_root).free // (1024 * 1024),
        "python": platform.python_version(),
        "tools": tools,
        "features": {"terminal": terminal},
    }
