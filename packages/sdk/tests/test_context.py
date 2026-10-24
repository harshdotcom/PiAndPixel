import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import pnp
import pytest
from pnp.context import DEFAULT_THEME, Format, load_context


def _write(tmp_path: Path, data: Any) -> str:
    path = tmp_path / "ctx.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return str(path)


def _portrait_ctx(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "v": 1,
        "format": {"name": "portrait", "width": 270, "height": 480, "fps": 15},
        "quality": "draft",
        "theme": {"primary": "#123456"},
        "params": {"title": "Hello"},
        "brand_name": "acme",
    }
    data.update(overrides)
    return data


def test_defaults_without_context_file() -> None:
    ctx = load_context(None)
    assert (ctx.format.name, ctx.format.width, ctx.format.height, ctx.format.fps) == (
        "landscape",
        1920,
        1080,
        30,
    )
    assert not ctx.format.is_portrait
    assert ctx.quality == "preview"
    assert dict(ctx.theme) == DEFAULT_THEME
    assert dict(ctx.params) == {}
    assert ctx.brand_name is None


def test_module_ctx_uses_defaults_when_env_unset() -> None:
    code = "import pnp; print(pnp.ctx.format.name, pnp.__version__)"
    env = {"PATH": "", "PYTHONPATH": str(Path(pnp.__file__).parent.parent)}
    out = subprocess.run(
        [sys.executable, "-c", code], env=env, capture_output=True, text=True, check=True
    )
    assert out.stdout.split() == ["landscape", "0.1.0"]


def test_loads_context_file(tmp_path: Path) -> None:
    ctx = load_context(_write(tmp_path, _portrait_ctx()))
    assert ctx.format.name == "portrait"
    assert (ctx.format.width, ctx.format.height, ctx.format.fps) == (270, 480, 15)
    assert ctx.quality == "draft"
    assert ctx.params["title"] == "Hello"
    assert ctx.brand_name == "acme"


def test_theme_merges_defaults_and_supports_attribute_and_item_access(tmp_path: Path) -> None:
    ctx = load_context(_write(tmp_path, _portrait_ctx()))
    assert ctx.theme.primary == ctx.theme["primary"] == "#123456"
    assert ctx.theme.background == DEFAULT_THEME["background"]
    with pytest.raises(AttributeError):
        _ = ctx.theme.missing
    with pytest.raises(AttributeError):
        ctx.theme.primary = "#000000"  # type: ignore[misc]


def test_params_are_read_only(tmp_path: Path) -> None:
    ctx = load_context(_write(tmp_path, _portrait_ctx()))
    with pytest.raises(TypeError):
        ctx.params["title"] = "changed"  # type: ignore[index]
    with pytest.raises(AttributeError):
        ctx.quality = "final"  # type: ignore[misc]


def test_format_shape_helpers() -> None:
    portrait = Format("portrait", 1080, 1920, 30)
    square = Format("square", 1080, 1080, 30)
    landscape = Format("landscape", 1920, 1080, 30)
    assert portrait.is_portrait and not portrait.is_square
    assert square.is_square and not square.is_portrait
    assert not landscape.is_portrait
    assert portrait.aspect == pytest.approx(0.5625)


def test_missing_file_raises(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="cannot load render context"):
        load_context(str(tmp_path / "nope.json"))


@pytest.mark.parametrize(
    "content",
    [
        "{not json",
        "[]",
        json.dumps(_portrait_ctx(v=2)),
        json.dumps(_portrait_ctx(format={"name": "x", "width": "1", "height": 2, "fps": 1})),
        json.dumps(_portrait_ctx(quality=None)),
    ],
)
def test_invalid_file_raises(tmp_path: Path, content: str) -> None:
    path = tmp_path / "ctx.json"
    path.write_text(content, encoding="utf-8")
    with pytest.raises(RuntimeError):
        load_context(str(path))
