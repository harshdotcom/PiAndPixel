"""The pnp.yaml project manifest."""

from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from pnp_core.errors import ManifestError
from pnp_core.formats import BUILTIN_FORMATS, Format, Quality

MANIFEST_FILE = "pnp.yaml"
_MAX_EDGE = 3840


def parse_scene_ref(ref: str) -> tuple[str, str]:
    """Split "scenes/proof.py:Proof" into ("scenes/proof.py", "Proof")."""
    file, sep, class_name = ref.rpartition(":")
    if not sep or not file:
        raise ManifestError(f"scene ref {ref!r} must look like 'path/file.py:ClassName'")
    if not file.endswith(".py"):
        raise ManifestError(f"scene file {file!r} must end in .py")
    if file.startswith("/") or "\\" in file or ".." in file.split("/"):
        raise ManifestError(f"scene file {file!r} must be a plain relative path")
    if not class_name.isidentifier():
        raise ManifestError(f"scene class {class_name!r} is not a valid Python identifier")
    return file, class_name


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Clip(_Model):
    scene: str
    params: dict[str, Any] = {}

    @field_validator("scene")
    @classmethod
    def _check_scene(cls, value: str) -> str:
        try:
            parse_scene_ref(value)
        except ManifestError as exc:
            raise ValueError(str(exc)) from None
        return value


class Composition(_Model):
    title: str | None = None
    clips: list[Clip] = Field(min_length=1)


class EngineSpec(_Model):
    name: Literal["manim"] = "manim"
    version: str | None = None


class Defaults(_Model):
    fps: int = 30
    quality: Quality = Quality.PREVIEW


class FormatSpec(_Model):
    width: int
    height: int
    fps: int | None = None

    @model_validator(mode="after")
    def _check_size(self) -> "FormatSpec":
        for value in (self.width, self.height):
            if value <= 0 or value % 2:
                raise ValueError("width and height must be positive even numbers")
        if max(self.width, self.height) > _MAX_EDGE:
            raise ValueError(f"the long edge must be at most {_MAX_EDGE} pixels")
        return self


class Manifest(_Model):
    pnp: Literal[1]
    name: str = Field(min_length=1)
    description: str = ""
    engine: EngineSpec = EngineSpec()
    defaults: Defaults = Defaults()
    formats: dict[str, FormatSpec] = {}
    compositions: dict[str, Composition] = {}

    def all_formats(self) -> dict[str, Format]:
        formats = dict(BUILTIN_FORMATS)
        for name, spec in self.formats.items():
            fps = spec.fps if spec.fps is not None else self.defaults.fps
            formats[name] = Format(name, spec.width, spec.height, fps)
        return formats


def _describe(exc: ValidationError) -> str:
    first = exc.errors()[0]
    where = ".".join(str(part) for part in first["loc"]) or "(root)"
    extra = f" (+{exc.error_count() - 1} more)" if exc.error_count() > 1 else ""
    return f"{MANIFEST_FILE}: {where}: {first['msg']}{extra}"


def parse_manifest(text: str) -> Manifest:
    """Validate pnp.yaml text; raises ManifestError with a readable message."""
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise ManifestError(f"{MANIFEST_FILE} is not valid YAML: {exc}") from None
    if not isinstance(data, dict):
        raise ManifestError(f"{MANIFEST_FILE} must be a mapping at the top level")
    try:
        return Manifest.model_validate(data)
    except ValidationError as exc:
        raise ManifestError(_describe(exc)) from None


def load_manifest(project_root: Path) -> Manifest:
    path = project_root / MANIFEST_FILE
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise ManifestError(f"{MANIFEST_FILE} not found in {project_root.name}") from None
    except (OSError, UnicodeDecodeError) as exc:
        raise ManifestError(f"cannot read {MANIFEST_FILE}: {exc}") from None
    return parse_manifest(text)


def replace_compositions(text: str, compositions: dict[str, Composition]) -> str:
    """Return pnp.yaml text with its compositions replaced and every other key kept.

    The file is re-serialised, so YAML comments are not preserved. The result is validated
    (raises ManifestError), so an invalid manifest is never produced.
    """
    data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise ManifestError(f"{MANIFEST_FILE} must be a mapping at the top level")
    data["compositions"] = {
        name: comp.model_dump(exclude_none=True) for name, comp in compositions.items()
    }
    new_text = yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    parse_manifest(new_text)
    return new_text
