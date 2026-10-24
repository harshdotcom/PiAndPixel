"""Read-only render context for Manim scenes.

The Agent writes a JSON file per render and passes its path in PNP_RENDER_CONTEXT.
Without it (plain `manim` CLI) every value falls back to a sensible default, so
scenes always stay runnable as ordinary Manim code.
"""

from __future__ import annotations

import json
import os
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any

DEFAULT_THEME: dict[str, str] = {
    "background": "#000000",
    "primary": "#58C4DD",
    "secondary": "#FC6255",
    "accent": "#FFFF00",
    "text": "#FFFFFF",
    "font": "",
}


@dataclass(frozen=True)
class Format:
    name: str
    width: int
    height: int
    fps: int

    @property
    def is_portrait(self) -> bool:
        return self.height > self.width

    @property
    def is_square(self) -> bool:
        return self.height == self.width

    @property
    def aspect(self) -> float:
        return self.width / self.height


DEFAULT_FORMAT = Format(name="landscape", width=1920, height=1080, fps=30)


class Theme(Mapping[str, str]):
    """Theme colours, readable as `theme.primary` or `theme["primary"]`."""

    __slots__ = ("_values",)
    _values: Mapping[str, str]

    def __init__(self, values: Mapping[str, str]) -> None:
        object.__setattr__(self, "_values", MappingProxyType(dict(values)))

    def __getattr__(self, name: str) -> str:
        try:
            return self._values[name]
        except KeyError:
            raise AttributeError(f"theme has no entry {name!r}") from None

    def __setattr__(self, name: str, value: object) -> None:
        raise AttributeError("theme is read-only")

    def __getitem__(self, key: str) -> str:
        return self._values[key]

    def __iter__(self) -> Iterator[str]:
        return iter(self._values)

    def __len__(self) -> int:
        return len(self._values)

    def __repr__(self) -> str:
        return f"Theme({dict(self._values)!r})"


@dataclass(frozen=True)
class RenderContext:
    format: Format
    theme: Theme
    params: Mapping[str, Any]
    quality: str
    brand_name: str | None


def _default_context() -> RenderContext:
    return RenderContext(
        format=DEFAULT_FORMAT,
        theme=Theme(DEFAULT_THEME),
        params=MappingProxyType({}),
        quality="preview",
        brand_name=None,
    )


def _require(data: Mapping[str, Any], key: str, kind: type) -> Any:
    value = data.get(key)
    # bool is an int subclass; a width of `true` is still a broken context.
    if not isinstance(value, kind) or (kind is int and isinstance(value, bool)):
        raise ValueError(f"'{key}' must be {kind.__name__}")
    return value


def _parse(data: Any) -> RenderContext:
    if not isinstance(data, dict):
        raise ValueError("top level must be a JSON object")
    raw: dict[str, Any] = data  # pyright: ignore[reportUnknownVariableType]
    if raw.get("v") != 1:
        raise ValueError(f"unsupported context version {raw.get('v')!r}")
    fmt_raw = _require(raw, "format", dict)
    fmt = Format(
        name=_require(fmt_raw, "name", str),
        width=_require(fmt_raw, "width", int),
        height=_require(fmt_raw, "height", int),
        fps=_require(fmt_raw, "fps", int),
    )
    if fmt.width <= 0 or fmt.height <= 0 or fmt.fps <= 0:
        raise ValueError("format width, height and fps must be positive")
    theme_raw: dict[str, Any] = raw.get("theme") or {}
    if not all(isinstance(v, str) for v in theme_raw.values()):
        raise ValueError("theme values must be strings")
    brand = raw.get("brand_name")
    if brand is not None and not isinstance(brand, str):
        raise ValueError("'brand_name' must be a string or null")
    return RenderContext(
        format=fmt,
        theme=Theme({**DEFAULT_THEME, **theme_raw}),
        params=MappingProxyType(dict(raw.get("params") or {})),
        quality=_require(raw, "quality", str),
        brand_name=brand,
    )


def load_context(path: str | None) -> RenderContext:
    """Load a render context file; None means defaults (plain Manim run)."""
    if path is None:
        return _default_context()
    # A broken context must fail loudly: silently rendering with defaults would
    # produce a wrong-format video that still passes as "completed".
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        return _parse(data)
    except (OSError, ValueError, TypeError) as exc:
        raise RuntimeError(f"pnp: cannot load render context {path!r}: {exc}") from exc


ctx = load_context(os.environ.get("PNP_RENDER_CONTEXT") or None)
