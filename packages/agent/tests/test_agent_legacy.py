"""One-time import of Cycle-stage job.json records into state.db."""

import json
from pathlib import Path
from typing import Any

from agent_helpers import AUTH, FakeRunner, create_project, fake_prober
from fastapi.testclient import TestClient
from pnp_agent.app import create_app
from pnp_agent.db import db_path
from pnp_agent.job_store import JobStore
from pnp_agent.legacy_jobs import import_legacy_jobs
from pnp_agent.settings import Settings

SCENE = "scenes/proof.py:Proof"


def _write_job(project: Path, jid: str, status: str, **extra: Any) -> Path:
    workdir = project / ".pnp" / "jobs" / jid
    workdir.mkdir(parents=True)
    record = {
        "id": jid,
        "project": project.name,
        "kind": "render",
        "status": status,
        "created_at": "2026-01-01T00:00:00+00:00",
        "started_at": "2026-01-01T00:00:01+00:00",
        "finished_at": None,
        "request": {"scene": SCENE},
        "error": None,
        "log_tail": ["Rendering..."],
        "progress": {"animations_done": 2},
        "artifact_id": None,
        **extra,
    }
    (workdir / "job.json").write_text(json.dumps(record))
    (workdir / "render.log").write_text("Rendering...\n")
    return workdir


def test_running_legacy_job_becomes_interrupted(settings: Settings) -> None:
    with TestClient(create_app(settings, runner=FakeRunner(), prober=fake_prober)) as client:
        pid = create_project(client)
    workdir = _write_job(settings.workspace / pid, "a" * 32, "running")
    for scratch in ("src/scenes", "media/videos/partial_movie_files", "sdk/pnp", "home"):
        (workdir / scratch).mkdir(parents=True)

    with TestClient(create_app(settings, runner=FakeRunner(), prober=fake_prober)) as client:
        job = client.get(f"/api/v1/jobs/{'a' * 32}", headers=AUTH).json()
        logs = client.get(f"/api/v1/jobs/{'a' * 32}/logs", headers=AUTH).text
    assert (job["status"], job["error_code"]) == ("interrupted", "interrupted")
    assert job["finished_at"] is not None
    assert job["revision_id"] is None
    assert job["progress"] == {"animations_done": 2, "pct": None}
    assert [a["status"] for a in job["attempts"]] == ["interrupted"]
    assert logs == "Rendering...\n"
    assert sorted(p.name for p in workdir.iterdir()) == ["job.json", "render.log"]


def test_import_is_idempotent_and_skips_bad_records(settings: Settings) -> None:
    with TestClient(create_app(settings, runner=FakeRunner(), prober=fake_prober)) as client:
        pid = create_project(client)
    project = settings.workspace / pid
    _write_job(project, "b" * 32, "completed", artifact_id="c" * 32,
               finished_at="2026-01-01T00:00:09+00:00")  # fmt: skip
    _write_job(project, "e" * 32, "exploded")
    broken = project / ".pnp" / "jobs" / ("f" * 32)
    broken.mkdir()
    (broken / "job.json").write_text("{not json")

    store = JobStore(db_path(settings.workspace))
    assert import_legacy_jobs(store, settings.workspace) == 1
    assert import_legacy_jobs(store, settings.workspace) == 0
    job = store.get("b" * 32)
    assert job is not None
    assert (job.status, job.artifact_id, job.attempt) == ("completed", "c" * 32, 1)
    assert store.artifact_project("c" * 32) == pid
    assert (project / ".pnp" / "jobs" / ("b" * 32) / "job.json").is_file()
