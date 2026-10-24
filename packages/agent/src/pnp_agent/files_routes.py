"""Project file API: tree, read, create, save (If-Match), rename, delete."""

from pathlib import Path
from typing import Any

from fastapi import APIRouter, Header, Request, Response
from fastapi.responses import JSONResponse
from pnp_core import fileops
from pnp_core.manifest import parse_manifest
from pydantic import BaseModel, ConfigDict, Field

from pnp_agent.errors import ApiError
from pnp_agent.settings import Settings
from pnp_agent.workspace import MANIFEST, resolve_project

router = APIRouter(prefix="/api/v1")


class CreateFileBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    path: str
    content: str


class SaveFileBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content: str


class RenameFileBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    from_: str = Field(alias="from")
    to: str


def project_root(request: Request, pid: str) -> Path:
    settings: Settings = request.app.state.settings
    return resolve_project(settings.workspace, pid)


def require_if_match(if_match: str | None) -> str:
    """The client must say which version it edited, so a stale write is caught (412)."""
    if not if_match:
        raise ApiError(428, "precondition_required", "This request needs an If-Match header")
    return if_match


def _is_manifest(root: Path, path: str) -> bool:
    return fileops.resolve_file(root, path) == (root / MANIFEST).resolve()


def _saved(path: str, etag: str, status: int = 200) -> JSONResponse:
    body = {"path": path, "etag": etag}
    return JSONResponse(body, status_code=status, headers={"ETag": f'"{etag}"'})


@router.get("/projects/{pid}/files")
def get_tree(pid: str, request: Request) -> dict[str, Any]:
    entries = fileops.list_tree(project_root(request, pid))
    return {"entries": [{"path": e.path, "type": e.type, "size": e.size} for e in entries]}


@router.post("/projects/{pid}/files/rename")
def rename_file(pid: str, body: RenameFileBody, request: Request) -> JSONResponse:
    root = project_root(request, pid)
    if _is_manifest(root, body.from_) or _is_manifest(root, body.to):
        raise ApiError(422, "validation_error", f"{MANIFEST} cannot be renamed")
    return _saved(body.to, fileops.rename_file(root, body.from_, body.to))


@router.post("/projects/{pid}/files", status_code=201)
def create_file(pid: str, body: CreateFileBody, request: Request) -> JSONResponse:
    created = fileops.create_text(project_root(request, pid), body.path, body.content)
    return _saved(created.path, created.etag, status=201)


@router.get("/projects/{pid}/files/{path:path}")
def read_file(pid: str, path: str, request: Request) -> JSONResponse:
    text = fileops.read_text(project_root(request, pid), path)
    body = {"path": text.path, "content": text.content, "etag": text.etag}
    return JSONResponse(body, headers={"ETag": f'"{text.etag}"'})


@router.put("/projects/{pid}/files/{path:path}")
def save_file(
    pid: str,
    path: str,
    body: SaveFileBody,
    request: Request,
    if_match: str | None = Header(default=None),
) -> JSONResponse:
    root = project_root(request, pid)
    etag = require_if_match(if_match)
    if _is_manifest(root, path):
        parse_manifest(body.content)  # an invalid pnp.yaml is never written (422)
    saved = fileops.save_text(root, path, body.content, etag)
    return _saved(saved.path, saved.etag)


@router.delete("/projects/{pid}/files/{path:path}", status_code=204)
def delete_file(
    pid: str, path: str, request: Request, if_match: str | None = Header(default=None)
) -> Response:
    root = project_root(request, pid)
    etag = require_if_match(if_match)
    if _is_manifest(root, path):
        raise ApiError(422, "validation_error", f"{MANIFEST} cannot be deleted")
    fileops.delete_file(root, path, etag)
    return Response(status_code=204)
