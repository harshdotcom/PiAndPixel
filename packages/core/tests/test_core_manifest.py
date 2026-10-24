from pathlib import Path

import pytest
from pnp_core.errors import ManifestError
from pnp_core.formats import BUILTIN_FORMATS, Format, Quality
from pnp_core.manifest import (
    Clip,
    Composition,
    load_manifest,
    parse_manifest,
    parse_scene_ref,
    replace_compositions,
)

VALID = """\
pnp: 1
name: Pythagoras explainer
description: "Visual proof"
engine: { name: manim }
defaults: { fps: 24, quality: draft }
formats:
  story: { width: 720, height: 1280 }
  wide: { width: 2560, height: 1080, fps: 60 }
compositions:
  main:
    title: Main
    clips:
      - scene: scenes/intro.py:Intro
      - { scene: "scenes/proof.py:Proof", params: { title: Hi } }
"""


def write(tmp_path: Path, text: str) -> Path:
    (tmp_path / "pnp.yaml").write_text(text, encoding="utf-8")
    return tmp_path


def test_loads_valid_manifest(tmp_path: Path) -> None:
    m = load_manifest(write(tmp_path, VALID))
    assert m.name == "Pythagoras explainer"
    assert m.defaults.quality is Quality.DRAFT
    assert m.compositions["main"].clips[1].params == {"title": "Hi"}
    formats = m.all_formats()
    assert formats["story"] == Format("story", 720, 1280, 24)
    assert formats["wide"] == Format("wide", 2560, 1080, 60)
    assert formats["landscape"] == BUILTIN_FORMATS["landscape"]


def test_minimal_manifest_defaults(tmp_path: Path) -> None:
    m = load_manifest(write(tmp_path, "pnp: 1\nname: x\n"))
    assert m.engine.name == "manim"
    assert m.defaults.quality is Quality.PREVIEW
    assert m.all_formats() == BUILTIN_FORMATS


@pytest.mark.parametrize(
    ("text", "fragment"),
    [
        ("pnp: 1\nname: x\ncolour: red\n", "colour"),
        ("pnp: 1\nname: x\nengine: { name: manim, extra: 1 }\n", "engine.extra"),
        ("pnp: 1\nname: x\ncompositions: { m: { clips: [ {scene: 'proof.py'} ] } }\n", "scene"),
        ("pnp: 1\nname: x\ncompositions: { m: { clips: [ {scene: '../a.py:A'} ] } }\n", "scene"),
        ("pnp: 1\nname: x\ncompositions: { m: { clips: [] } }\n", "compositions.m.clips"),
        ("pnp: 1\nname: x\nformats: { f: { width: 721, height: 1280 } }\n", "formats.f"),
        ("pnp: 1\nname: x\nformats: { f: { width: 0, height: 1280 } }\n", "formats.f"),
        ("pnp: 1\nname: x\nformats: { f: { width: 4000, height: 1280 } }\n", "formats.f"),
        ("pnp: 2\nname: x\n", "pnp"),
        ("pnp: 1\nname: ''\n", "name"),
        ("name: x\n", "pnp"),
    ],
)
def test_invalid_manifest_reports_field(tmp_path: Path, text: str, fragment: str) -> None:
    with pytest.raises(ManifestError) as info:
        load_manifest(write(tmp_path, text))
    assert fragment in str(info.value)
    assert info.value.code == "validation_error"


@pytest.mark.parametrize("text", ["pnp: [1\n", "- just a list\n", ""])
def test_unparseable_manifest(tmp_path: Path, text: str) -> None:
    with pytest.raises(ManifestError):
        load_manifest(write(tmp_path, text))


def test_missing_manifest(tmp_path: Path) -> None:
    with pytest.raises(ManifestError, match="not found"):
        load_manifest(tmp_path)


def test_parse_scene_ref() -> None:
    assert parse_scene_ref("scenes/proof.py:Proof") == ("scenes/proof.py", "Proof")
    assert parse_scene_ref("main.py:_Main2") == ("main.py", "_Main2")


@pytest.mark.parametrize(
    "ref",
    [
        "scenes/proof.py",
        ":Proof",
        "scenes/proof.txt:Proof",
        "/abs/proof.py:Proof",
        "../proof.py:Proof",
        "a/../proof.py:Proof",
        "scenes\\proof.py:Proof",
        "proof.py:2Bad",
        "proof.py:Has-Dash",
        "proof.py:",
    ],
)
def test_parse_scene_ref_rejects(ref: str) -> None:
    with pytest.raises(ManifestError):
        parse_scene_ref(ref)


def test_replace_compositions_keeps_other_keys() -> None:
    text = "pnp: 1\nname: Demo\nformats: { wide: { width: 640, height: 360 } }\ncompositions: {}\n"
    comps = {"main": Composition(clips=[Clip(scene="scenes/a.py:A", params={"x": 1})])}
    manifest = parse_manifest(replace_compositions(text, comps))
    assert manifest.name == "Demo"
    assert manifest.formats["wide"].width == 640
    assert manifest.compositions["main"].clips[0].params == {"x": 1}
    assert manifest.compositions["main"].title is None
