"""WS /api/v1/terminal: a PTY shell in the project folder (loopback Agents only)."""

import asyncio
import codecs
import contextlib
import json
from pathlib import Path
from typing import Any, cast

from fastapi import APIRouter, WebSocket
from pnp_core.errors import PnpError

from pnp_agent.errors import ApiError
from pnp_agent.security import WS_FORBIDDEN, WS_NOT_FOUND, websocket_denial
from pnp_agent.settings import Settings
from pnp_agent.terminal import PtySession
from pnp_agent.workspace import resolve_project

router = APIRouter(prefix="/api/v1")

MAX_INPUT_BYTES = 64 * 1024


def _project_or_refusal(websocket: WebSocket, settings: Settings) -> Path | int:
    """The project folder, or the close code that refuses this handshake."""
    denial = websocket_denial(websocket, settings)
    if denial is not None:
        return denial
    if not settings.terminal_available:
        return WS_FORBIDDEN
    try:
        return resolve_project(settings.workspace, websocket.query_params.get("project", ""))
    except (ApiError, PnpError):  # PnpError: safe_join refused the project id
        return WS_NOT_FOUND


def _clamp(value: Any, high: int) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return min(max(value, 1), high)


def handle_client_message(session: PtySession, text: str) -> None:
    """Apply one client frame; anything malformed is ignored."""
    try:
        parsed: Any = json.loads(text)
    except ValueError:
        return
    if not isinstance(parsed, dict):
        return
    message = cast(dict[str, Any], parsed)
    data = message.get("data")
    if message.get("type") == "input":
        if isinstance(data, str) and len(data.encode()) <= MAX_INPUT_BYTES:
            session.write(data.encode())
    elif message.get("type") == "resize":
        cols = _clamp(message.get("cols"), 500)
        rows = _clamp(message.get("rows"), 200)
        if cols is not None and rows is not None:
            session.resize(cols, rows)


def _watch_output(session: PtySession, chunks: "asyncio.Queue[bytes]") -> None:
    loop = asyncio.get_running_loop()

    def on_readable() -> None:
        try:
            data = session.read()
        except BlockingIOError:
            return
        if not data:
            loop.remove_reader(session.fd)
        chunks.put_nowait(data)

    loop.add_reader(session.fd, on_readable)


async def _send_output(
    websocket: WebSocket, session: PtySession, chunks: "asyncio.Queue[bytes]"
) -> None:
    decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
    while chunk := await chunks.get():
        text = decoder.decode(chunk)
        if text:
            await websocket.send_json({"type": "output", "data": text})
    code = await asyncio.to_thread(session.close)
    await websocket.send_json({"type": "exit", "code": code})
    await websocket.close()


async def _receive_input(websocket: WebSocket, session: PtySession) -> None:
    while True:
        message = await websocket.receive()
        if message["type"] == "websocket.disconnect":
            return
        text = message.get("text")
        if isinstance(text, str):
            # OSError: the shell is gone or its input buffer is full; drop the keystrokes.
            with contextlib.suppress(OSError):
                handle_client_message(session, text)


async def _bridge(websocket: WebSocket, session: PtySession) -> None:
    chunks: asyncio.Queue[bytes] = asyncio.Queue()
    _watch_output(session, chunks)
    tasks = [
        asyncio.create_task(_send_output(websocket, session, chunks)),
        asyncio.create_task(_receive_input(websocket, session)),
    ]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        if not session.closed:
            asyncio.get_running_loop().remove_reader(session.fd)
            # Never leave a shell running after the browser goes away.
            await asyncio.to_thread(session.close)


@router.websocket("/terminal")
async def terminal(websocket: WebSocket) -> None:
    settings: Settings = websocket.app.state.settings
    target = _project_or_refusal(websocket, settings)
    if isinstance(target, int):
        await websocket.close(code=target)
        return
    await websocket.accept()
    await _bridge(websocket, PtySession.spawn(target))
