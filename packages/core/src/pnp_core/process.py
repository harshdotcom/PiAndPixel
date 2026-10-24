"""Run one render subprocess in its own process group, under rlimits and a watchdog."""

import codecs
import contextlib
import os
import select
import shutil
import signal
import subprocess
import sys
import threading
import time
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass, field
from pathlib import Path

_POLL_S = 0.2
_SIZE_CHECK_S = 1.0
_TERM_GRACE_S = 5.0
# After the leader exits and its group is killed, only a child that left the group
# (setsid) can still hold the output pipe; stop waiting for it after this long.
_DRAIN_S = 2.0
_READ_BYTES = 65536

# Applies the rlimits, then execs the real command in the same process. This replaces
# preexec_fn, which is unsafe in the multi-threaded Agent.
_LAUNCHER = """\
import os, resource, sys
for kind, value in ((resource.RLIMIT_AS, sys.argv[1]), (resource.RLIMIT_NPROC, sys.argv[2])):
    limit = int(value)
    if limit > 0:
        hard = resource.getrlimit(kind)[1]
        if hard != resource.RLIM_INFINITY:
            limit = min(limit, hard)
        resource.setrlimit(kind, (limit, limit))
os.execv(sys.argv[3], sys.argv[4:])
"""


def _default_memory_bytes() -> int | None:
    try:
        total = os.sysconf("SC_PHYS_PAGES") * os.sysconf("SC_PAGE_SIZE")
    except (ValueError, OSError):
        return None
    # RLIMIT_AS caps address space, not resident memory: a draft Manim render already
    # maps about 2 GB, so the floor keeps small machines able to render at all.
    return max(total * 3 // 4, 4 << 30)


class CancelToken:
    def __init__(self) -> None:
        self._event = threading.Event()

    def cancel(self) -> None:
        self._event.set()

    @property
    def cancelled(self) -> bool:
        return self._event.is_set()


@dataclass(frozen=True)
class RenderLimits:
    timeout_s: float = 900.0
    max_output_bytes: int = 2_000_000_000
    memory_bytes: int | None = field(default_factory=_default_memory_bytes)
    # RLIMIT_NPROC counts every process and thread of the user, so the render's limit is
    # the user's current count plus this headroom. None disables it.
    extra_processes: int | None = 512


@dataclass(frozen=True)
class ProcessOutcome:
    exit_code: int | None
    # Why the watchdog killed the process: "timed_out", "cancelled" or "too_large".
    killed_for: str | None


def _dir_size(path: Path) -> int:
    total = 0
    for dirpath, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += os.lstat(os.path.join(dirpath, name)).st_size
            except OSError:
                continue
    return total


def _user_task_count() -> int | None:
    """Processes plus threads of this user, as RLIMIT_NPROC counts them (Linux only)."""
    proc = Path("/proc")
    if not (proc / "self" / "status").is_file():
        return None
    uid, total = str(os.getuid()), 0
    for status in proc.glob("[0-9]*/status"):
        with contextlib.suppress(OSError, ValueError):
            fields = dict(ln.split(":", 1) for ln in status.read_text().splitlines() if ":" in ln)
            if fields.get("Uid", "").split()[:1] == [uid]:
                total += int(fields.get("Threads", "1"))
    return total


def _nproc_limit(limits: RenderLimits) -> int:
    count = _user_task_count() if limits.extra_processes is not None else None
    return 0 if count is None or limits.extra_processes is None else count + limits.extra_processes


def _signal_group(pgid: int, sig: signal.Signals) -> None:
    with contextlib.suppress(ProcessLookupError, PermissionError):
        os.killpg(pgid, sig)


def _kill_tree(proc: subprocess.Popen[bytes]) -> None:
    pgid = proc.pid  # start_new_session makes the child its own group leader
    _signal_group(pgid, signal.SIGTERM)
    with contextlib.suppress(subprocess.TimeoutExpired):
        proc.wait(timeout=_TERM_GRACE_S)
    # Also reaps grandchildren that ignored SIGTERM or outlived the leader.
    _signal_group(pgid, signal.SIGKILL)


class _Watchdog:
    """Decides when the render must be killed: cancel, timeout or too much output."""

    def __init__(self, limits: RenderLimits, cancel: CancelToken | None, output_dir: Path) -> None:
        self._deadline = time.monotonic() + limits.timeout_s
        self._max_bytes = limits.max_output_bytes
        self._cancel = cancel
        self._output_dir = output_dir
        self._next_size_check = 0.0
        self.killed_for: str | None = None

    def should_kill(self) -> bool:
        """True once, when a limit is first exceeded."""
        if self.killed_for is not None:
            return False
        now = time.monotonic()
        if self._cancel is not None and self._cancel.cancelled:
            self.killed_for = "cancelled"
        elif now >= self._deadline:
            self.killed_for = "timed_out"
        elif now >= self._next_size_check:
            self._next_size_check = now + _SIZE_CHECK_S
            if _dir_size(self._output_dir) > self._max_bytes:
                self.killed_for = "too_large"
        return self.killed_for is not None


def _read_lines(proc: subprocess.Popen[bytes], watchdog: _Watchdog) -> Iterator[str]:
    """Yield output lines while enforcing the limits, until the leader and the pipe are done."""
    assert proc.stdout is not None
    fd = proc.stdout.fileno()
    decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
    pending, watched, leader_done_at = "", [fd], None
    while leader_done_at is None or (watched and time.monotonic() - leader_done_at < _DRAIN_S):
        if watchdog.should_kill():
            _kill_tree(proc)
        if leader_done_at is None and proc.poll() is not None:
            # Stray children must not keep the pipe, and so the render, alive.
            _signal_group(proc.pid, signal.SIGKILL)
            leader_done_at = time.monotonic()
        ready, _, _ = select.select(watched, [], [], _POLL_S)
        if not ready:
            continue
        chunk = os.read(fd, _READ_BYTES)
        if not chunk:
            watched = []
            continue
        *lines, pending = (pending + decoder.decode(chunk)).split("\n")
        yield from (line.removesuffix("\r") for line in lines)
    pending += decoder.decode(b"", final=True)
    if pending:
        yield pending.removesuffix("\r")


def _spawn(
    cmd: list[str], cwd: Path, env: Mapping[str, str], limits: RenderLimits
) -> subprocess.Popen[bytes]:
    program = shutil.which(cmd[0], path=env.get("PATH", os.defpath))
    if program is None:
        raise FileNotFoundError(f"{cmd[0]}: command not found")
    memory = str(limits.memory_bytes or 0)
    launcher = [sys.executable, "-I", "-c", _LAUNCHER, memory, str(_nproc_limit(limits))]
    return subprocess.Popen(
        [*launcher, program, *cmd],
        cwd=cwd,
        env=dict(env),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )


def run_process(
    cmd: list[str],
    *,
    cwd: Path,
    env: Mapping[str, str],
    log_path: Path,
    output_dir: Path,
    limits: RenderLimits,
    on_line: Callable[[str], None] | None,
    cancel: CancelToken | None,
) -> ProcessOutcome:
    """Run cmd, tee its merged output to log_path and on_line, and enforce limits."""
    proc = _spawn(cmd, cwd, env, limits)
    watchdog = _Watchdog(limits, cancel, output_dir)
    try:
        with log_path.open("a", encoding="utf-8") as log:
            for line in _read_lines(proc, watchdog):
                log.write(line + "\n")
                log.flush()
                if on_line is not None:
                    on_line(line)
        exit_code = proc.wait()
    finally:
        # Always reap what is left of the group, also after a normal exit.
        _signal_group(proc.pid, signal.SIGKILL)
        proc.wait()
        if proc.stdout is not None:
            proc.stdout.close()
    return ProcessOutcome(exit_code=exit_code, killed_for=watchdog.killed_for)
