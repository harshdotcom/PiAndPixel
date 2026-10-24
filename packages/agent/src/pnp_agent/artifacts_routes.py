"""Artifact metadata and signed media URLs (with HTTP Range support for seeking)."""

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse
from pnp_core.artifacts import Artifact, ArtifactStore

from pnp_agent.errors import ApiError
from pnp_agent.security import sign_artifact, verify_artifact_sig

router = APIRouter(prefix="/api/v1/artifacts")


def _find(request: Request, aid: str) -> Artifact:
    project = request.app.state.jobs.artifact_project(aid)
    workspace = request.app.state.settings.workspace
    artifact = (
        ArtifactStore(workspace / project / ".pnp" / "artifacts").get(aid) if project else None
    )
    if artifact is None:
        raise ApiError(404, "not_found", f"Artifact {aid!r} not found")
    return artifact


def _checked(request: Request, aid: str, sig: str) -> Artifact:
    if not verify_artifact_sig(request.app.state.settings.token, aid, sig):
        raise ApiError(403, "forbidden", "Invalid artifact signature")
    return _find(request, aid)


@router.get("/{aid}")
def get_artifact(aid: str, request: Request) -> dict[str, Any]:
    artifact = _find(request, aid)
    data = artifact.to_json()
    del data["path"]
    sig = sign_artifact(request.app.state.settings.token, aid)
    data["stream_url"] = f"/api/v1/artifacts/{aid}/stream?sig={sig}"
    data["download_url"] = f"/api/v1/artifacts/{aid}/download?sig={sig}"
    return data


@router.get("/{aid}/stream")
def stream_artifact(aid: str, request: Request, sig: str = "") -> FileResponse:
    # FileResponse answers "Range: bytes=..." with 206 Partial Content.
    return FileResponse(_checked(request, aid, sig).path, media_type="video/mp4")


@router.get("/{aid}/download")
def download_artifact(aid: str, request: Request, sig: str = "") -> FileResponse:
    artifact = _checked(request, aid, sig)
    return FileResponse(
        artifact.path,
        media_type="video/mp4",
        filename=f"{artifact.project}-{aid}.mp4",
        content_disposition_type="attachment",
    )
