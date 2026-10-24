"""All SQL for jobs, attempts, dependencies and exports (state.db)."""

import json
import sqlite3
import time
from collections.abc import Callable, Iterator, Sequence
from contextlib import closing, contextmanager
from dataclasses import astuple
from pathlib import Path
from typing import Any

from pnp_agent.db import connect
from pnp_agent.job_deps import (
    RETRYABLE,
    block_dependents,
    has_blocking_dep,
    unblock_dependents,
)
from pnp_agent.job_records import AttemptRecord, ExportRecord, Finish, JobRecord, now_iso

_JOB_COLUMNS = (
    "id, project, kind, status, priority, revision_id, export_id, request, created_at,"
    " started_at, finished_at, lease_until, attempt, error, error_code, artifact_id,"
    " animations_done, progress_pct"
)
_RUNNABLE = (
    "SELECT * FROM jobs j WHERE status = 'queued' AND NOT EXISTS (SELECT 1 FROM job_deps d"
    " JOIN jobs p ON p.id = d.depends_on WHERE d.job_id = j.id AND p.status != 'completed')"
    " ORDER BY priority, rowid LIMIT 1"
)


def _job(conn: sqlite3.Connection, row: sqlite3.Row) -> JobRecord:
    deps = conn.execute(
        "SELECT depends_on FROM job_deps WHERE job_id = ? ORDER BY rowid", (row["id"],)
    ).fetchall()
    values = dict(row)
    values["request"] = json.loads(row["request"])
    return JobRecord(**values, depends_on=tuple(d[0] for d in deps))


def _get(conn: sqlite3.Connection, jid: str) -> JobRecord | None:
    row = conn.execute("SELECT * FROM jobs WHERE id = ?", (jid,)).fetchone()
    return _job(conn, row) if row else None


def _insert_job(conn: sqlite3.Connection, job: JobRecord) -> None:
    values = list(astuple(job))[:-1]
    values[7] = json.dumps(job.request)
    marks = ", ".join("?" * len(values))
    conn.execute(f"INSERT INTO jobs ({_JOB_COLUMNS}) VALUES ({marks})", values)
    conn.executemany(
        "INSERT INTO job_deps (job_id, depends_on) VALUES (?, ?)",
        [(job.id, dep) for dep in job.depends_on],
    )


def _end(conn: sqlite3.Connection, job: JobRecord, end: Finish) -> list[str]:
    """Finish the running attempt; returns the dependents that became blocked."""
    now = now_iso()
    conn.execute(
        "UPDATE jobs SET status = ?, error = ?, error_code = ?, artifact_id = ?,"
        " finished_at = ?, lease_until = NULL WHERE id = ?",
        (end.status, end.error, end.error_code, end.artifact_id, now, job.id),
    )
    conn.execute(
        "UPDATE job_attempts SET status = ?, finished_at = ?, exit_code = ?, error = ?"
        " WHERE job_id = ? AND n = ?",
        (end.status, now, end.exit_code, end.error, job.id, job.attempt),
    )
    return [] if end.status == "completed" else block_dependents(conn, job.id, end.status)


