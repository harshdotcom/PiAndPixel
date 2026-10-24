"""Exports: unit render jobs + one composite job, idempotency, cancel/retry, publishing."""

from typing import Any

import pytest
from agent_helpers import (
    AUTH,
    FakeComposer,
    FakeRunner,
    GatedRunner,
    export_project,
    fake_prober,
    start_export,
    wait_until,
)
from fastapi.testclient import TestClient
from pnp_agent.app import create_app
from pnp_agent.exports import plan_units
from pnp_agent.settings import Settings
from pnp_core.manifest import Clip


def wait_export(client: TestClient, eid: str, until: tuple[str, ...]) -> dict[str, Any]:
    return wait_until(client, f"/api/v1/exports/{eid}", done=lambda e: e["status"] in until)


def test_plan_units_dedupes_by_scene_and_params() -> None:
    clips = [Clip(scene="a.py:A"), Clip(scene="a.py:B"), Clip(scene="a.py:A"),
             Clip(scene="a.py:A", params={"x": 1})]  # fmt: skip
    units, index = plan_units(clips)
    assert [(u.scene, u.params) for u in units] == [
        ("a.py:A", {}),
        ("a.py:B", {}),
        ("a.py:A", {"x": 1}),
    ]
    assert index == [0, 1, 0, 2]


def test_export_dag_completes_and_publishes(
    client: TestClient, settings: Settings, runner: FakeRunner, composer: FakeComposer
) -> None:
    pid = export_project(client, settings)
    accepted = start_export(client, pid)
    assert len(accepted["job_ids"]) == 4  # 3 distinct units + the composite
    export = wait_export(client, accepted["export_id"], ("completed", "failed", "blocked"))
    assert export["status"] == "completed", export
    assert (export["units_total"], export["units_done"]) == (3, 3)
    assert [*export["unit_job_ids"], export["composite_job_id"]] == accepted["job_ids"]
    assert export["revision_id"] == accepted["revision_id"]
    assert len(runner.requests) == 3

    composite = client.get(f"/api/v1/jobs/{export['composite_job_id']}", headers=AUTH).json()
    assert composite["kind"] == "composite" and composite["priority"] == 20
    assert composite["depends_on"] == export["unit_job_ids"]
    assert composite["progress"]["pct"] == 100.0
    clips = composite["request"]["clips"]
    units = export["unit_job_ids"]
    assert [c["unit_job_id"] for c in clips] == [units[0], units[1], units[0], units[2]]
    request = composer.requests[0]
    assert (request.width, request.height, request.fps) == (854, 480, 15)
    assert request.clips[0] == request.clips[2] != request.clips[1]

    art = client.get(f"/api/v1/artifacts/{export['artifact_id']}", headers=AUTH).json()
    assert art["kind"] == "export"
    assert art["meta"] == {
        "composition": "main", "format": "landscape", "quality": "draft", "resolution": "480p",
        "fps": 15, "width": 854, "height": 480,
        "export_id": export["id"], "job_id": composite["id"], "revision_id": export["revision_id"],
    }  # fmt: skip
    chosen = {k: export[k] for k in ("quality", "resolution", "fps", "width", "height")}
    assert chosen == {"quality": "draft", "resolution": "480p", "fps": 15, "width": 854,
                      "height": 480}  # fmt: skip
    listed = client.get("/api/v1/exports", params={"project": pid}, headers=AUTH).json()
    assert [e["id"] for e in listed] == [export["id"]]


def test_failed_unit_blocks_composite_until_retried(settings: Settings) -> None:
    runner, composer = FakeRunner(fail_with="NameError: x"), FakeComposer()
    app = create_app(settings, runner=runner, prober=fake_prober, composer=composer)
    with TestClient(app) as client:
        pid = export_project(client, settings)
        eid = start_export(client, pid)["export_id"]
        export = wait_export(client, eid, ("blocked",))
        composite = client.get(f"/api/v1/jobs/{export['composite_job_id']}", headers=AUTH).json()
        assert composite["error_code"] == "dependency_failed"
        assert composite["error"].startswith("Blocked: dependency ")
        assert composer.requests == []
        _wait_units_settled(client, export)

        runner.fail_with = None
        retried = client.post(f"/api/v1/exports/{eid}/retry", headers=AUTH)
        assert retried.status_code == 200, retried.text
        export = wait_export(client, eid, ("completed", "failed"))
    assert export["status"] == "completed"
    assert len(composer.requests) == 1


def _wait_units_settled(client: TestClient, export: dict[str, Any]) -> None:
    for jid in export["unit_job_ids"]:
        wait_until(client, f"/api/v1/jobs/{jid}")


def test_duration_exceeded_publishes_nothing(settings: Settings) -> None:
    composer = FakeComposer(fail=("duration_exceeded", "Export is longer than 30 minutes"))
    app = create_app(settings, runner=FakeRunner(), prober=fake_prober, composer=composer)
    with TestClient(app) as client:
        pid = export_project(client, settings)
        export = wait_export(client, start_export(client, pid)["export_id"], ("failed",))
    assert export["error_code"] == "duration_exceeded"
    assert export["artifact_id"] is None
    artifacts = settings.workspace / pid / ".pnp" / "artifacts"
    assert len(list(artifacts.glob("*.mp4"))) == 3  # the unit clips only


