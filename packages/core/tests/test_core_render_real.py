"""One real Manim render at draft quality (slow; run with -m render)."""

from pathlib import Path

import pytest
from pnp_core.formats import BUILTIN_FORMATS, Quality, render_geometry
from pnp_core.probe import check_clip, probe
from pnp_core.render import RenderRequest, render_scene

# Imports pnp to prove the sdk staged on PYTHONPATH is importable inside the render.
SCENE = """\
import pnp
from manim import *


class Hello(Scene):
    def construct(self):
        self.play(Write(Text("Pi & Pixel")), run_time=0.5)
        self.wait(0.5)
"""


@pytest.mark.render
def test_real_draft_render(tmp_path: Path) -> None:
    project = tmp_path / "proj"
    (project / "scenes").mkdir(parents=True)
    (project / "scenes" / "hello.py").write_text(SCENE)
    fmt = BUILTIN_FORMATS["landscape"]
    req = RenderRequest(project, "scenes/hello.py:Hello", fmt, Quality.DRAFT)
    lines: list[str] = []
    result = render_scene(req, tmp_path / "work", on_line=lines.append)
    assert result.status == "completed", result.error
    assert result.output is not None
    width, height, fps = render_geometry(fmt, Quality.DRAFT)
    info = probe(result.output)
    assert check_clip(info, width=width, height=height, fps=fps) == []
    assert any("Partial movie file written" in line for line in lines)


FRAME_SCENE = """\
from manim import *


class Frame(Scene):
    def construct(self):
        print(f"FRAME {config.frame_width:.3f}x{config.frame_height:.3f}", flush=True)
        self.play(FadeIn(Square()), run_time=0.2)
"""


@pytest.mark.render
def test_real_portrait_render_keeps_square_pixels(tmp_path: Path) -> None:
    project = tmp_path / "proj"
    project.mkdir()
    (project / "frame.py").write_text(FRAME_SCENE)
    req = RenderRequest(project, "frame.py:Frame", BUILTIN_FORMATS["portrait"], Quality.DRAFT)
    lines: list[str] = []
    result = render_scene(req, tmp_path / "work", on_line=lines.append)
    assert result.status == "completed", result.error
    # Draft portrait is 480x854: the frame width follows the rounded size, so pixels stay square.
    assert f"FRAME {8 * 480 / 854:.3f}x8.000" in lines


@pytest.mark.render
def test_real_portrait_720p_at_24fps(tmp_path: Path) -> None:
    project = tmp_path / "proj"
    project.mkdir()
    (project / "frame.py").write_text(FRAME_SCENE)
    fmt = BUILTIN_FORMATS["portrait"]
    req = RenderRequest(project, "frame.py:Frame", fmt, Quality.DRAFT, resolution="720p", fps=24)
    result = render_scene(req, tmp_path / "work")
    assert result.status == "completed", result.error
    assert result.output is not None
    info = probe(result.output)
    assert (info.width, info.height, info.fps) == (720, 1280, 24.0)
    assert check_clip(info, width=720, height=1280, fps=24) == []
