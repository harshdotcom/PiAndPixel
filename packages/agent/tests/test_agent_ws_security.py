"""WebSocket handshake checks (?token= only with an allowed Origin) and terminal gating."""

from pathlib import Path

import pytest
from agent_helpers import TOKEN
from fastapi import FastAPI, WebSocket
from fastapi.testclient import TestClient
from pnp_agent.security import WS_FORBIDDEN, WS_UNAUTHORIZED, websocket_denial
from pnp_agent.settings import Settings
from starlette.websockets import WebSocketDisconnect

GOOD_ORIGIN = "http://127.0.0.1:5173"


def _echo_app(settings: Settings) -> FastAPI:
    app = FastAPI()

    @app.websocket("/ws")
    async def ws(websocket: WebSocket) -> None:  # pyright: ignore[reportUnusedFunction]
        denial = websocket_denial(websocket, settings)
        if denial is not None:
            await websocket.close(code=denial)
            return
        await websocket.accept()
        await websocket.send_text("ok")
        await websocket.close()

    return app


def test_valid_token_and_origin_are_accepted(settings: Settings) -> None:
    client = TestClient(_echo_app(settings))
    with client.websocket_connect(f"/ws?token={TOKEN}", headers={"Origin": GOOD_ORIGIN}) as ws:
        assert ws.receive_text() == "ok"


@pytest.mark.parametrize(
    ("query", "headers", "code"),
    [
        ("", {"Origin": GOOD_ORIGIN}, WS_UNAUTHORIZED),
        ("?token=wrong", {"Origin": GOOD_ORIGIN}, WS_UNAUTHORIZED),
        (f"?token={TOKEN}", {}, WS_FORBIDDEN),
        (f"?token={TOKEN}", {"Origin": "https://evil.example"}, WS_FORBIDDEN),
        (f"?token={TOKEN}", {"Origin": GOOD_ORIGIN, "Host": "evil.example"}, WS_FORBIDDEN),
    ],
    ids=["no-token", "wrong-token", "no-origin", "bad-origin", "bad-host"],
)
def test_refused_handshakes(
    settings: Settings, query: str, headers: dict[str, str], code: int
) -> None:
    client = TestClient(_echo_app(settings))
    with (
        pytest.raises(WebSocketDisconnect) as exc,
        client.websocket_connect(f"/ws{query}", headers=headers) as ws,
    ):
        ws.receive_text()
    assert exc.value.code == code


@pytest.mark.parametrize(
    ("host", "enabled", "available"),
    [("127.0.0.1", True, True), ("localhost", True, True), ("127.0.0.1", False, False),
     ("0.0.0.0", True, False), ("192.168.1.5", True, False)],
)  # fmt: skip
def test_terminal_only_on_loopback(host: str, enabled: bool, available: bool) -> None:
    settings = Settings(workspace=Path("."), token="t", host=host, terminal_enabled=enabled)
    assert settings.terminal_available is available
