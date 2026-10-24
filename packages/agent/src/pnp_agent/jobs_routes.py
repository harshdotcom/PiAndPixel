"""Routes to start renders and to follow, cancel and retry their jobs."""

import json
from typing import Any, Literal

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse
from pnp_core.discovery import discover_scenes
from pnp_core.errors import SceneNotFoundError
from pnp_core.formats import Quality
from pnp_core.manifest import load_manifest
from pydantic import field_validator

from pnp_agent.errors import ApiError
from pnp_agent.jobs import JobManager
from pnp_agent.render_options import OutputFields
from pnp_agent.workspace import resolve_project

router = APIRouter(prefix="/api/v1")

# params are copied into the job request and the render context, so keep them small.
MAX_PARAMS_BYTES = 64_000


class RenderBody(OutputFields):
    scene: str
    format: str = "landscape"
    params: dict[str, Any] = {}

    @field_validator("params")
    @classmethod
    def _small_params(cls, params: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(params)) > MAX_PARAMS_BYTES:
            raise ValueError(f"params must be at most {MAX_PARAMS_BYTES} bytes as JSON")
        return params


def _jobs(request: Request) -> JobManager:
    return request.app.state.jobs


@router.post("/projects/{pid}/renders", status_code=202)
def start_render(pid: str, body: RenderBody, request: Request) -> dict[str, str]:
    root = resolve_project(request.app.state.settings.workspace, pid)
    formats = load_manifest(root).all_formats()
    fmt = formats.get(body.format)
    if fmt is None:
        known = ", ".join(sorted(formats))
        raise ApiError(422, "validation_error", f"Unknown format {body.format!r} (known: {known})")
    output = body.output(fmt, Quality.DRAFT)
    scenes, _ = discover_scenes(root)
    if body.scene not in {s.ref for s in scenes}:
        raise SceneNotFoundError(f"No scene {body.scene!r} found in project {pid!r}")
    job = _jobs(request).submit_render(
        root,
        scene=body.scene,
        fmt_name=body.format,
        output=output,
        params=body.params,
    )
    return {"job_id": job["id"], "revision_id": job["revision_id"]}


@router.get("/jobs")
def list_jobs(
    request: Request,
    project: str | None = None,
    kind: Literal["render", "composite"] | None = None,
) -> list[dict[str, Any]]:
    return _jobs(request).list(project, kind)


@router.get("/jobs/{jid}")
def get_job(jid: str, request: Request) -> dict[str, Any]:
    job = _jobs(request).get(jid)
    if job is None:
        raise ApiError(404, "not_found", f"Job {jid!r} not found")
    return job


@router.post("/jobs/{jid}/cancel")
def cancel_job(jid: str, request: Request) -> dict[str, Any]:
    return _jobs(request).cancel(jid)


@router.post("/jobs/{jid}/retry")
def retry_job(jid: str, request: Request) -> dict[str, Any]:
    return _jobs(request).retry(jid)


@router.get("/jobs/{jid}/logs", response_class=PlainTextResponse)
def get_job_logs(jid: str, request: Request, attempt: int | None = None) -> str:
    log = _jobs(request).log_path(jid, attempt)
    if log is None or not log.is_file():
        return ""
    return log.read_text("utf-8", errors="replace")
