"""Durability: shutdown, restart on the same state.db, and expired-lease (crash) recovery."""

import shutil
from pathlib import Path

import pytest
from agent_helpers import (
    AUTH,
    FakeRunner,
    GatedRunner,
    create_project,
    fake_prober,
    start_render,
    wait_for_job,
    wait_until,
)
from fastapi.testclient import TestClient
from pnp_agent.app import create_app
from pnp_agent.db import db_path
from pnp_agent.job_records import new_job
from pnp_agent.job_store import JobStore
from pnp_agent.settings import Settings

INTERRUPTED = "The Agent stopped before this job finished"


def _job(client: TestClient, jid: str) -> dict[str, object]:
    return client.get(f"/api/v1/jobs/{jid}", headers=AUTH).json()


def test_shutdown_interrupts_running_and_keeps_queued(settings: Settings) -> None:
    runner = GatedRunner()
    with TestClient(create_app(settings, runner=runner, prober=fake_prober)) as client:
        pid = create_project(client)
        running, queued = start_render(client, pid), start_render(client, pid)
        assert runner.started.wait(5)

    fresh = FakeRunner()
    with TestClient(create_app(settings, runner=fresh, prober=fake_prober)) as client:
        assert wait_for_job(client, queued)["status"] == "completed"
        job = _job(client, running)
        assert (job["status"], job["error"], job["error_code"]) == (
            "interrupted",
            INTERRUPTED,
            "interrupted",
        )
        assert job["attempts"][0]["status"] == "interrupted"  # type: ignore[index]
        client.post(f"/api/v1/jobs/{running}/retry", headers=AUTH)
        retried = wait_for_job(client, running)
    assert (retried["status"], retried["attempt"]) == ("completed", 2)
    # The retry renders the revision the job was submitted with.
    assert {r.project_root for r in fresh.requests} == {
        settings.workspace / pid / ".pnp" / "revisions" / str(retried["revision_id"]) / "src"
    }


def _claim_expired(store: JobStore, workspace: Path, project: str, jid: str) -> None:
    """What a crashed worker leaves behind: a running job whose lease has already run out."""

    def log_path(job: object, n: int) -> Path:
        return workspace / project / ".pnp" / "jobs" / jid / f"attempt-{n}" / "render.log"

    store.add_jobs([new_job(jid, project, "render", 0, {"scene": "x"}, revision_id=None)])
    claimed = store.claim(-1.0, log_path)
    assert claimed is not None and claimed.id == jid
    attempt = log_path(claimed, 1).parent
    (attempt / "src" / "scenes").mkdir(parents=True)
    (attempt / "render.log").write_text("Rendering...\n")


def test_expired_lease_is_recovered_on_start(settings: Settings) -> None:
    with TestClient(create_app(settings, runner=FakeRunner(), prober=fake_prober)) as client:
        pid = create_project(client)
    store = JobStore(db_path(settings.workspace))
    _claim_expired(store, settings.workspace, pid, "x" * 32)
    dependent = new_job("d" * 32, pid, "composite", 20, {}, revision_id=None,
                        depends_on=("x" * 32,))  # fmt: skip
    store.add_jobs([dependent])

    with TestClient(create_app(settings, runner=FakeRunner(), prober=fake_prober)) as client:
        job = _job(client, "x" * 32)
        blocked = _job(client, "d" * 32)
    assert (job["status"], job["error_code"]) == ("interrupted", "interrupted")
    assert job["log_tail"] == ["Rendering..."]
    assert (blocked["status"], blocked["error_code"]) == ("blocked", "dependency_failed")
    attempt = settings.workspace / pid / ".pnp" / "jobs" / ("x" * 32) / "attempt-1"
    assert sorted(p.name for p in attempt.iterdir()) == ["render.log"]


def test_expired_lease_is_recovered_by_the_idle_worker(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("pnp_agent.worker.POLL_S", 0.05)
    runner = GatedRunner()
    with TestClient(create_app(settings, runner=runner, prober=fake_prober)) as client:
        pid = create_project(client)
        busy = start_render(client, pid)
        assert runner.started.wait(5)  # the worker is busy, so it cannot claim the next job
        _claim_expired(JobStore(db_path(settings.workspace)), settings.workspace, pid, "y" * 32)
        runner.gate.set()
        wait_for_job(client, busy)
        job = wait_until(
            client, f"/api/v1/jobs/{'y' * 32}", done=lambda j: j["status"] != "running"
        )
    assert job["status"] == "interrupted"


def test_retry_with_a_missing_revision_fails_with_internal_error(settings: Settings) -> None:
    runner = FakeRunner(fail_with="NameError: x")
    with TestClient(create_app(settings, runner=runner, prober=fake_prober)) as client:
        pid = create_project(client)
        jid = start_render(client, pid)
        assert wait_for_job(client, jid)["status"] == "failed"
        shutil.rmtree(settings.workspace / pid / ".pnp" / "revisions")
        runner.fail_with = None
        client.post(f"/api/v1/jobs/{jid}/retry", headers=AUTH)
        job = wait_for_job(client, jid)
    assert (job["status"], job["error_code"], job["attempt"]) == ("failed", "internal_error", 2)
    assert len(runner.requests) == 1