class JobStore:
    """Jobs, attempts, dependencies and exports; connections come from db.connect()."""

    def __init__(self, path: Path) -> None:
        self._path = path

    @contextmanager
    def _read(self) -> Iterator[sqlite3.Connection]:
        # A short-lived connection per call: callers run on many threads.
        with closing(connect(self._path)) as conn:
            yield conn

    @contextmanager
    def _write(self) -> Iterator[sqlite3.Connection]:
        with self._read() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                yield conn
            except BaseException:
                conn.execute("ROLLBACK")
                raise
            conn.execute("COMMIT")

    def get(self, jid: str) -> JobRecord | None:
        with self._read() as conn:
            return _get(conn, jid)

    def list_jobs(
        self, project: str | None = None, kind: str | None = None, limit: int = 100
    ) -> list[JobRecord]:
        with self._read() as conn:
            rows = conn.execute(
                "SELECT * FROM jobs WHERE (?1 IS NULL OR project = ?1)"
                " AND (?2 IS NULL OR kind = ?2) ORDER BY created_at DESC, rowid DESC LIMIT ?3",
                (project, kind, limit),
            ).fetchall()
            return [_job(conn, r) for r in rows]

    def export_jobs(self, eid: str) -> list[JobRecord]:
        """The export's jobs in creation order: units first, the composite last."""
        with self._read() as conn:
            rows = conn.execute(
                "SELECT * FROM jobs WHERE export_id = ? ORDER BY rowid", (eid,)
            ).fetchall()
            return [_job(conn, r) for r in rows]

    def attempts(self, jid: str) -> list[AttemptRecord]:
        with self._read() as conn:
            rows = conn.execute(
                "SELECT n, status, started_at, finished_at, exit_code, error, log_path"
                " FROM job_attempts WHERE job_id = ? ORDER BY n",
                (jid,),
            ).fetchall()
        return [AttemptRecord(*r[:6], log_path=Path(r["log_path"])) for r in rows]

    def add_jobs(self, jobs: Sequence[JobRecord]) -> None:
        with self._write() as conn:
            for job in jobs:
                _insert_job(conn, job)

    def import_job(self, job: JobRecord, attempt: AttemptRecord | None) -> bool:
        """Insert a job (and its one attempt) unless the id exists; True when inserted."""
        with self._write() as conn:
            if _get(conn, job.id) is not None:
                return False
            _insert_job(conn, job)
            if attempt is not None:
                conn.execute(
                    "INSERT INTO job_attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (job.id, *astuple(attempt)[:6], str(attempt.log_path)),
                )
            return True

    def claim(self, lease_s: float, log_path: Callable[[JobRecord, int], Path]) -> JobRecord | None:
        """Start the next runnable job's next attempt (priority ASC, then FIFO)."""
        with self._write() as conn:
            row = conn.execute(_RUNNABLE).fetchone()
            if row is None:
                return None
            job, now = _job(conn, row), now_iso()
            n = job.attempt + 1
            conn.execute(
                "UPDATE jobs SET status = 'running', attempt = ?, lease_until = ?, started_at = ?,"
                " finished_at = NULL, error = NULL, error_code = NULL, artifact_id = NULL,"
                " animations_done = 0, progress_pct = NULL WHERE id = ?",
                (n, time.time() + lease_s, now, job.id),
            )
            conn.execute(
                "INSERT INTO job_attempts (job_id, n, status, started_at, log_path)"
                " VALUES (?, ?, 'running', ?, ?)",
                (job.id, n, now, str(log_path(job, n))),
            )
            return _get(conn, job.id)

    def heartbeat(self, jid: str, lease_s: float) -> None:
        with self._write() as conn:
            conn.execute(
                "UPDATE jobs SET lease_until = ? WHERE id = ? AND status = 'running'",
                (time.time() + lease_s, jid),
            )

    def set_progress(self, jid: str, *, animations_done: int = 0, pct: float | None = None) -> None:
        with self._write() as conn:
            conn.execute(
                "UPDATE jobs SET animations_done = ?, progress_pct = ? WHERE id = ?",
                (animations_done, pct, jid),
            )

    def finish(self, jid: str, attempt: int, end: Finish) -> list[str]:
        """End attempt `attempt` if it is still the running one; returns newly blocked ids."""
        with self._write() as conn:
            job = _get(conn, jid)
            if job is None or job.status != "running" or job.attempt != attempt:
                return []
            return _end(conn, job, end)

    def expire_leases(self, error: str) -> tuple[list[JobRecord], list[str]]:
        """Running jobs whose lease ran out (their worker died) → interrupted.

        Returns those jobs (as they were) and the dependents that became blocked.
        """
        with self._write() as conn:
            rows = conn.execute(
                "SELECT * FROM jobs WHERE status = 'running' AND lease_until < ?", (time.time(),)
            ).fetchall()
            expired = [_job(conn, r) for r in rows]
            blocked: list[str] = []
            for job in expired:
                blocked += _end(conn, job, Finish("interrupted", error, "interrupted"))
            return expired, blocked

    def cancel_waiting(self, jid: str) -> list[str] | None:
        """queued/blocked → cancelled; returns it and the dependents that became blocked."""
        with self._write() as conn:
            changed = conn.execute(
                "UPDATE jobs SET status = 'cancelled', finished_at = ?, error = 'Cancelled',"
                " error_code = 'cancelled' WHERE id = ? AND status IN ('queued', 'blocked')",
                (now_iso(), jid),
            ).rowcount
            return [jid, *block_dependents(conn, jid, "cancelled")] if changed else None

    def requeue(self, jid: str) -> list[str] | None:
        """Retry a failed/timed_out/cancelled/interrupted job; None when not retryable.

        Returns the ids whose status changed: the job (queued, or blocked when one of its own
        dependencies is still failing) and every dependent that became queued again.
        """
        with self._write() as conn:
            job = _get(conn, jid)
            if job is None or job.status not in RETRYABLE:
                return None
            if has_blocking_dep(conn, jid):
                conn.execute(
                    "UPDATE jobs SET status = 'blocked', finished_at = NULL, error = ?,"
                    " error_code = 'dependency_failed' WHERE id = ?",
                    (f"Blocked: dependency of {jid} not completed", jid),
                )
                return [jid]
            conn.execute(
                "UPDATE jobs SET status = 'queued', finished_at = NULL, error = NULL,"
                " error_code = NULL WHERE id = ?",
                (jid,),
            )
            return [jid, *unblock_dependents(conn, jid)]

    def create_export(
        self, export: ExportRecord, jobs: Sequence[JobRecord]
    ) -> tuple[ExportRecord, bool]:
        """Insert the export and its jobs atomically, or return the one with the same key."""
        with self._write() as conn:
            if export.idempotency_key is not None:
                existing = _export_where(conn, "project = ? AND idempotency_key = ?",
                                         (export.project, export.idempotency_key))  # fmt: skip
                if existing:
                    return existing[0], False
            conn.execute("INSERT INTO exports VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", astuple(export))
            for job in jobs:
                _insert_job(conn, job)
            return export, True

    def get_export(self, eid: str) -> ExportRecord | None:
        with self._read() as conn:
            found = _export_where(conn, "id = ?", (eid,))
        return found[0] if found else None

    def list_exports(self, project: str | None = None, limit: int = 100) -> list[ExportRecord]:
        with self._read() as conn:
            return _export_where(conn, "?1 IS NULL OR project = ?1", (project,), limit)

    def artifact_project(self, artifact_id: str) -> str | None:
        with self._read() as conn:
            row = conn.execute(
                "SELECT project FROM jobs WHERE artifact_id = ?", (artifact_id,)
            ).fetchone()
        return row[0] if row else None


def _export_where(
    conn: sqlite3.Connection, where: str, args: tuple[Any, ...], limit: int = 100
) -> list[ExportRecord]:
    rows = conn.execute(
        f"SELECT * FROM exports WHERE {where} ORDER BY created_at DESC, rowid DESC LIMIT {limit}",
        args,
    ).fetchall()
    return [ExportRecord(*r) for r in rows]
