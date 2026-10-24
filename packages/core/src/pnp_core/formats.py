"""Output formats and the pixel geometry a render uses (resolution x fps, or a quality preset)."""

from dataclasses import dataclass
from enum import StrEnum

from pnp_core.errors import ManifestError


class Quality(StrEnum):
    DRAFT = "draft"
    PREVIEW = "preview"
    FINAL = "final"


@dataclass(frozen=True)
class Format:
    name: str
    width: int
    height: int
    fps: int = 30

    @property
    def is_portrait(self) -> bool:
        return self.height > self.width

    @property
    def aspect(self) -> float:
        return self.width / self.height


BUILTIN_FORMATS: dict[str, Format] = {
    "landscape": Format("landscape", 1920, 1080),
    "portrait": Format("portrait", 1080, 1920),
    "square": Format("square", 1080, 1080),
}

# Resolution name -> short edge in pixels.
RESOLUTIONS: dict[str, int] = {
    "480p": 480,
    "720p": 720,
    "1080p": 1080,
    "1440p": 1440,
    "2160p": 2160,
}
FPS_CHOICES: tuple[int, ...] = (15, 24, 30, 60)
MAX_LONG_EDGE = 3840

# Quality -> (resolution, fps); fps None means the format's own fps.
QUALITY_PRESETS: dict[Quality, tuple[str, int | None]] = {
    Quality.DRAFT: ("480p", 15),
    Quality.PREVIEW: ("720p", 30),
    Quality.FINAL: ("1080p", None),
}


@dataclass(frozen=True)
class Output:
    """What one render really produces, after presets and explicit choices are combined."""

    quality: Quality
    resolution: str
    fps: int
    width: int
    height: int

    @property
    def geometry(self) -> tuple[int, int, int]:
        return self.width, self.height, self.fps


def _scaled_size(fmt: Format, resolution: str) -> tuple[int, int]:
    if resolution not in RESOLUTIONS:
        raise ManifestError(f"Unknown resolution {resolution!r} (known: {', '.join(RESOLUTIONS)})")
    short_px = RESOLUTIONS[resolution]
    short, long = sorted((fmt.width, fmt.height))
    # Long edge rounded to the nearest even number (yuv420p needs even sizes), in integers.
    long_px = 2 * ((short_px * long + short) // (2 * short))
    if long_px > MAX_LONG_EDGE:
        raise ManifestError(
            f"{resolution} is too large for format {fmt.name!r}: its long edge would be "
            f"{long_px} px (at most {MAX_LONG_EDGE})"
        )
    return (short_px, long_px) if fmt.is_portrait else (long_px, short_px)


def _check_fps(fps: int) -> None:
    if fps not in FPS_CHOICES:
        raise ManifestError(
            f"Unsupported fps {fps} (choose one of {', '.join(map(str, FPS_CHOICES))})"
        )


def output_geometry(fmt: Format, resolution: str, fps: int) -> tuple[int, int, int]:
    """(width, height, fps) for this format with its short edge at `resolution`."""
    _check_fps(fps)
    return (*_scaled_size(fmt, resolution), fps)


def quality_for(resolution: str) -> Quality:
    """The quality label scenes see (ctx.quality) for an explicitly chosen resolution."""
    short_px = RESOLUTIONS.get(resolution, 0)
    if short_px >= RESOLUTIONS["1080p"]:
        return Quality.FINAL
    return Quality.PREVIEW if short_px >= RESOLUTIONS["720p"] else Quality.DRAFT


def resolve_output(
    fmt: Format,
    *,
    quality: Quality | None = None,
    resolution: str | None = None,
    fps: int | None = None,
) -> Output:
    """Explicit resolution/fps win over the quality preset; with neither, quality is draft."""
    if quality is None:
        quality = quality_for(resolution) if resolution else Quality.DRAFT
    preset_resolution, preset_fps = QUALITY_PRESETS[quality]
    if fps is not None:
        _check_fps(fps)
    resolution = resolution or preset_resolution
    rate = fps or preset_fps or fmt.fps
    width, height = _scaled_size(fmt, resolution)
    return Output(quality, resolution, rate, width, height)


def render_geometry(fmt: Format, quality: Quality) -> tuple[int, int, int]:
    """(width, height, fps) of a quality preset: draft 480p@15, preview 720p@30, final 1080p."""
    return resolve_output(fmt, quality=quality).geometry
