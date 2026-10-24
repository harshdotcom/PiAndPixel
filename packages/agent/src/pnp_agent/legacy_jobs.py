"""One-time import of Cycle-stage <project>/.pnp/jobs/<id>/job.json records into state.db."""

import json
import shutil
from pathlib import Path

from pnp_agent.job_records import AttemptRecord, JobRecord, now_iso
from pnp_agent.job_store import JobStore
from pnp_agent.worker import INTERRUPTED
from pnp_agent.workspace import project_dirs

_STATUSES = ("completed", "failed", "timed_out", "cancelled", "interrupted")
_ACTIVE = ("queued", "running")
_SCRATCH = ("src", "media", "sdk", "home")  # what a Cycle render left in its job folder


def _read(record: Path, project: str) -> tuple[JobRecord, AttemptRecord | None] | None:
    try:
        data = json.loads(record.read_text("utf-8"))
        status, error, finished = str(data["status"]), data.get("error"), data.get("finished_at")
        if status not in (*_STATUSES, *_ACTIVE):
            return None
        code = None
        if status in _ACTIVE:
            status, error, code, finished = "interrupted", INTERRUPTED, "interrupted", now_iso()
        started = data.get("started_at")
        job = JobRecord(
            str(data["id"]), project, "render", status, 0, None, None, dict(data["request"]),
            str(data["created_at"]), started, finished, None, 1 if started else 0, error, code,
            data.get("artifact_id"), int(data.get("progress", {}).get("animations_done", 0)),
            None, (),
        )  # fmt: skip
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None
    log = record.parent / "render.log"
    attempt = AttemptRecord(1, status, started, finished, None, error, log) if started else None
    return job, attempt


def import_legacy_jobs(store: JobStore, workspace: Path) -> int:
    """Insert every job.json whose id is not in the store yet; returns how many were added."""
    added = 0
    for root in project_dirs(workspace):
        for record in sorted((root / ".pnp" / "jobs").glob("*/job.json")):
            found = _read(record, root.name)
            if found is None or not store.import_job(*found):
                continue
            added += 1
            if found[0].error_code == "interrupted":
                for name in _SCRATCH:
                    shutil.rmtree(record.parent / name, ignore_errors=True)
    return added
