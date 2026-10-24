import json

from pnp_core.context import DEFAULT_THEME, build_render_context
from pnp_core.formats import BUILTIN_FORMATS, Quality


def test_context_v1_shape() -> None:
    ctx = build_render_context(
        fmt=BUILTIN_FORMATS["portrait"],
        quality=Quality.DRAFT,
        width=270,
        height=480,
        fps=15,
        params={"title": "Hi"},
        theme={"primary": "#123456"},
        brand_name="Acme",
    )
    assert ctx == {
        "v": 1,
        "format": {"name": "portrait", "width": 270, "height": 480, "fps": 15},
        "quality": "draft",
        "theme": {**DEFAULT_THEME, "primary": "#123456"},
        "params": {"title": "Hi"},
        "brand_name": "Acme",
    }
    json.dumps(ctx)


def test_context_defaults() -> None:
    ctx = build_render_context(
        fmt=BUILTIN_FORMATS["landscape"],
        quality=Quality.FINAL,
        width=1920,
        height=1080,
        fps=30,
        params={},
    )
    assert ctx["theme"] == DEFAULT_THEME
    assert ctx["brand_name"] is None
    assert ctx["quality"] == "final"


def test_default_theme_values() -> None:
    assert DEFAULT_THEME == {
        "background": "#000000",
        "primary": "#58C4DD",
        "secondary": "#FC6255",
        "accent": "#FFFF00",
        "text": "#FFFFFF",
        "font": "",
    }
