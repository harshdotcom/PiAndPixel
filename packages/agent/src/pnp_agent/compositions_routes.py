"""Read and write the compositions section of pnp.yaml."""

from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Header, Request
from pnp_core import fileops
from pnp_core.errors import ConflictError
from pnp_core.manifest import Composition, parse_manifest, replace_compositions
from pydantic import BaseModel, ConfigDict, StringConstraints

from pnp_agent.files_routes import project_root, require_if_match
from pnp_agent.workspace import MANIFEST

router = APIRouter(prefix="/api/v1")

CompositionName = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")]


class PutCompositionsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    compositions: dict[CompositionName, Composition]


def _compositions_response(root: Path) -> dict[str, Any]:
    manifest_file = fileops.read_text(root, MANIFEST)
    compositions = parse_manifest(manifest_file.content).compositions
    return {
        "compositions": {
            name: {
                "title": comp.title,
                "clips": [{"scene": c.scene, "params": c.params} for c in comp.clips],
            }
            for name, comp in compositions.items()
        },
        "etag": manifest_file.etag,
    }


@router.get("/projects/{pid}/compositions")
def get_compositions(pid: str, request: Request) -> dict[str, Any]:
    return _compositions_response(project_root(request, pid))


@router.put("/projects/{pid}/compositions")
def put_compositions(
    pid: str,
    body: PutCompositionsBody,
    request: Request,
    if_match: str | None = Header(default=None),
) -> dict[str, Any]:
    root = project_root(request, pid)
    etag = require_if_match(if_match).strip().strip('"')
    current = fileops.read_text(root, MANIFEST)
    if current.etag != etag:
        raise ConflictError(f"{MANIFEST} changed on disk since it was opened")
    text = replace_compositions(current.content, body.compositions)
    fileops.write_bytes_atomic(root / MANIFEST, text.encode("utf-8"))
    return _compositions_response(root)
