"""The render context JSON handed to scenes through PNP_RENDER_CONTEXT."""

from collections.abc import Mapping
from typing import Any

from pnp_core.formats import Format, Quality

# Must stay identical to pnp.context.DEFAULT_THEME in the sdk.
DEFAULT_THEME: dict[str, str] = {
    "background": "#000000",
    "primary": "#58C4DD",
    "secondary": "#FC6255",
    "accent": "#FFFF00",
    "text": "#FFFFFF",
    "font": "",
}


def build_render_context(
    *,
    fmt: Format,
    quality: Quality,
    width: int,
    height: int,
    fps: int,
    params: Mapping[str, Any],
    theme: Mapping[str, str] | None = None,
    brand_name: str | None = None,
) -> dict[str, Any]:
    """Build context JSON v1. width/height/fps are the actual render values, not the format's."""
    return {
        "v": 1,
        "format": {"name": fmt.name, "width": width, "height": height, "fps": fps},
        "quality": quality.value,
        "theme": {**DEFAULT_THEME, **(theme or {})},
        "params": dict(params),
        "brand_name": brand_name,
    }
