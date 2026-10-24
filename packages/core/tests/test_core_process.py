"""run_process edge cases: stray children, closed pipes and rlimits (Linux process groups)."""

import contextlib
import os
import signal
import sys
import time
from collections.abc import Iterator
from pathlib import Path

import pytest
from pnp_core.process import ProcessOutcome, RenderLimits, run_process


def _alive(pid: int) -> bool:
    try:
        state = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[0]
    except (OSError, IndexError):
        return False
    return state != "Z"


def _wait_dead(pid: int, timeout_s: float = 3.0) -> bool:
    deadline = time.monotonic() + timeout_s
    while _alive(pid) and time.monotonic() < deadline:
        time.sleep(0.05)
    return not _alive(pid)


@pytest.fixture
def pids(tmp_path: Path) -> Iterator[Path]:
    """File the child scripts write grandchild pids to; leftovers are killed afterwards."""
    path = tmp_path / "pids"
    yield path
    for pid in path.read_text().split() if path.exists() else []:
        with contextlib.suppress(ProcessLookupError):
            os.kill(int(pid), signal.SIGKILL)


def run(tmp_path: Path, script: str, **limits: object) -> tuple[ProcessOutcome, float]:
    started = time.monotonic()
    outcome = run_process(
        [sys.executable, "-c", script],
        cwd=tmp_path,
        env={"PATH": os.environ["PATH"]},
        log_path=tmp_path / "log",
        output_dir=tmp_path,
        limits=RenderLimits(**limits),  # type: ignore[arg-type]
        on_line=None,
        cancel=None,
    )
    return outcome, time.monotonic() - started


def spawn_sleep(pids: Path, popen_kwargs: str = "") -> str:
    """A leader that starts `sleep 30`, records its pid and exits at once."""
    return f"""\
import subprocess as sp
p = sp.Popen(["sleep", "30"]{popen_kwargs})
open({str(pids)!r}, "a").write(f"{{p.pid}} ")
print("leader done", flush=True)
"""


def test_child_holding_stdout_does_not_block_or_outlive(tmp_path: Path, pids: Path) -> None:
    outcome, elapsed = run(tmp_path, spawn_sleep(pids), timeout_s=10)
    assert outcome == ProcessOutcome(exit_code=0, killed_for=None)
    assert elapsed < 5
    assert _wait_dead(int(pids.read_text()))
    assert (tmp_path / "log").read_text() == "leader done\n"


def test_detached_child_in_group_is_reaped(tmp_path: Path, pids: Path) -> None:
    script = spawn_sleep(pids, ", stdout=sp.DEVNULL, stderr=sp.DEVNULL")
    outcome, _ = run(tmp_path, script)
    assert outcome.exit_code == 0
    assert _wait_dead(int(pids.read_text()))


def test_child_that_left_the_group_cannot_block(tmp_path: Path, pids: Path) -> None:
    outcome, elapsed = run(tmp_path, spawn_sleep(pids, ", start_new_session=True"))
    assert outcome.exit_code == 0
    assert elapsed < 6


def test_closed_stdout_still_times_out(tmp_path: Path) -> None:
    script = "import os, time\nos.close(1)\nos.close(2)\ntime.sleep(60)"
    outcome, elapsed = run(tmp_path, script, timeout_s=0.5)
    assert outcome.killed_for == "timed_out"
    assert elapsed < 8


def test_memory_limit_stops_large_allocation(tmp_path: Path) -> None:
    outcome, _ = run(tmp_path, "bytearray(2 << 30)", memory_bytes=512 << 20)
    assert outcome.exit_code == 1
    assert "MemoryError" in (tmp_path / "log").read_text()


def test_process_limit_stops_fork_bomb(tmp_path: Path) -> None:
    script = """\
import os, time
forked = 0
try:
    for _ in range(300):
        if os.fork() == 0:
            time.sleep(30)
            os._exit(0)
        forked += 1
except BlockingIOError:
    print("fork refused after", forked, flush=True)
"""
    outcome, _ = run(tmp_path, script, extra_processes=20)
    assert outcome.exit_code == 0
    assert "fork refused after" in (tmp_path / "log").read_text()


def test_missing_program_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        run_process(
            ["no-such-manim"],
            cwd=tmp_path,
            env={"PATH": str(tmp_path)},
            log_path=tmp_path / "log",
            output_dir=tmp_path,
            limits=RenderLimits(),
            on_line=None,
            cancel=None,
        )
