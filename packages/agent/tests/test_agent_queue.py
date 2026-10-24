"""The durable queue: priority order, cancel, retry with a new attempt, dependency blocking."""

from pathlib import Path

import pytest
from agent_helpers import AUTH, GatedRunner, create_project, start_render, wait_for_job, wait_until
from fastapi.testclient import TestClient
from pnp_agent.db import db_path, init_db
from pnp_agent.job_records import Finish, new_job
from pnp_agent.job_store import JobStore
from pnp_agent.settings import Settings


@pytest.fixture
def runner() -> GatedRunner:
    return GatedRunner()


def _post(client: TestClient, url: str) -> dict[str, object]:
    resp = client.post(url, headers=AUTH)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_interactive_renders_run_before_final(client: TestClient, runner: GatedRunner) -> None:
    pid = create_project(client)
    first = start_render(client, pid)
    assert runner.started.wait(5)
    final = start_render(client, pid, quality="final")
    draft = start_render(client, pid, quality="draft")
    preview = start_render(client, pid, quality="preview")
    jobs = {j: client.get(f"/api/v1/jobs/{j}", headers=AUTH).json() for j in (final, draft)}
    assert (jobs[final]["priority"], jobs[draft]["priority"]) == (10, 0)
    runner.gate.set()
    for jid in (first, final, draft, preview):
        wait_for_job(client, jid)
    assert [r.quality.value for r in runner.requests] == ["draft", "draft", "preview", "final"]


def test_cancel_queued_and_running(client: TestClient, runner: GatedRunner) -> None:
    pid = create_project(client)
    running = start_render(client, pid)
    assert runner.started.wait(5)
    queued = start_render(client, pid)

    job = _post(client, f"/api/v1/jobs/{queued}/cancel")
    assert (job["status"], job["error_code"], job["attempt"]) == ("cancelled", "cancelled", 0)
    again = client.post(f"/api/v1/jobs/{queued}/cancel", headers=AUTH)
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "invalid_state"

    assert _post(client, f"/api/v1/jobs/{running}/cancel")["status"] == "running"
    job = wait_for_job(client, running)
    assert (job["status"], job["error_code"]) == ("cancelled", "cancelled")
    assert job["attempts"][0]["status"] == "cancelled"
    assert client.get(f"/api/v1/jobs/{queued}/logs", headers=AUTH).text == ""


def test_retry_runs_a_new_attempt_with_its_own_log(
    client: TestClient, runner: GatedRunner, settings: Settings
) -> None:
    runner.gate.set()
    runner.fail_with = "NameError: x"
    pid = create_project(client)
    jid = start_render(client, pid)
    failed = wait_for_job(client, jid)
    assert failed["status"] == "failed"
    assert client.post(f"/api/v1/jobs/{jid}/cancel", headers=AUTH).status_code == 409

    runner.fail_with = None
    retried = _post(client, f"/api/v1/jobs/{jid}/retry")
    assert retried["id"] == jid
    assert retried["status"] in ("queued", "running", "completed")
    job = wait_for_job(client, jid)
    assert (job["status"], job["attempt"], job["error"]) == ("completed", 2, None)
    assert [a["status"] for a in job["attempts"]] == ["failed", "completed"]
    assert job["attempts"][0]["error"] == "NameError: x"

    jobs_dir = settings.workspace / pid / ".pnp" / "jobs" / jid
    assert sorted(p.name for p in jobs_dir.iterdir()) == ["attempt-1", "attempt-2"]
    logs = f"/api/v1/jobs/{jid}/logs"
    assert "NameError" in client.get(logs, params={"attempt": 1}, headers=AUTH).text
    assert "NameError" not in client.get(logs, headers=AUTH).text
    assert client.get(logs, params={"attempt": 3}, headers=AUTH).status_code == 404
    again = client.post(f"/api/v1/jobs/{jid}/retry", headers=AUTH)
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "invalid_state"


def test_retry_of_a_running_job_is_409(client: TestClient, runner: GatedRunner) -> None:
    jid = start_render(client, create_project(client))
    assert runner.started.wait(5)
    resp = client.post(f"/api/v1/jobs/{jid}/retry", headers=AUTH)
    assert resp.status_code == 409
    runner.gate.set()
    wait_until(client, f"/api/v1/jobs/{jid}")


def _chain(tmp_path: Path) -> tuple[JobStore, list[str]]:
    """a ← b ← c (c depends on b, b on a), stored without a worker."""
    path = db_path(tmp_path)
    init_db(path)
    store = JobStore(path)
    a = new_job("a", "p", "render", 0, {}, revision_id="r")
    b = new_job("b", "p", "render", 0, {}, revision_id="r", depends_on=("a",))
    c = new_job("c", "p", "composite", 20, {}, revision_id="r", depends_on=("b",))
    store.add_jobs([a, b, c])
    return store, ["a", "b", "c"]


def test_runnable_waits_for_dependencies(tmp_path: Path) -> None:
    store, _ = _chain(tmp_path)
    claimed = store.claim(30.0, lambda job, n: tmp_path / f"{job.id}-{n}.log")
    assert claimed is not None and claimed.id == "a"
    assert store.claim(30.0, lambda job, n: tmp_path / "x.log") is None  # b waits for a


def test_failure_blocks_dependents_transitively_and_retry_unblocks(tmp_path: Path) -> None:
    store, ids = _chain(tmp_path)
    store.claim(30.0, lambda job, n: tmp_path / "a.log")
    assert store.finish("a", 1, Finish("failed", "boom", "render_failed")) == ["b", "c"]
    b, c = store.get("b"), store.get("c")
    assert b is not None and c is not None
    assert (b.status, b.error_code, b.error) == (
        "blocked",
        "dependency_failed",
        "Blocked: dependency a failed",
    )
    assert (c.status, c.error) == ("blocked", "Blocked: dependency b blocked")
    assert store.requeue("b") is None  # blocked is not retryable: retry the failed dependency
    assert store.requeue("a") == ids
    assert [j.status for j in store.list_jobs()] == ["queued"] * 3


def test_cancelling_a_waiting_job_blocks_its_dependents(tmp_path: Path) -> None:
    store, _ = _chain(tmp_path)
    assert store.cancel_waiting("b") == ["b", "c"]
    assert store.cancel_waiting("b") is None
    c = store.get("c")
    assert c is not None and c.status == "blocked"
