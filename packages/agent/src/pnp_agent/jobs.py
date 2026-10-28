"""The durable job queue (state.db): submit, follow, cancel and retry renders and exports."""

import uuid
from collections import deque
from collections.abc import Callable, Mapping, Sequence
from contextlib import closing
from dataclasses import replace
from pathlib import Path
from typing import Any, Protocol

from pnp_core.artifacts import ArtifactStore
from pnp_core.compose import ComposeRequest, ComposeResult
from pnp_core.formats import Output, Quality
from pnp_core.manifest import Clip
from pnp_core.probe import MediaInfo
from pnp_core.render import CancelToken, RenderLimits, RenderRequest, RenderResult, ToolPaths
from pnp_core.revisions import snapshot_project

from pnp_agent import db
from pnp_agent.errors import ApiError
from pnp_agent.events import EventHub
from pnp_agent.exports import export_json, plan_units, request_hash
from pnp_agent.job_deps import RETRYABLE
from pnp_agent.job_records import ExportRecord, Finish, JobRecord, new_job, now_iso
from pnp_agent.job_runs import Tools
from pnp_agent.job_store import JobStore
from pnp_agent.legacy_jobs import import_legacy_jobs
from pnp_agent.render_options import output_request
from pnp_agent.worker import Worker, publish_changes

PRIORITY_INTERACTIVE = 0  # render below 1080p (quality draft or preview)
PRIORITY_FINAL = 10  # render at 1080p or more (quality final)
PRIORITY_COMPOSITE = 20
LOG_TAIL = 50
_CANCELLABLE = ("queued", "running", "blocked")


class RenderRunner(Protocol):
    def __call__(
        self,
        req: RenderRequest,
        workdir: Path,
        *,
        tools: ToolPaths = ...,
        limits: RenderLimits = ...,
        on_line: Callable[[str], None] | None = ...,
        cancel: CancelToken | None = ...,
    ) -> RenderResult: ...


class Composer(Protocol):
    def __call__(
        self,
        req: ComposeRequest,
        workdir: Path,
        *,
        tools: ToolPaths = ...,
        limits: RenderLimits = ...,
        on_line: Callable[[str], None] | None = ...,
        on_progress: Callable[[float], None] | None = ...,
        cancel: CancelToken | None = ...,
    ) -> ComposeResult: ...


Prober = Callable[[Path], MediaInfo]


def _priority(output: Output) -> int:
    return PRIORITY_FINAL if output.quality == Quality.FINAL else PRIORITY_INTERACTIVE


def _tail(path: Path) -> list[str]:
    try:
        with path.open(encoding="utf-8", errors="replace") as log:
            return [line.rstrip("\r\n") for line in deque(log, maxlen=LOG_TAIL)]
    except OSError:
        return []