def test_cancel_export_then_retry(settings: Settings) -> None:
    runner = GatedRunner()
    app = create_app(settings, runner=runner, prober=fake_prober, composer=FakeComposer())
    with TestClient(app) as client:
        pid = export_project(client, settings)
        eid = start_export(client, pid)["export_id"]
        assert runner.started.wait(5)
        assert wait_export(client, eid, ("running",))["units_done"] == 0
        resp = client.post(f"/api/v1/exports/{eid}/cancel", headers=AUTH)
        assert resp.status_code == 200
        export = wait_export(client, eid, ("cancelled",))
        _wait_units_settled(client, export)
        units = [
            client.get(f"/api/v1/jobs/{j}", headers=AUTH).json() for j in export["unit_job_ids"]
        ]
        assert [u["status"] for u in units] == ["cancelled"] * 3
        assert client.post(f"/api/v1/exports/{eid}/cancel", headers=AUTH).status_code == 409

        runner.gate.set()
        assert client.post(f"/api/v1/exports/{eid}/retry", headers=AUTH).status_code == 200
        export = wait_export(client, eid, ("completed", "failed"))
        assert (export["status"], export["units_done"]) == ("completed", 3)
        assert client.post(f"/api/v1/exports/{eid}/retry", headers=AUTH).status_code == 409


def test_idempotency_key(client: TestClient, settings: Settings) -> None:
    pid = export_project(client, settings)
    first = start_export(client, pid, key="click-1")
    assert start_export(client, pid, key="click-1") == first
    jobs = client.get("/api/v1/jobs", params={"project": pid}, headers=AUTH).json()
    assert len(jobs) == 4
    headers = {**AUTH, "Idempotency-Key": "click-1"}
    body = {"composition": "main", "quality": "final"}
    resp = client.post(f"/api/v1/projects/{pid}/exports", json=body, headers=headers)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "conflict"
    for bad in ("has space", "x" * 129):
        headers = {**AUTH, "Idempotency-Key": bad}
        resp = client.post(f"/api/v1/projects/{pid}/exports", json=body, headers=headers)
        assert resp.status_code == 422
    # Same key, other resolution or fps: a different request.
    for other in ({"resolution": "720p"}, {"fps": 30}):
        resp = client.post(f"/api/v1/projects/{pid}/exports",
                           json={"composition": "main", "quality": "draft", **other},
                           headers={**AUTH, "Idempotency-Key": "click-1"})  # fmt: skip
        assert resp.status_code == 409


def test_export_resolution_and_fps_win_over_quality(
    client: TestClient, settings: Settings, composer: FakeComposer
) -> None:
    pid = export_project(client, settings)
    body = {"format": "square", "resolution": "720p", "fps": 24}
    export = wait_export(client, start_export(client, pid, **body)["export_id"],
                         ("completed", "failed", "blocked"))  # fmt: skip
    # The fake prober reports 854x480, so the units fail validation; the request is what counts.
    unit = client.get(f"/api/v1/jobs/{export['unit_job_ids'][0]}", headers=AUTH).json()
    assert {k: unit["request"][k] for k in ("quality", "resolution", "fps", "width", "height")} == {
        "quality": "draft", "resolution": "720p", "fps": 24, "width": 720, "height": 720,
    }  # fmt: skip
    assert (export["resolution"], export["fps"], export["width"]) == ("720p", 24, 720)


def test_export_without_quality_or_resolution_is_final(
    client: TestClient, settings: Settings
) -> None:
    pid = export_project(client, settings)
    resp = client.post(f"/api/v1/projects/{pid}/exports", json={"composition": "main"},
                       headers=AUTH)  # fmt: skip
    export = client.get(f"/api/v1/exports/{resp.json()['export_id']}", headers=AUTH).json()
    assert (export["quality"], export["resolution"], export["width"]) == ("final", "1080p", 1920)


@pytest.mark.parametrize(
    ("body", "status", "code"),
    [
        ({"composition": "nope"}, 422, "validation_error"),
        ({"composition": "main", "format": "cinema"}, 422, "validation_error"),
        ({"composition": "main", "quality": "ultra"}, 422, "validation_error"),
        ({"composition": "main", "resolution": "4k"}, 422, "validation_error"),
        ({"composition": "main", "fps": 25}, 422, "validation_error"),
        ({"composition": "broken"}, 404, "scene_not_found"),
    ],
)
def test_export_request_errors(
    client: TestClient, settings: Settings, body: dict[str, str], status: int, code: str
) -> None:
    pid = export_project(client, settings)
    resp = client.post(f"/api/v1/projects/{pid}/exports", json=body, headers=AUTH)
    assert resp.status_code == status
    assert resp.json()["error"]["code"] == code


def test_unknown_export_is_404(client: TestClient) -> None:
    assert client.get("/api/v1/exports/nope", headers=AUTH).status_code == 404
    assert client.post("/api/v1/exports/nope/cancel", headers=AUTH).status_code == 404
    assert client.post("/api/v1/exports/nope/retry", headers=AUTH).status_code == 404


@pytest.mark.parametrize(
    ("method", "url"),
    [
        ("GET", "/api/v1/exports"),
        ("GET", "/api/v1/exports/x"),
        ("POST", "/api/v1/exports/x/cancel"),
        ("POST", "/api/v1/exports/x/retry"),
        ("POST", "/api/v1/projects/x/exports"),
    ],
)
def test_export_routes_need_token(client: TestClient, method: str, url: str) -> None:
    assert client.request(method, url).status_code == 401
