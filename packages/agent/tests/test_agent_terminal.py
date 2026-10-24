"""WS /api/v1/terminal: a real PTY shell, its gating and its cleanup."""

import os
import signal
import time
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from agent_helpers import TOKEN, FakeRunner, create_project, fake_prober
from fastapi.testclient import TestClient
from pnp_agent.app import create_app
from pnp_agent.security import WS_FORBIDDEN, WS_NOT_FOUND, WS_UNAUTHORIZED
from pnp_agent.settings import Settings
from pnp_agent.terminal import PtySession, shell_env
from starlette.testclient import WebSocketTestSession
from starlette.websockets import WebSocketDisconnect

ORIGIN = {"Origin": "http://127.0.0.1:5173"}
URL = f"/api/v1/terminal?project=demo&token={TOKEN}"


@pytest.fixture(autouse=True)
def plain_shell(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("SHELL", "/bin/sh")
    monkeypatch.setenv("HOME", str(tmp_path))  # no user profile scripts
    monkeypatch.setenv("PNP_TOKEN", TOKEN)
    monkeypatch.setenv("PNP_OTHER", "x")


@pytest.fixture(autouse=True)
def fail_instead_of_hanging() -> Iterator[None]:
    # receive_json() has no timeout; a missing line must fail the test, not block the suite.
    def on_alarm(_signum: int, _frame: object) -> None:
        raise TimeoutError("terminal test timed out")

    previous = signal.signal(signal.SIGALRM, on_alarm)
    signal.alarm(20)
    yield
    signal.alarm(0)
    signal.signal(signal.SIGALRM, previous)


def _read_until_line(ws: WebSocketTestSession, wanted: str) -> None:
    """Read output until a line is `wanted`, ignoring a "$ " prompt in front of it."""
    text = ""
    while True:
        message = ws.receive_json()
        assert message["type"] == "output", (message, text)
        text += message["data"]
        lines = [line.rstrip("\r").rsplit("$ ", 1)[-1] for line in text.split("\n")]
        if wanted in lines:
            return


def _send(ws: WebSocketTestSession, kind: str, **fields: Any) -> None:
    ws.send_json({"type": kind, **fields})


def test_echo_round_trip(client: TestClient, settings: Settings) -> None:
    create_project(client, name="Demo")
    with client.websocket_connect(URL, headers=ORIGIN) as ws:
        _send(ws, "input", data="echo hi\n")
        _read_until_line(ws, "hi")
        _send(ws, "input", data="pwd\n")
        _read_until_line(ws, str(settings.workspace / "demo"))


def test_resize_is_clamped(client: TestClient) -> None:
    create_project(client, name="Demo")
    with client.websocket_connect(URL, headers=ORIGIN) as ws:
        _send(ws, "resize", cols=120, rows=30)
        _send(ws, "input", data="stty size\n")
        _read_until_line(ws, "30 120")
        _send(ws, "resize", cols=9999, rows=0)
        _send(ws, "resize", cols="wide", rows=10)  # ignored
        ws.send_text("not json")  # ignored
        _send(ws, "input", data="stty size\n")
        _read_until_line(ws, "1 500")


def test_only_allowlisted_vars_reach_the_shell(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    create_project(client, name="Demo")
    for name in ["ANTHROPIC_API_KEY", "CLAUDE_CODE_SESSION", "MY_SERVICE_CRED", "TERM"]:
        monkeypatch.setenv(name, "x")
    for name in ["USER", "LOGNAME", "LANG", "LC_ALL", "COLUMNS", "LINES"]:
        monkeypatch.setenv(name, f"v-{name}")
    env = shell_env()
    allowed = {"PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "COLUMNS", "LINES", "TERM"}
    assert {k for k in env if not k.startswith("LC_")} <= allowed
    assert (env["PATH"], env["LC_ALL"], env["LINES"]) == (os.environ["PATH"], "v-LC_ALL", "v-LINES")
    assert env["TERM"] == "xterm-256color"
    with client.websocket_connect(URL, headers=ORIGIN) as ws:
        _send(ws, "input", data='echo "tok=${PNP_TOKEN:-none} term=$TERM"\n')
        _read_until_line(ws, "tok=none term=xterm-256color")


def test_exit_reports_code(client: TestClient) -> None:
    create_project(client, name="Demo")
    with client.websocket_connect(URL, headers=ORIGIN) as ws:
        _send(ws, "input", data="exit 3\n")
        message = ws.receive_json()
        while message["type"] == "output":
            message = ws.receive_json()
        assert message == {"type": "exit", "code": 3}


def test_disconnect_kills_the_shell(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    create_project(client, name="Demo")
    sessions: list[PtySession] = []
    spawn = PtySession.spawn

    def recording_spawn(cwd: Path) -> PtySession:
        sessions.append(spawn(cwd))
        return sessions[-1]

    monkeypatch.setattr(PtySession, "spawn", recording_spawn)
    with client.websocket_connect(URL, headers=ORIGIN) as ws:
        _send(ws, "input", data="echo ready\n")
        _read_until_line(ws, "ready")
    assert sessions[0].closed
    deadline = time.monotonic() + 5
    while _is_running(sessions[0].child_pid) and time.monotonic() < deadline:
        time.sleep(0.02)
    assert not _is_running(sessions[0].child_pid)


def _is_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


def _refusal_code(settings: Settings, url: str) -> int:
    client = TestClient(create_app(settings, runner=FakeRunner(), prober=fake_prober))
    with (
        pytest.raises(WebSocketDisconnect) as exc,
        client.websocket_connect(url, headers=ORIGIN) as ws,
    ):
        ws.receive_json()
    return exc.value.code


@pytest.mark.parametrize(
    ("overrides", "url", "code"),
    [({"terminal_enabled": False}, URL, WS_FORBIDDEN),
     ({"host": "0.0.0.0"}, URL, WS_FORBIDDEN),
     ({"host": "192.168.1.5"}, URL, WS_FORBIDDEN),
     ({}, "/api/v1/terminal?project=demo&token=wrong", WS_UNAUTHORIZED),
     ({}, "/api/v1/terminal?project=demo", WS_UNAUTHORIZED),
     ({}, f"/api/v1/terminal?project=nope&token={TOKEN}", WS_NOT_FOUND),
     ({}, f"/api/v1/terminal?project=..&token={TOKEN}", WS_NOT_FOUND),
     ({}, f"/api/v1/terminal?token={TOKEN}", WS_NOT_FOUND)],
    ids=["no-terminal", "all-interfaces", "lan", "bad-token", "no-token", "unknown-project",
         "traversal", "no-project"],
)  # fmt: skip
def test_refused(
    client: TestClient, settings: Settings, overrides: dict[str, Any], url: str, code: int
) -> None:
    create_project(client, name="Demo")
    assert _refusal_code(replace(settings, **overrides), url) == code
