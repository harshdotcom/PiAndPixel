"""Export routes: start an export of a composition and follow it."""

import re
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse
from pnp_core.discovery import discover_scenes
from pnp_core.errors import SceneNotFoundError
from pnp_core.formats import Quality
from pnp_core.manifest import load_manifest
from pnp_core.paths import safe_join

from pnp_agent.errors import ApiError
from pnp_agent.jobs import JobManager
from pnp_agent.narration_data import load_document
from pnp_agent.render_options import OutputFields
from pnp_agent.workspace import resolve_project

router = APIRouter(prefix="/api/v1")

_IDEMPOTENCY_KEY = re.compile(r"^[\x21-\x7e]{1,128}$")  # 1–128 visible ASCII characters


class ExportBody(OutputFields):
    composition: str
    format: str = "landscape"
    delivery_profile: Literal["custom", "reels_shorts"] = "custom"


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
    if body.delivery_profile == "reels_shorts" and (
        body.format != "portrait" or output.geometry != (1080, 1920, 30)
    ):
        raise ApiError(
            422,
            "validation_error",
            "Reels + Shorts requires portrait at 1080p and 30 fps (1080×1920)",
        )
    scenes = {s.ref for s in discover_scenes(root)[0]}
    for clip in composition.clips:
        if clip.scene not in scenes:
            raise SceneNotFoundError(f"No scene {clip.scene!r} found in project {pid!r}")
    narration = load_document(root, body.composition)
    voice_audio = []
    for clip in narration.audio_clips:
        if not clip.enabled:
            continue
        audio_path = f".pnp/narration/{body.composition}/{clip.audio_id}.mp3"
        if not safe_join(root, audio_path).is_file():
            raise ApiError(
                409, "invalid_state", "Generated narration audio is missing; generate it again"
            )
        voice_audio.append(
            {
                "path": audio_path,
                "audio_id": clip.audio_id,
                "duration_s": clip.source_end_s - clip.source_start_s,
                "source_start_s": clip.source_start_s,
                "source_end_s": clip.source_end_s,
                "start_s": clip.start_s,
                "gain": clip.gain,
            }
        )
    export, _ = _jobs(request).submit_export(
        root,
        composition=body.composition,
        fmt_name=body.format,
        output=output,
        clips=composition.clips,
        idempotency_key=idempotency_key,
        delivery_profile=body.delivery_profile,
        voice_audio=voice_audio,
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
