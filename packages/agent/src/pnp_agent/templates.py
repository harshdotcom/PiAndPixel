"""Project templates: a copy of an example project, or a generated blank project."""

import json
import re
import shutil
from pathlib import Path

from pnp_agent.errors import ApiError

_BLANK_MANIFEST = """\
pnp: 1
name: Blank
description: ""
engine: { name: manim }
"""

_BLANK_SCENE = """\
from manim import FadeIn, Scene, Text, config

from pnp import ctx


class Main(Scene):
    def construct(self):
        self.camera.background_color = ctx.theme.background
        title = Text(ctx.params.get("title", "Hello, Pi & Pixel"), color=ctx.theme.primary)
        if title.width > config.frame_width - 1:
            title.scale_to_fit_width(config.frame_width - 1)
        self.play(FadeIn(title))
        self.wait(1)
"""

_COPY_IGNORE = shutil.ignore_patterns(".pnp", ".git", "__pycache__", "media")


def list_templates(templates_dir: Path) -> list[dict[str, str]]:
    templates = [{"id": "blank", "name": "Blank", "description": "One small Text scene."}]
    if (templates_dir / "pythagoras" / "pnp.yaml").is_file():
        templates.insert(
            0,
            {
                "id": "pythagoras",
                "name": "Pythagoras explainer",
                "description": "Visual proof of a² + b² = c² in three scenes.",
            },
        )
    return templates


def write_template(template: str, templates_dir: Path, dest: Path) -> None:
    """Create dest (which must not exist yet) from the named template."""
    if template == "blank":
        (dest / "scenes").mkdir(parents=True)
        (dest / "pnp.yaml").write_text(_BLANK_MANIFEST, encoding="utf-8")
        (dest / "scenes" / "main.py").write_text(_BLANK_SCENE, encoding="utf-8")
        return
    source = templates_dir / template
    if not (source / "pnp.yaml").is_file():
        raise ApiError(400, "validation_error", f"Template {template!r} is not available")
    shutil.copytree(source, dest, ignore=_COPY_IGNORE)


def set_top_level_field(manifest: Path, key: str, value: str) -> None:
    """Set a top-level string field, keeping the rest of the file (and its comments) as is.

    A JSON string is a valid YAML double-quoted scalar, so json.dumps quotes it safely.
    """
    text = manifest.read_text(encoding="utf-8")
    line = f"{key}: {json.dumps(value)}"
    pattern = re.compile(rf"^{re.escape(key)}:.*$", re.MULTILINE)
    if pattern.search(text):
        text = pattern.sub(lambda _: line, text, count=1)
    else:
        text = text.rstrip("\n") + f"\n{line}\n"
    manifest.write_text(text, encoding="utf-8")
