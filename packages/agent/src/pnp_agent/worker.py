"""The single worker thread: claims the next runnable job, keeps its lease, runs it."""

from __future__ import annotations

import logging
import re
import shutil
import sqlite3
import threading
from collections.abc import Callable, Iterable
from pathlib import Path

from pnp_core.render import CancelToken

from pnp_agent.events import EventHub
from pnp_agent.exports import export_json, export_status_event
from pnp_agent.job_records import Finish, JobRecord
from pnp_agent.job_runs import Tools, run_composite, run_render
from pnp_agent.job_store import JobStore

LEASE_S = 30.0  # lease_until = now + LEASE_S on claim and on every heartbeat
HEARTBEAT_S = 10.0
POLL_S = 1.0  # idle worker poll (also runs expired-lease recovery)
INTERRUPTED = "The Agent stopped before this job finished"
_JOIN_S = 30.0
_KEEP = re.compile(r"^(.*\.log|ctx\.json|manim\.cfg)$")
_ANIMATION_DONE = re.compile(r"Animation \d+ : Partial movie file written")
_log = logging.getLogger(__name__)


def attempt_dir(workspace: Path, job: JobRecord, n: int) -> Path:
    return workspace / job.project / ".pnp" / "jobs" / job.id / f"attempt-{n}"


def log_name(kind: str) -> str:
    return "render.log" if kind == "render" else "composite.log"


def clean_attempt(path: Path) -> None:
    """Delete bulky scratch; logs, ctx.json and manim.cfg stay for debugging."""
    if not path.is_dir():
        return
    for entry in path.iterdir():
        if _KEEP.match(entry.name) and entry.is_file():
            continue
        if entry.is_dir() and not entry.is_symlink():
            shutil.rmtree(entry, ignore_errors=True)
        else:
            entry.unlink(missing_ok=True)


def publish_changes(store: JobStore, events: EventHub, ids: Iterable[str]) -> None:
    """job.status for each changed job, then export.status once per affected export."""
    exports: list[str] = []
    for jid in dict.fromkeys(ids):
        job = store.get(jid)
        if job is None:
            continue
        events.publish(
            {"type": "job.status", "job_id": job.id, "project": job.project, "kind": job.kind,
             "export_id": job.export_id, "status": job.status, "attempt": job.attempt,
             "error": job.error, "error_code": job.error_code, "artifact_id": job.artifact_id}
        )  # fmt: skip
        if job.export_id and job.export_id not in exports:
            exports.append(job.export_id)
    for eid in exports:
        export = store.get_export(eid)
        if export is not None:
            events.publish(export_status_event(export_json(export, store.export_jobs(eid))))


