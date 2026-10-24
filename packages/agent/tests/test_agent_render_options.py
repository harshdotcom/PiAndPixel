"""Resolution and fps choices: GET /agent lists them, renders validate and record them."""

from typing import Any

import pytest
from agent_helpers import AUTH, create_project, start_render, wait_for_job
from fastapi.testclient import TestClient
from pnp_agent.render_options import render_options
from pnp_agent.settings import Settings

SCENE = "scenes/proof.py:Proof"
OUTPUT_KEYS = ("quality", "resolution", "fps", "width", "height")


def _chosen(job: dict[str, Any]) -> dict[str, Any]:
    return {k: job["request"][k] for k in OUTPUT_KEYS}


def test_agent_lists_render_options(client: TestClient) -> None:
    info = client.get("/api/v1/agent", headers=AUTH).json()
    assert info["render_options"] == render_options()
    assert [r["id"] for r in info["render_options"]["resolutions"]] == [
        "480p", "720p", "1080p", "1440p", "2160p",
    ]  # fmt: skip
    assert info["render_options"]["fps"] == [15, 24, 30, 60]
    assert info["render_options"]["max_long_edge"] == 3840
    assert info["render_options"]["default"] == {"resolution": "480p", "fps": 15}


def test_resolution_and_fps_win_over_quality(client: TestClient) -> None:
    pid = create_project(client)
    jid = start_render(client, pid, format="portrait", quality="draft", resolution="720p", fps=24)
    job = client.get(f"/api/v1/jobs/{jid}", headers=AUTH).json()
    assert _chosen(job) == {
        "quality": "draft", "resolution": "720p", "fps": 24, "width": 720, "height": 1280,
    }  # fmt: skip


def test_resolution_alone_sets_quality_and_priority(client: TestClient) -> None:
    pid = create_project(client)
    job = wait_for_job(client, start_render(client, pid, resolution="1080p"))
    assert _chosen(job) == {
        "quality": "final", "resolution": "1080p", "fps": 30, "width": 1920, "height": 1080,
    }  # fmt: skip
    assert job["priority"] == 10


def test_quality_alone_uses_its_preset(client: TestClient) -> None:
    pid = create_project(client)
    job = wait_for_job(client, start_render(client, pid, format="square", quality="preview"))
    assert _chosen(job) == {
        "quality": "preview", "resolution": "720p", "fps": 30, "width": 720, "height": 720,
    }  # fmt: skip
    assert job["priority"] == 0


@pytest.mark.parametrize(
    ("extra", "message"),
    [
        ({"resolution": "4k"}, "resolution must be one of 480p, 720p, 1080p, 1440p, 2160p"),
        ({"fps": 25}, "fps must be one of 15, 24, 30, 60"),
        ({"fps": "fast"}, "valid integer"),
    ],
)
def test_invalid_choices_are_422(client: TestClient, extra: dict[str, Any], message: str) -> None:
    pid = create_project(client)
    resp = client.post(f"/api/v1/projects/{pid}/renders", json={"scene": SCENE, **extra},
                       headers=AUTH)  # fmt: skip
    assert resp.status_code == 422
    error = resp.json()["error"]
    assert error["code"] == "validation_error"
    assert message in error["details"][0]["msg"]


def test_resolution_too_large_for_the_format_is_422(client: TestClient, settings: Settings) -> None:
    pid = create_project(client)
    manifest = settings.workspace / pid / "pnp.yaml"
    manifest.write_text(manifest.read_text() + "formats:\n  wide: {width: 2400, height: 1000}\n")
    body = {"scene": SCENE, "format": "wide", "resolution": "2160p"}
    resp = client.post(f"/api/v1/projects/{pid}/renders", json=body, headers=AUTH)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"
    assert "at most 3840" in resp.json()["error"]["message"]