class JobManager:
    def __init__(
        self,
        workspace: Path,
        *,
        runner: RenderRunner,
        prober: Prober,
        composer: Composer,
        tools: ToolPaths,
        limits: RenderLimits,
        events: EventHub,
    ) -> None:
        self._workspace = workspace
        self._store = JobStore(db.db_path(workspace))
        self._events = events
        self._worker = Worker(
            workspace, self._store, events, Tools(runner, prober, composer, tools, limits)
        )
        self._started = False

    def start(self) -> None:
        import_legacy_jobs(self._store, self._workspace)
        self._worker.start()
        self._started = True

    def shutdown(self) -> None:
        """The running job becomes interrupted; queued jobs stay queued for the next start."""
        if self._started:
            self._started = False
            self._worker.stop()

    def _changed(self, ids: Sequence[str]) -> None:
        publish_changes(self._store, self._events, ids)
        self._worker.wake()

    def _snapshot(self, root: Path) -> str:
        rev = snapshot_project(root, root / ".pnp" / "revisions")
        row = db.RevisionRow(rev.id, rev.created_at, rev.file_count, rev.total_bytes)
        with closing(db.connect(db.db_path(self._workspace))) as conn:
            db.record_revision(conn, root.name, row)
        return rev.id

    def submit_render(
        self,
        root: Path,
        *,
        scene: str,
        fmt_name: str,
        output: Output,
        params: Mapping[str, Any],
    ) -> dict[str, Any]:
        request = {"scene": scene, "format": fmt_name, "params": dict(params),
                   **output_request(output)}  # fmt: skip
        job = new_job(uuid.uuid4().hex, root.name, "render", _priority(output), request,
                      revision_id=self._snapshot(root))  # fmt: skip
        self._store.add_jobs([job])
        self._changed([job.id])
        return self._job_json(job)

    def submit_export(
        self,
        root: Path,
        *,
        composition: str,
        fmt_name: str,
        output: Output,
        clips: Sequence[Clip],
        idempotency_key: str | None,
        delivery_profile: str = "custom",
        voice_audio: dict[str, Any] | list[dict[str, Any]] | None = None,
    ) -> tuple[dict[str, Any], bool]:
        chosen = output_request(output)
        rev_id, eid, project = self._snapshot(root), uuid.uuid4().hex, root.name
        units, clip_units = plan_units(clips)
        artifact_store = ArtifactStore(root / ".pnp" / "artifacts")
        previous_renders = self._store.list_jobs(project, kind="render", limit=5000)
        unit_jobs = []
        for unit in units:
            request = {"scene": unit.scene, "format": fmt_name, "params": unit.params, **chosen}
            cached = next(
                (
                    job
                    for job in previous_renders
                    if job.status == "completed"
                    and job.revision_id == rev_id
                    and job.request == request
                    and job.artifact_id
                    and artifact_store.get(job.artifact_id) is not None
                ),
                None,
            )
            job = new_job(
                uuid.uuid4().hex,
                project,
                "render",
                _priority(output),
                request,
                revision_id=rev_id,
                export_id=eid,
            )
            if cached is not None:
                job = replace(
                    job, status="completed", finished_at=now_iso(), artifact_id=cached.artifact_id
                )
            unit_jobs.append(job)
        composite_request = {
            "composition": composition, "format": fmt_name, **chosen,
            "delivery_profile": delivery_profile,
            "max_duration_s": 180 if delivery_profile == "reels_shorts" else 1800,
            "clips": [{"scene": c.scene, "params": dict(c.params), "unit_job_id": unit_jobs[i].id}
                      for c, i in zip(clips, clip_units, strict=True)],
        }  # fmt: skip
        if voice_audio:
            composite_request["voice_audio"] = voice_audio
        composite = new_job(uuid.uuid4().hex, project, "composite", PRIORITY_COMPOSITE,
                            composite_request, revision_id=rev_id, export_id=eid,
                            depends_on=tuple(j.id for j in unit_jobs))  # fmt: skip
        export = ExportRecord(eid, project, composition, fmt_name, output.quality.value, rev_id,
                              idempotency_key, request_hash(
                                  composition, fmt_name, chosen,
                                  {"delivery_profile": delivery_profile,
                                   "voice_audio": voice_audio},
                              ),
                              now_iso())  # fmt: skip
        record, created = self._store.create_export(export, [*unit_jobs, composite])
        if record.request_hash != export.request_hash:
            raise ApiError(409, "conflict", "This Idempotency-Key was used for another export")
        if created:
            self._changed([*(j.id for j in unit_jobs), composite.id])
        return self._export_json(record), created

    def _job_json(self, job: JobRecord) -> dict[str, Any]:
        attempts = self._store.attempts(job.id)
        return {
            "id": job.id, "project": job.project, "kind": job.kind, "status": job.status,
            "priority": job.priority, "revision_id": job.revision_id,
            "export_id": job.export_id, "depends_on": list(job.depends_on),
            "created_at": job.created_at, "started_at": job.started_at,
            "finished_at": job.finished_at, "attempt": job.attempt,
            "attempts": [{"n": a.n, "status": a.status, "started_at": a.started_at,
                          "finished_at": a.finished_at, "exit_code": a.exit_code,
                          "error": a.error} for a in attempts],
            "request": job.request, "error": job.error, "error_code": job.error_code,
            "log_tail": _tail(attempts[-1].log_path) if attempts else [],
            "progress": {"animations_done": job.animations_done, "pct": job.progress_pct},
            "artifact_id": job.artifact_id,
        }  # fmt: skip

    def _found(self, jid: str) -> JobRecord:
        job = self._store.get(jid)
        if job is None:
            raise ApiError(404, "not_found", f"Job {jid!r} not found")
        return job

    def get(self, jid: str) -> dict[str, Any] | None:
        job = self._store.get(jid)
        return self._job_json(job) if job else None

    def _cancel(self, job: JobRecord) -> list[str] | None:
        """Ids whose status changed now (none for a running job: its worker reports it)."""
        with self._worker.lock:
            if job.status == "running":
                if self._worker.cancel_running(job.id):
                    return []
                # Running in the database but not here: a job the worker lost track of.
                end = Finish("cancelled", "Cancelled", "cancelled")
                return [job.id, *self._store.finish(job.id, job.attempt, end)]
            return self._store.cancel_waiting(job.id)

    def cancel(self, jid: str) -> dict[str, Any]:
        changed = self._cancel(self._found(jid))
        if changed is None:
            message = "Only queued, running or blocked jobs can be cancelled"
            raise ApiError(409, "invalid_state", message)
        self._changed(changed)
        return self._job_json(self._found(jid))

    def retry(self, jid: str) -> dict[str, Any]:
        self._found(jid)
        changed = self._store.requeue(jid)
        if changed is None:
            message = "Only failed, timed out, cancelled or interrupted jobs can be retried"
            raise ApiError(409, "invalid_state", message)
        self._changed(changed)
        return self._job_json(self._found(jid))

    def log_path(self, jid: str, attempt: int | None = None) -> Path | None:
        """The attempt's log (default: latest); None for a job that never ran."""
        attempts = self._store.attempts(self._found(jid).id)
        if attempt is None:
            return attempts[-1].log_path if attempts else None
        for a in attempts:
            if a.n == attempt:
                return a.log_path
        raise ApiError(404, "not_found", f"Job {jid!r} has no attempt {attempt}")

    def _export_json(self, export: ExportRecord) -> dict[str, Any]:
        return export_json(export, self._store.export_jobs(export.id))

    def _found_export(self, eid: str) -> ExportRecord:
        export = self._store.get_export(eid)
        if export is None:
            raise ApiError(404, "not_found", f"Export {eid!r} not found")
        return export

    def get_export(self, eid: str) -> dict[str, Any] | None:
        export = self._store.get_export(eid)
        return self._export_json(export) if export else None

    def list_exports(self, project: str | None = None) -> list[dict[str, Any]]:
        return [self._export_json(e) for e in self._store.list_exports(project)]

    def cancel_export(self, eid: str) -> dict[str, Any]:
        export = self._found_export(eid)
        *units, composite = self._store.export_jobs(eid)
        targets = [j for j in (composite, *units) if j.status in _CANCELLABLE]
        if not targets:
            raise ApiError(409, "invalid_state", "Nothing in this export can be cancelled")
        changed: list[str] = []
        for job in targets:
            changed += self._cancel(self._found(job.id)) or []
        self._changed(changed)
        return self._export_json(export)

    def retry_export(self, eid: str) -> dict[str, Any]:
        export = self._found_export(eid)
        changed: list[str] = []
        # Units first: their retry requeues the blocked composite.
        for job in self._store.export_jobs(eid):
            if self._found(job.id).status in RETRYABLE:
                changed += self._store.requeue(job.id) or []
        if not changed:
            raise ApiError(409, "invalid_state", "Nothing in this export can be retried")
        self._changed(changed)
        return self._export_json(export)

    def artifact_project(self, artifact_id: str) -> str | None:
        return self._store.artifact_project(artifact_id)

    # Last in the class: the name shadows the builtin `list` used in annotations above.
    def list(self, project: str | None = None, kind: str | None = None) -> list[dict[str, Any]]:
        return [self._job_json(j) for j in self._store.list_jobs(project, kind)]
