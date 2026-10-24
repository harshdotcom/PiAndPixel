"""Real ffmpeg concat and a real two-scene Manim export (slow; run with -m render)."""

from pathlib import Path

import pytest
from core_helpers import make_testsrc
from pnp_core.compose import ComposeRequest, compose_export
from pnp_core.formats import BUILTIN_FORMATS, Quality, render_geometry
from pnp_core.probe import probe
from pnp_core.render import RenderRequest, render_scene

pytestmark = pytest.mark.render

SCENES = """\
from manim import *


class First(Scene):
    def construct(self):
        self.play(Write(Text("One")), run_time=0.5)


class Second(Scene):
    def construct(self):
        self.play(FadeIn(Text("Two")), run_time=0.5)
        self.wait(0.5)
"""


def test_real_stream_copy_concat(tmp_path: Path) -> None:
    a = make_testsrc(tmp_path / "a.mp4")
    b = make_testsrc(tmp_path / "b.mp4")
    progress: list[float] = []
    req = ComposeRequest((a, b, a), 160, 90, 15)
    result = compose_export(req, tmp_path / "work", on_progress=progress.append)
    assert result.status == "completed", result.error
    assert result.output is not None
    info = probe(result.output)
    assert (info.width, info.height, info.fps) == (160, 90, 15.0)
    assert info.duration_s == pytest.approx(3.0, abs=0.2)
    assert progress and progress[-1] == pytest.approx(100.0, abs=5)
    assert "-> #0:0 (copy)" in result.log_path.read_text()


def test_real_reencode_of_mismatched_clips(tmp_path: Path) -> None:
    a = make_testsrc(tmp_path / "a.mp4")
    b = make_testsrc(tmp_path / "b.mp4", size="320x180", fps=30)
    result = compose_export(ComposeRequest((a, b), 160, 90, 15), tmp_path / "work")
    assert result.status == "completed", result.error
    assert result.output is not None
    info = probe(result.output)
    assert (info.width, info.height, info.fps, info.pix_fmt) == (160, 90, 15.0, "yuv420p")
    assert info.duration_s == pytest.approx(2.0, abs=0.2)
    assert "libx264" in result.log_path.read_text()


def test_real_two_scene_export(tmp_path: Path) -> None:
    project = tmp_path / "proj"
    project.mkdir()
    (project / "scenes.py").write_text(SCENES)
    fmt = BUILTIN_FORMATS["landscape"]
    clips: list[Path] = []
    for name in ("First", "Second"):
        req = RenderRequest(project, f"scenes.py:{name}", fmt, Quality.DRAFT)
        result = render_scene(req, tmp_path / f"render-{name}")
        assert result.status == "completed", result.error
        assert result.output is not None
        clips.append(result.output)
    width, height, fps = render_geometry(fmt, Quality.DRAFT)
    export = compose_export(ComposeRequest(tuple(clips), width, height, fps), tmp_path / "export")
    assert export.status == "completed", export.error
    assert export.output is not None
    assert export.output == tmp_path / "export" / "export.mp4"
    info = probe(export.output)
    assert (info.width, info.height, info.fps, info.video_streams) == (width, height, fps, 1)
    assert info.duration_s == pytest.approx(1.5, abs=0.2)
    data = export.output.read_bytes()
    assert data.index(b"moov") < data.index(b"mdat")
