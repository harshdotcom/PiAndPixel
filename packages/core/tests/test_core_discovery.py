from pathlib import Path

from pnp_core.discovery import DiscoveryError, SceneInfo, discover_scenes


def put(root: Path, rel: str, text: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


SCENES = """\
import manim
from manim import *


class Helper:
    pass


class Intro(Scene):
    pass


class Moving(manim.MovingCameraScene):
    pass


class Base(Scene):
    pass


class Child(Base):
    pass


class GrandChild(Child):
    pass


class NotAScene(Helper):
    pass
"""


def test_finds_scenes_and_subclass_chains(tmp_path: Path) -> None:
    put(tmp_path, "scenes/a.py", SCENES)
    scenes, errors = discover_scenes(tmp_path)
    assert errors == []
    assert [(s.class_name, s.line) for s in scenes] == [
        ("Intro", 9),
        ("Moving", 13),
        ("Base", 17),
        ("Child", 21),
        ("GrandChild", 25),
    ]
    assert scenes[0] == SceneInfo("scenes/a.py", "Intro", 9)
    assert scenes[0].ref == "scenes/a.py:Intro"


def test_chain_only_counts_earlier_classes(tmp_path: Path) -> None:
    put(tmp_path, "a.py", "class Early(Late):\n    pass\n\nclass Late(Scene):\n    pass\n")
    scenes, _ = discover_scenes(tmp_path)
    assert [s.class_name for s in scenes] == ["Late"]


def test_syntax_error_reported_with_line(tmp_path: Path) -> None:
    put(tmp_path, "good.py", "class A(Scene):\n    pass\n")
    put(tmp_path, "bad.py", "x = 1\n\ndef broken(:\n    pass\n")
    scenes, errors = discover_scenes(tmp_path)
    assert [s.ref for s in scenes] == ["good.py:A"]
    assert len(errors) == 1
    error = errors[0]
    assert isinstance(error, DiscoveryError)
    assert (error.file, error.line) == ("bad.py", 3)
    assert "SyntaxError" in error.message


def test_skips_hidden_and_generated_dirs(tmp_path: Path) -> None:
    for rel in [".pnp/a.py", ".git/b.py", ".venv/c.py", "__pycache__/d.py", "media/e.py"]:
        put(tmp_path, rel, "class X(Scene):\n    pass\n")
    put(tmp_path, "scenes/notes.txt", "class Y(Scene): pass")
    assert discover_scenes(tmp_path) == ([], [])


def test_results_sorted_by_file_then_line(tmp_path: Path) -> None:
    put(tmp_path, "b.py", "class B1(Scene):\n    pass\n")
    put(tmp_path, "a/z.py", "\n\nclass Z2(Scene):\n    pass\nclass Z1(Scene):\n    pass\n")
    scenes, _ = discover_scenes(tmp_path)
    assert [s.ref for s in scenes] == ["a/z.py:Z2", "a/z.py:Z1", "b.py:B1"]


def test_does_not_execute_code(tmp_path: Path) -> None:
    marker = tmp_path / "executed"
    put(tmp_path, "evil.py", f"open({str(marker)!r}, 'w')\nclass S(Scene):\n    pass\n")
    scenes, _ = discover_scenes(tmp_path)
    assert [s.class_name for s in scenes] == ["S"]
    assert not marker.exists()