class Worker:
    def __init__(self, workspace: Path, store: JobStore, events: EventHub, tools: Tools) -> None:
        self._workspace = workspace
        self._store = store
        self._events = events
        self._tools = tools
        # Held while claiming, so a cancel never misses a job that is just starting.
        self.lock = threading.Lock()
        self._current: tuple[str, CancelToken] | None = None
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._thread = threading.Thread(target=self._loop, name="pnp-worker", daemon=True)

    def start(self) -> None:
        self.recover()
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()
        with self.lock:
            if self._current is not None:
                self._current[1].cancel()
        if self._thread.is_alive():
            self._thread.join(_JOIN_S)

    def wake(self) -> None:
        """New work was queued: skip the rest of the idle poll."""
        self._wake.set()

    def cancel_running(self, jid: str) -> bool:
        """Call with `lock` held. True when `jid` is the job this worker is running."""
        if self._current is None or self._current[0] != jid:
            return False
        self._current[1].cancel()
        return True

    def recover(self) -> None:
        expired, blocked = self._store.expire_leases(INTERRUPTED)
        for job in expired:
            clean_attempt(attempt_dir(self._workspace, job, job.attempt))
        publish_changes(self._store, self._events, [*(j.id for j in expired), *blocked])

    def _claim(self) -> tuple[JobRecord, CancelToken] | None:
        def log_path(job: JobRecord, n: int) -> Path:
            return attempt_dir(self._workspace, job, n) / log_name(job.kind)

        with self.lock:
            if self._stop.is_set():
                return None
            job = self._store.claim(LEASE_S, log_path)
            if job is None:
                return None
            self._current = (job.id, CancelToken())
            return job, self._current[1]

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                claimed = self._claim()
                if claimed is None:
                    self.recover()
                    self._wake.wait(POLL_S)
                    self._wake.clear()
                    continue
                self._run(*claimed)
            except Exception:  # keep the queue alive; the job's lease expires if it was claimed
                _log.exception("worker loop error")
                self._stop.wait(POLL_S)
            finally:
                with self.lock:
                    self._current = None

    def _run(self, job: JobRecord, cancel: CancelToken) -> None:
        publish_changes(self._store, self._events, [job.id])
        workdir = attempt_dir(self._workspace, job, job.attempt)
        workdir.mkdir(parents=True, exist_ok=True)
        beat_done = threading.Event()
        beat = threading.Thread(target=self._heartbeat, args=(job.id, beat_done), daemon=True)
        beat.start()
        try:
            end = self._outcome(job, workdir, cancel)
        finally:
            beat_done.set()
            beat.join()
        if end.status == "cancelled" and self._stop.is_set():
            # The user did not cancel: the Agent is stopping, so the job can be retried.
            end = Finish("interrupted", INTERRUPTED, "interrupted", None, end.exit_code)
        clean_attempt(workdir)
        blocked = self._store.finish(job.id, job.attempt, end)
        publish_changes(self._store, self._events, [job.id, *blocked])

    def _heartbeat(self, jid: str, done: threading.Event) -> None:
        while not done.wait(HEARTBEAT_S):
            try:
                self._store.heartbeat(jid, LEASE_S)
            except sqlite3.Error:  # try again next beat; the lease outlives a few misses
                _log.exception("heartbeat failed for job %s", jid)

    def _outcome(self, job: JobRecord, workdir: Path, cancel: CancelToken) -> Finish:
        try:
            if job.kind == "render":
                return run_render(self._workspace, job, workdir, cancel, self._tools,
                                  self._render_lines(job))  # fmt: skip
            return run_composite(self._workspace, job, workdir, cancel, self._tools, self._store,
                                 self._log_line(job), self._composite_progress(job))  # fmt: skip
        except Exception as exc:  # a bug here must not leave the job "running" forever
            _log.exception("job %s failed internally", job.id)
            return Finish("failed", f"Internal error: {exc}", "internal_error")

    def _log_line(self, job: JobRecord) -> Callable[[str], None]:
        def on_line(line: str) -> None:
            self._events.publish({"type": "job.log", "job_id": job.id, "project": job.project,
                                  "attempt": job.attempt, "line": line.rstrip("\r\n")})  # fmt: skip

        return on_line

    def _render_lines(self, job: JobRecord) -> Callable[[str], None]:
        log = self._log_line(job)
        done = 0

        def on_line(line: str) -> None:
            nonlocal done
            log(line)
            if _ANIMATION_DONE.search(line):
                done += 1
                self._store.set_progress(job.id, animations_done=done)
                self._events.publish({"type": "job.progress", "job_id": job.id, "kind": "render",
                                      "project": job.project, "animations_done": done})  # fmt: skip

        return on_line

    def _composite_progress(self, job: JobRecord) -> Callable[[float], None]:
        last = -1.0

        def on_progress(pct: float) -> None:
            nonlocal last
            if pct - last < 1.0 and not (pct >= 100.0 > last):
                return
            last = pct
            self._store.set_progress(job.id, pct=pct)
            self._events.publish({"type": "job.progress", "job_id": job.id, "kind": "composite",
                                  "project": job.project, "pct": pct})  # fmt: skip

        return on_progress
