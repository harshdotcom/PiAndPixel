"""Project routes: templates, listing, creation, details and scene discovery."""

import hashlib
import re
import shutil
import unicodedata
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Request
from pnp_core.discovery import discover_scenes
from pnp_core.errors import ManifestError
from pnp_core.manifest import load_manifest
from pydantic import BaseModel, ConfigDict, Field

from pnp_agent.errors import ApiError
from pnp_agent.settings import Settings
from pnp_agent.templates import list_templates, set_top_level_field, write_template
from pnp_agent.workspace import MANIFEST, project_dirs, resolve_project

router = APIRouter(prefix="/api/v1")

_MAX_SLUG = 48


class CreateProject(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=64)
    template: Literal["pythagoras", "blank"]
    description: str | None = None


def slugify(name: str) -> str:
    """Folder id for a project name. Accents are dropped; names in other scripts get a hash id."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")[:_MAX_SLUG].strip("-")
    if not slug and any(ch.isalnum() for ch in name):
        slug = "project-" + hashlib.sha256(name.encode()).hexdigest()[:8]
    return slug


def _settings(request: Request) -> Settings:
    return request.app.state.settings


def project_summary(root: Path) -> dict[str, Any]:
    try:
        manifest = load_manifest(root)
    except ManifestError as exc:
        return {"id": root.name, "name": root.name, "description": "", "error": str(exc)}
    return {
        "id": root.name,
        "name": manifest.name,
        "description": manifest.description,
        "error": None,
    }


@router.get("/templates")
def get_templates(request: Request) -> list[dict[str, str]]:
    return list_templates(_settings(request).templates_dir)


@router.get("/projects")
def get_projects(request: Request) -> list[dict[str, Any]]:
    return [project_summary(root) for root in project_dirs(_settings(request).workspace)]


@router.post("/projects", status_code=201)
def create_project(body: CreateProject, request: Request) -> dict[str, Any]:
    settings = _settings(request)
    slug = slugify(body.name)
    if not slug:
        raise ApiError(422, "validation_error", "Name must contain a letter or digit")
    settings.workspace.mkdir(parents=True, exist_ok=True)
    dest = settings.workspace / slug
    if dest.exists():
        raise ApiError(409, "conflict", f"A project folder named {slug!r} already exists")
    try:
        write_template(body.template, settings.templates_dir, dest)
        set_top_level_field(dest / MANIFEST, "name", body.name)
        if body.description is not None:
            set_top_level_field(dest / MANIFEST, "description", body.description)
        load_manifest(dest)
    except Exception:
        # Never leave a half-created project behind.
        shutil.rmtree(dest, ignore_errors=True)
        raise
    return project_summary(dest)


@router.get("/projects/{pid}")
def get_project(pid: str, request: Request) -> dict[str, Any]:
    manifest = load_manifest(resolve_project(_settings(request).workspace, pid))
    formats = {
        name: {"width": f.width, "height": f.height, "fps": f.fps}
        for name, f in manifest.all_formats().items()
    }
    compositions = {
        name: {
            "title": comp.title,
            "clips": [{"scene": clip.scene, "params": clip.params} for clip in comp.clips],
        }
        for name, comp in manifest.compositions.items()
    }
    return {
        "id": pid,
        "name": manifest.name,
        "description": manifest.description,
        "formats": formats,
        "compositions": compositions,
    }


@router.get("/projects/{pid}/scenes")
def get_scenes(pid: str, request: Request) -> dict[str, Any]:
    scenes, errors = discover_scenes(resolve_project(_settings(request).workspace, pid))
    return {
        "scenes": [
            {"ref": s.ref, "file": s.file, "class_name": s.class_name, "line": s.line}
            for s in scenes
        ],
        "errors": [{"file": e.file, "line": e.line, "message": e.message} for e in errors],
    }
