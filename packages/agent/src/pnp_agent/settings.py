"""Agent configuration: where the workspace lives, the token, and external tool paths."""

import ipaddress
import os
import secrets
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any

from pnp_core.render import RenderLimits, ToolPaths

# settings.py -> pnp_agent -> src -> agent -> packages -> repo root
REPO_ROOT = Path(__file__).resolve().parents[4]


@dataclass
class Settings:
    workspace: Path
    token: str
    host: str = "127.0.0.1"
    port: int = 7860
    tools: ToolPaths = field(default_factory=ToolPaths)
    render_limits: RenderLimits = field(default_factory=RenderLimits)
    studio_dist: Path | None = None
    templates_dir: Path = REPO_ROOT / "examples"
    allowed_origins: list[str] = field(
        default_factory=lambda: ["http://127.0.0.1:5173", "http://localhost:5173"]
    )
    testing: bool = False
    # `pnp studio --no-terminal` turns it off; it is never served on a non-loopback bind.
    terminal_enabled: bool = True

    @property
    def terminal_available(self) -> bool:
        return self.terminal_enabled and is_loopback(self.host)


def is_loopback(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def settings_from_env(workspace: Path, **overrides: Any) -> Settings:
    """Build Settings from PNP_* environment variables; explicit overrides win."""
    tools = ToolPaths(
        manim=os.environ.get("PNP_MANIM_BIN", "manim"),
        ffmpeg=os.environ.get("PNP_FFMPEG_BIN", "ffmpeg"),
        ffprobe=os.environ.get("PNP_FFPROBE_BIN", "ffprobe"),
    )
    # A missing token is replaced by a random one: the API must never run unauthenticated.
    token = os.environ.get("PNP_TOKEN") or secrets.token_urlsafe(24)
    settings = Settings(workspace=workspace, token=token, tools=tools)
    templates = os.environ.get("PNP_TEMPLATES_DIR")
    if templates:
        settings.templates_dir = Path(templates)
    return replace(settings, **overrides)
