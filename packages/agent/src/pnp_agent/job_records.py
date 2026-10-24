"""Plain records of the job queue (no SQL): jobs, attempts, exports and attempt outcomes."""

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


@dataclass(frozen=True)
class AttemptRecord:
    n: int
    status: str
    started_at: str
    finished_at: str | None
    exit_code: int | None
    error: str | None
    log_path: Path


@dataclass(frozen=True)
class JobRecord:
    id: str
    project: str
    kind: str  # "render" | "composite"
    status: str
    priority: int
    revision_id: str | None
    export_id: str | None
    request: dict[str, Any]
    created_at: str
    started_at: str | None
    finished_at: str | None
    lease_until: float | None
    attempt: int
    error: str | None
    error_code: str | None
    artifact_id: str | None
    animations_done: int
    progress_pct: float | None
    depends_on: tuple[str, ...]


@dataclass(frozen=True)
class ExportRecord:
    id: str
    project: str
    composition: str
    format: str
    quality: str
    revision_id: str
    idempotency_key: str | None
    request_hash: str
    created_at: str


@dataclass(frozen=True)
class Finish:
    """How one attempt of a running job ended."""

    status: str
    error: str | None = None
    error_code: str | None = None
    artifact_id: str | None = None
    exit_code: int | None = None


def new_job(
    jid: str,
    project: str,
    kind: str,
    priority: int,
    request: dict[str, Any],
    *,
    revision_id: str | None,
    export_id: str | None = None,
    depends_on: tuple[str, ...] = (),
) -> JobRecord:
    return JobRecord(
        jid, project, kind, "queued", priority, revision_id, export_id, request, now_iso(),
        None, None, None, 0, None, None, None, 0, None, depends_on,
    )  # fmt: skip
