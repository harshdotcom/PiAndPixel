"""Export routes: start an export of a composition and follow it."""

import re
from typing import Annotated, Any

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse
from pnp_core.discovery import discover_scenes
from pnp_core.errors import SceneNotFoundError
from pnp_core.formats import Quality
from pnp_core.manifest import load_manifest

from pnp_agent.errors import ApiError
from pnp_agent.jobs import JobManager
from pnp_agent.render_options import OutputFields
from pnp_agent.workspace import resolve_project

router = APIRouter(prefix="/api/v1")

_IDEMPOTENCY_KEY = re.compile(r"^[\x21-\x7e]{1,128}$")  # 1–128 visible ASCII characters


class ExportBody(OutputFields):
    composition: str
    format: str = "landscape"


def _jobs(request: Request) -> JobManager:
    return request.app.state.jobs


@router.post("/projects/{pid}/exports", status_code=202)
def start_export(
    pid: str,
    body: ExportBody,
    request: Request,
    idempotency_key: Annotated[str | None, Header()] = None,
) -> JSONResponse:
    if idempotency_key is not None and not _IDEMPOTENCY_KEY.fullmatch(idempotency_key):
        raise ApiError(422, "validation_error", "Idempotency-Key must be 1-128 visible ASCII chars")
    root = resolve_project(request.app.state.settings.workspace, pid)
    manifest = load_manifest(root)
    composition = manifest.compositions.get(body.composition)
    if composition is None:
        raise ApiError(422, "validation_error", f"Unknown composition {body.composition!r}")
    fmt = manifest.all_formats().get(body.format)
    if fmt is None:
        raise ApiError(422, "validation_error", f"Unknown format {body.format!r}")
    output = body.output(fmt, Quality.FINAL)
    scenes = {s.ref for s in discover_scenes(root)[0]}
    for clip in composition.clips:
        if clip.scene not in scenes:
            raise SceneNotFoundError(f"No scene {clip.scene!r} found in project {pid!r}")
    export, _ = _jobs(request).submit_export(
        root,
        composition=body.composition,
        fmt_name=body.format,
        output=output,
        clips=composition.clips,
        idempotency_key=idempotency_key,
    )
    job_ids = [*export["unit_job_ids"], export["composite_job_id"]]
    content = {"export_id": export["id"], "job_ids": job_ids, "revision_id": export["revision_id"]}
    return JSONResponse(content, status_code=202)


@router.get("/exports")
def list_exports(request: Request, project: str | None = None) -> list[dict[str, Any]]:
    return _jobs(request).list_exports(project)


@router.get("/exports/{eid}")
def get_export(eid: str, request: Request) -> dict[str, Any]:
    export = _jobs(request).get_export(eid)
    if export is None:
        raise ApiError(404, "not_found", f"Export {eid!r} not found")
    return export


@router.post("/exports/{eid}/cancel")
def cancel_export(eid: str, request: Request) -> dict[str, Any]:
    return _jobs(request).cancel_export(eid)


@router.post("/exports/{eid}/retry")
def retry_export(eid: str, request: Request) -> dict[str, Any]:
    return _jobs(request).retry_export(eid)
