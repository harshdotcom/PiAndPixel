"""Artifact metadata, signed streaming with Range support, and downloads."""

from typing import Any

from agent_helpers import AUTH, TOKEN, VIDEO_BYTES, create_project, wait_for_job
from fastapi.testclient import TestClient
from pnp_agent.app import create_app
from pnp_agent.security import sign_artifact
from pnp_agent.settings import Settings


def rendered_artifact(client: TestClient) -> dict[str, Any]:
    pid = create_project(client)
    body = {"scene": "scenes/proof.py:Proof"}
    job_id = client.post(f"/api/v1/projects/{pid}/renders", json=body, headers=AUTH).json()
    job = wait_for_job(client, job_id["job_id"])
    resp = client.get(f"/api/v1/artifacts/{job['artifact_id']}", headers=AUTH)
    assert resp.status_code == 200
    return resp.json()


def test_artifact_metadata(client: TestClient) -> None:
    art = rendered_artifact(client)
    assert "path" not in art
    assert art["kind"] == "scene_clip"
    assert (art["width"], art["height"], art["fps"]) == (854, 480, 15.0)
    assert art["meta"]["scene"] == "scenes/proof.py:Proof"
    sig = sign_artifact(TOKEN, str(art["id"]))
    assert art["stream_url"] == f"/api/v1/artifacts/{art['id']}/stream?sig={sig}"
    assert art["download_url"] == f"/api/v1/artifacts/{art['id']}/download?sig={sig}"


def test_stream_with_valid_sig_needs_no_token(client: TestClient) -> None:
    art = rendered_artifact(client)
    resp = client.get(str(art["stream_url"]))
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "video/mp4"
    assert resp.content == VIDEO_BYTES


def test_stream_supports_range(client: TestClient) -> None:
    art = rendered_artifact(client)
    resp = client.get(str(art["stream_url"]), headers={"Range": "bytes=0-9"})
    assert resp.status_code == 206
    assert resp.content == VIDEO_BYTES[:10]
    assert resp.headers["content-range"] == f"bytes 0-9/{len(VIDEO_BYTES)}"


def test_download_is_attachment(client: TestClient) -> None:
    art = rendered_artifact(client)
    resp = client.get(str(art["download_url"]))
    assert resp.status_code == 200
    assert resp.headers["content-disposition"].startswith("attachment")
    assert resp.content == VIDEO_BYTES


def test_bad_or_missing_sig_is_403(client: TestClient) -> None:
    art = rendered_artifact(client)
    aid = art["id"]
    for url in (
        f"/api/v1/artifacts/{aid}/stream?sig=deadbeef",
        f"/api/v1/artifacts/{aid}/stream",
        f"/api/v1/artifacts/{aid}/download?sig=deadbeef",
    ):
        resp = client.get(url)
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "forbidden"


def test_unknown_artifact_is_404(client: TestClient) -> None:
    resp = client.get("/api/v1/artifacts/" + "0" * 32, headers=AUTH)
    assert resp.status_code == 404


def test_artifact_index_survives_restart(settings: Settings, client: TestClient) -> None:
    art = rendered_artifact(client)
    with TestClient(create_app(settings)) as fresh:
        resp = fresh.get(f"/api/v1/artifacts/{art['id']}", headers=AUTH)
    assert resp.status_code == 200
    assert resp.json()["sha256"] == art["sha256"]
