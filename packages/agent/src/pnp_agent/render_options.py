"""The output choices a render or export request may make: resolution, fps or a quality preset."""

from typing import Any

from pnp_core.formats import (
    FPS_CHOICES,
    MAX_LONG_EDGE,
    QUALITY_PRESETS,
    RESOLUTIONS,
    Format,
    Output,
    Quality,
    resolve_output,
)
from pydantic import BaseModel, ConfigDict, field_validator

DEFAULT_RESOLUTION, DEFAULT_FPS = QUALITY_PRESETS[Quality.DRAFT]


class OutputFields(BaseModel):
    """Body fields shared by renders and exports. resolution/fps win over quality."""

    model_config = ConfigDict(extra="forbid")
    quality: Quality | None = None
    resolution: str | None = None
    fps: int | None = None

    @field_validator("resolution")
    @classmethod
    def _known_resolution(cls, value: str | None) -> str | None:
        if value is not None and value not in RESOLUTIONS:
            raise ValueError(f"resolution must be one of {', '.join(RESOLUTIONS)}")
        return value

    @field_validator("fps")
    @classmethod
    def _known_fps(cls, value: int | None) -> int | None:
        if value is not None and value not in FPS_CHOICES:
            raise ValueError(f"fps must be one of {', '.join(map(str, FPS_CHOICES))}")
        return value

    def output(self, fmt: Format, default: Quality) -> Output:
        """Raises ManifestError (422) when the resolution is too large for this format."""
        quality = self.quality
        if quality is None and self.resolution is None:
            quality = default
        return resolve_output(fmt, quality=quality, resolution=self.resolution, fps=self.fps)


def output_request(out: Output) -> dict[str, Any]:
    """The output fields every job request and artifact meta records."""
    return {"quality": out.quality.value, "resolution": out.resolution, "fps": out.fps,
            "width": out.width, "height": out.height}  # fmt: skip


def render_options() -> dict[str, Any]:
    """What the Studio offers, so it does not hard-code the lists (GET /api/v1/agent)."""
    return {
        "resolutions": [{"id": name, "short_edge": px} for name, px in RESOLUTIONS.items()],
        "fps": list(FPS_CHOICES),
        "max_long_edge": MAX_LONG_EDGE,
        "default": {"resolution": DEFAULT_RESOLUTION, "fps": DEFAULT_FPS},
    }
