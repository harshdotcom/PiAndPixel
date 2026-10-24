import pytest
from pnp_core.errors import ManifestError
from pnp_core.formats import (
    BUILTIN_FORMATS,
    FPS_CHOICES,
    RESOLUTIONS,
    Format,
    Quality,
    output_geometry,
    quality_for,
    render_geometry,
    resolve_output,
)

# (format, resolution) -> (width, height); 2160p portrait/landscape hit the 3840 cap exactly.
SIZES = {
    ("landscape", "480p"): (854, 480),
    ("landscape", "720p"): (1280, 720),
    ("landscape", "1080p"): (1920, 1080),
    ("landscape", "1440p"): (2560, 1440),
    ("landscape", "2160p"): (3840, 2160),
    ("portrait", "480p"): (480, 854),
    ("portrait", "720p"): (720, 1280),
    ("portrait", "1080p"): (1080, 1920),
    ("portrait", "1440p"): (1440, 2560),
    ("portrait", "2160p"): (2160, 3840),
    ("square", "480p"): (480, 480),
    ("square", "720p"): (720, 720),
    ("square", "1080p"): (1080, 1080),
    ("square", "1440p"): (1440, 1440),
    ("square", "2160p"): (2160, 2160),
}


def test_every_format_and_resolution_is_covered() -> None:
    assert set(SIZES) == {(f, r) for f in BUILTIN_FORMATS for r in RESOLUTIONS}


@pytest.mark.parametrize(("name", "resolution"), list(SIZES))
@pytest.mark.parametrize("fps", FPS_CHOICES)
def test_output_geometry(name: str, resolution: str, fps: int) -> None:
    assert output_geometry(BUILTIN_FORMATS[name], resolution, fps) == (
        *SIZES[(name, resolution)],
        fps,
    )


def test_long_edge_rounds_to_the_nearest_even_number() -> None:
    # 480 * 16/9 = 853.33 -> 854; 480 * 4/3 = 640 exactly; 720 * 1.4 = 1008 exactly.
    assert output_geometry(Format("w", 1600, 1200), "480p", 30) == (640, 480, 30)
    # 480 * 1001/1000 = 480.48 -> 480; 480 * 1003/1000 = 481.44 -> 482 (odd 481 is never used).
    assert output_geometry(Format("a", 1001, 1000), "480p", 30) == (480, 480, 30)
    assert output_geometry(Format("b", 1000, 1003), "480p", 30) == (480, 482, 30)
    # 720 * 1005/1000 = 723.6 -> 724 (nearest even, not floor).
    assert output_geometry(Format("c", 1005, 1000), "720p", 24) == (724, 720, 24)


def test_long_edge_cap_is_3840() -> None:
    wide = Format("wide", 2400, 1000)  # 2.4:1
    assert output_geometry(wide, "1440p", 30) == (3456, 1440, 30)
    with pytest.raises(ManifestError, match="3840"):
        output_geometry(wide, "2160p", 30)  # 5184 px long edge


@pytest.mark.parametrize(
    ("resolution", "fps"), [("4k", 30), ("720", 30), ("720p", 25), ("720p", 0)]
)
def test_rejects_unknown_resolution_or_fps(resolution: str, fps: int) -> None:
    with pytest.raises(ManifestError):
        output_geometry(BUILTIN_FORMATS["landscape"], resolution, fps)


QUALITY_GEOMETRY = {
    ("landscape", Quality.DRAFT): (854, 480, 15),
    ("landscape", Quality.PREVIEW): (1280, 720, 30),
    ("landscape", Quality.FINAL): (1920, 1080, 30),
    ("portrait", Quality.DRAFT): (480, 854, 15),
    ("portrait", Quality.PREVIEW): (720, 1280, 30),
    ("portrait", Quality.FINAL): (1080, 1920, 30),
    ("square", Quality.DRAFT): (480, 480, 15),
    ("square", Quality.PREVIEW): (720, 720, 30),
    ("square", Quality.FINAL): (1080, 1080, 30),
}


@pytest.mark.parametrize(("name", "quality"), list(QUALITY_GEOMETRY))
def test_quality_presets(name: str, quality: Quality) -> None:
    assert render_geometry(BUILTIN_FORMATS[name], quality) == QUALITY_GEOMETRY[(name, quality)]


def test_final_uses_the_format_fps() -> None:
    assert render_geometry(Format("cine", 1920, 1080, fps=25), Quality.FINAL) == (1920, 1080, 25)
    assert render_geometry(Format("cine", 1920, 1080, fps=25), Quality.PREVIEW)[2] == 30


def test_explicit_choices_win_over_quality() -> None:
    fmt = BUILTIN_FORMATS["portrait"]
    out = resolve_output(fmt, quality=Quality.FINAL, resolution="720p", fps=24)
    assert (out.quality, out.resolution, out.geometry) == (Quality.FINAL, "720p", (720, 1280, 24))
    # Only fps given: the resolution comes from the preset (draft by default).
    assert resolve_output(fmt, fps=60).geometry == (480, 854, 60)
    # Only resolution given: fps from the preset its quality label maps to.
    out = resolve_output(fmt, resolution="1080p")
    assert (out.quality, out.geometry) == (Quality.FINAL, (1080, 1920, 30))
    with pytest.raises(ManifestError):
        resolve_output(fmt, fps=25)


def test_quality_for_resolution() -> None:
    assert [quality_for(r) for r in RESOLUTIONS] == [
        Quality.DRAFT, Quality.PREVIEW, Quality.FINAL, Quality.FINAL, Quality.FINAL,
    ]  # fmt: skip


def test_builtin_formats() -> None:
    assert {n: (f.width, f.height, f.fps) for n, f in BUILTIN_FORMATS.items()} == {
        "landscape": (1920, 1080, 30),
        "portrait": (1080, 1920, 30),
        "square": (1080, 1080, 30),
    }


def test_format_properties() -> None:
    assert BUILTIN_FORMATS["portrait"].is_portrait
    assert not BUILTIN_FORMATS["square"].is_portrait
    assert BUILTIN_FORMATS["landscape"].aspect == pytest.approx(16 / 9)


def test_quality_values() -> None:
    assert [q.value for q in Quality] == ["draft", "preview", "final"]
