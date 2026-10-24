"""Render job lifecycle through the HTTP API with a fake runner."""

from contextlib import closing
from dataclasses import replace
from pathlib import Path

import pytest
from agent_helpers import (
    AUTH,
    FakeRunner,
    create_project,
    fake_prober,
    start_render,
    wait_for_job,
)
from fastapi.testclient import TestClient
from pnp_agent.app import create_app
from pnp_agent.db import connect, db_path, list_revisions
from pnp_agent.settings import Settings
from pnp_core.probe import MediaInfo

SCENE = "scenes/proof.py:Proof"


def test_render_completes_with_artifact(
    client: TestClient, settings: Settings, runner: FakeRunner
) -> None:
    pid = create_project(client)
    job = wait_for_job(client, start_render(client, pid, params={"title": "Hi"}))
    assert job["status"] == "completed", job
    assert (job["kind"], job["priority"], job["attempt"]) == ("render", 0, 1)
    assert job["error"] is None and job["error_code"] is None
    assert job["request"] == {
        "scene": SCENE,
        "format": "landscape",
        "quality": "draft",
        "resolution": "480p",
        "params": {"title": "Hi"},
        "width": 854,
        "height": 480,
        "fps": 15,
    }
    assert job["progress"] == {"animations_done": 1, "pct": None}
    assert job["log_tail"][-1].startswith("Animation 0")
    assert job["started_at"] and job["finished_at"]
    assert job["artifact_id"]
    assert [a["status"] for a in job["attempts"]] == ["completed"]
    assert job["attempts"][0]["exit_code"] == 0

    project = settings.workspace / pid
    revision = project / ".pnp" / "revisions" / job["revision_id"]
    assert runner.requests[0].project_root == revision / "src"
    attempt = project / ".pnp" / "jobs" / job["id"] / "attempt-1"
    assert sorted(p.name for p in attempt.iterdir()) == ["render.log"]

    logs = client.get(f"/api/v1/jobs/{job['id']}/logs", headers=AUTH)
    assert logs.headers["content-type"].startswith("text/plain")
    assert "Partial movie file written" in logs.text


def test_render_response_names_the_revision(client: TestClient, settings: Settings) -> None:
    pid = create_project(client)
    body = {"scene": SCENE}
    resp = client.post(f"/api/v1/projects/{pid}/renders", json=body, headers=AUTH)
    assert resp.status_code == 202
    data = resp.json()
    assert set(data) == {"job_id", "revision_id"}
    with closing(connect(db_path(settings.workspace))) as conn:
        assert [r.id for r in list_revisions(conn, pid)] == [data["revision_id"]]
    assert (settings.workspace / pid / ".pnp" / "revisions" / data["revision_id"]).is_dir()


def test_failed_runner_marks_job_failed(settings: Settings) -> None:
    app = create_app(settings, runner=FakeRunner(fail_with="NameError: x"), prober=fake_prober)
    with TestClient(app) as client:
        pid = create_project(client)
        job = wait_for_job(client, start_render(client, pid))
    assert job["status"] == "failed"
    assert job["error"] == "NameError: x"
    assert job["error_code"] == "render_failed"
    assert job["artifact_id"] is None
    assert job["attempts"][0]["exit_code"] == 1


def test_resource_limit_error_code(settings: Settings) -> None:
    runner = FakeRunner(fail_with="resource_limit: out of memory")
    with TestClient(create_app(settings, runner=runner, prober=fake_prober)) as client:
        job = wait_for_job(client, start_render(client, create_project(client)))
    assert job["error_code"] == "resource_limit"


def test_validation_problem_marks_job_failed(client: TestClient) -> None:
    pid = create_project(client)
    # The fake prober reports landscape draft geometry, so a portrait render must fail.
    job = wait_for_job(client, start_render(client, pid, format="portrait"))
    assert job["status"] == "failed"
    assert job["error_code"] == "validation_error"
    assert "expected 480x854" in job["error"]


def test_over_long_clip_is_duration_exceeded(settings: Settings) -> None:
    def long_prober(path: Path) -> MediaInfo:
        return replace(fake_prober(path), duration_s=1801.0)

    with TestClient(create_app(settings, runner=FakeRunner(), prober=long_prober)) as client:
        job = wait_for_job(client, start_render(client, create_project(client)))
    assert (job["status"], job["error_code"]) == ("failed", "duration_exceeded")
    assert "exceeds the 1800s limit" in job["error"]


def test_unknown_format_is_422(client: TestClient) -> None:
    pid = create_project(client)
    resp = client.post(
        f"/api/v1/projects/{pid}/renders", json={"scene": SCENE, "format": "cinema"}, headers=AUTH
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"


def test_unknown_scene_is_404(client: TestClient) -> None:
    pid = create_project(client)
    body = {"scene": "scenes/proof.py:Nope"}
    resp = client.post(f"/api/v1/projects/{pid}/renders", json=body, headers=AUTH)
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "scene_not_found"


def test_jobs_list_newest_first_and_filtered(client: TestClient) -> None:
    first, second = create_project(client, "One"), create_project(client, "Two")
    j1 = start_render(client, first)
    j2 = start_render(client, second)
    wait_for_job(client, j1)
    wait_for_job(client, j2)
    assert [j["id"] for j in client.get("/api/v1/jobs", headers=AUTH).json()] == [j2, j1]
    only_first = client.get("/api/v1/jobs", params={"project": first}, headers=AUTH).json()
    assert [j["id"] for j in only_first] == [j1]
    renders = client.get("/api/v1/jobs", params={"kind": "render"}, headers=AUTH).json()
    assert len(renders) == 2
    assert client.get("/api/v1/jobs", params={"kind": "composite"}, headers=AUTH).json() == []
    assert client.get("/api/v1/jobs", params={"kind": "x"}, headers=AUTH).status_code == 422


def test_unknown_job_is_404(client: TestClient) -> None:
    for method, url in [
        ("GET", "/api/v1/jobs/nope"),
        ("GET", "/api/v1/jobs/nope/logs"),
        ("POST", "/api/v1/jobs/nope/cancel"),
        ("POST", "/api/v1/jobs/nope/retry"),
    ]:
        resp = client.request(method, url, headers=AUTH)
        assert resp.status_code == 404, url
        assert resp.json()["error"]["code"] == "not_found"


@pytest.mark.parametrize(
    ("method", "url"),
    [
        ("GET", "/api/v1/jobs"),
        ("GET", "/api/v1/jobs/x"),
        ("GET", "/api/v1/jobs/x/logs"),
        ("POST", "/api/v1/jobs/x/cancel"),
        ("POST", "/api/v1/jobs/x/retry"),
        ("POST", "/api/v1/projects/x/renders"),
    ],
)
def test_job_routes_need_token(client: TestClient, method: str, url: str) -> None:
    assert client.request(method, url).status_code == 401
