"""A login shell on a pseudo-terminal, in its own session so it can be killed as a group."""

import contextlib
import errno
import fcntl
import os
import pty
import signal
import struct
import termios
import time
import warnings
from pathlib import Path

READ_CHUNK = 64 * 1024
_KILL_GRACE_S = 1.0
# An allowlist, not a denylist: the browser sees all shell output, and the Agent's
# environment may hold the token (PNP_*) or API keys under any name.
_SHELL_VARS = ("PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "COLUMNS", "LINES")


def shell_env() -> dict[str, str]:
    """Only _SHELL_VARS and LC_* from the Agent's environment, plus TERM=xterm-256color."""
    env = {k: v for k, v in os.environ.items() if k in _SHELL_VARS or k.startswith("LC_")}
    env["TERM"] = "xterm-256color"
    return env


class PtySession:
    def __init__(self, child_pid: int, fd: int) -> None:
        self.child_pid = child_pid
        self.fd = fd  # master side; non-blocking
        self.closed = False
        self._exit_code: int | None = None

    @classmethod
    def spawn(cls, cwd: Path, *, cols: int = 80, rows: int = 24) -> "PtySession":
        """pty.fork() + execve($SHELL or /bin/bash, ["-l"]) in cwd with shell_env()."""
        shell = os.environ.get("SHELL") or "/bin/bash"
        env = shell_env()
        with warnings.catch_warnings():
            # The Agent has threads; that is safe here because the child only chdirs and execs.
            warnings.simplefilter("ignore", DeprecationWarning)
            child_pid, fd = pty.fork()
        if child_pid == 0:  # child: pty.fork() already made it a session leader
            try:
                os.chdir(cwd)
                os.execve(shell, [shell, "-l"], env)
            finally:
                os._exit(127)  # only reached when exec failed
        os.set_blocking(fd, False)
        session = cls(child_pid, fd)
        session.resize(cols, rows)
        return session

    def read(self) -> bytes:
        """Up to 64 KiB of output; b"" when the shell has exited."""
        try:
            return os.read(self.fd, READ_CHUNK)
        except OSError as exc:
            if exc.errno == errno.EIO:  # Linux: every slave side closed, the shell has exited
                return b""
            raise

    def write(self, data: bytes) -> None:
        os.write(self.fd, data)

    def resize(self, cols: int, rows: int) -> None:
        fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

    def close(self) -> int | None:
        """SIGHUP, then SIGKILL the shell's process group after 1 s; returns its exit code."""
        if self.closed:
            return self._exit_code
        self.closed = True
        self._signal_group(signal.SIGHUP)
        status = self._wait(_KILL_GRACE_S)
        if status is None:
            self._signal_group(signal.SIGKILL)
            status = self._wait(None)
        os.close(self.fd)
        self._exit_code = None if status is None else os.waitstatus_to_exitcode(status)
        return self._exit_code

    def _signal_group(self, sig: signal.Signals) -> None:
        with contextlib.suppress(ProcessLookupError):
            os.killpg(self.child_pid, sig)

    def _wait(self, timeout_s: float | None) -> int | None:
        """The child's wait status, or None if it is still running after timeout_s."""
        deadline = None if timeout_s is None else time.monotonic() + timeout_s
        while True:
            try:
                pid, status = os.waitpid(self.child_pid, 0 if deadline is None else os.WNOHANG)
            except ChildProcessError:
                return None  # already reaped
            if pid:
                return status
            if deadline is not None and time.monotonic() >= deadline:
                return None
            time.sleep(0.02)
