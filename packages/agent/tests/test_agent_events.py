"""Live events: the EventHub fan-out and WS /api/v1/events with a TestClient websocket."""

import asyncio
import threading
from typing import Any

import pytest
from agent_helpers import TOKEN, create_project, export_project, start_export, start_render
from fastapi.testclient import TestClient
from pnp_agent.events import EventHub
from pnp_agent.security import WS_UNAUTHORIZED
from pnp_agent.settings import Settings
from starlette.testclient import WebSocketTestSession
from starlette.websockets import WebSocketDisconnect

ORIGIN = {"Origin": "http://127.0.0.1:5173"}


def _receive_until(ws: WebSocketTestSession, type_: str, status: str) -> list[dict[str, Any]]:
    received: list[dict[str, Any]] = []
    while True:
        event = ws.receive_json()
        received.append(event)
        if event["type"] == type_ and event["status"] == status:
            return received


def test_render_events(client: TestClient) -> None:
    pid = create_project(client)
    with client.websocket_connect(f"/api/v1/events?token={TOKEN}", headers=ORIGIN) as ws:
        ws.send_text("ignored")  # client messages are ignored
        jid = start_render(client, pid)
        events = _receive_until(ws, "job.status", "completed")
    statuses = [e for e in events if e["type"] == "job.status"]
    assert [e["status"] for e in statuses] == ["queued", "running", "completed"]
    assert statuses[-1]["artifact_id"] and statuses[-1]["attempt"] == 1
    assert set(statuses[0]) == {"type", "job_id", "project", "kind", "export_id", "status",
                                "attempt", "error", "error_code", "artifact_id"}  # fmt: skip
    logs = [e for e in events if e["type"] == "job.log"]
    assert logs[0] == {"type": "job.log", "job_id": jid, "project": pid, "attempt": 1,
                       "line": "Rendering..."}  # fmt: skip
    progress = [e for e in events if e["type"] == "job.progress"]
    assert progress == [{"type": "job.progress", "job_id": jid, "project": pid,
                         "kind": "render", "animations_done": 1}]  # fmt: skip


def test_export_events(client: TestClient, settings: Settings) -> None:
    pid = export_project(client, settings)
    with client.websocket_connect(f"/api/v1/events?token={TOKEN}", headers=ORIGIN) as ws:
        eid = start_export(client, pid)["export_id"]
        events = _receive_until(ws, "export.status", "completed")
    exports = [e for e in events if e["type"] == "export.status"]
    assert exports[0]["status"] == "queued"
    assert exports[0] == {"type": "export.status", "export_id": eid, "project": pid,
                          "status": "queued", "units_done": 0, "units_total": 3,
                          "artifact_id": None, "error": None}  # fmt: skip
    assert exports[-1]["units_done"] == 3 and exports[-1]["artifact_id"]
    pct = [e["pct"] for e in events if e["type"] == "job.progress" and e["kind"] == "composite"]
    assert pct == [0.5, 40.0, 100.0]  # 40.5 is less than one point after 40.0


def test_bad_token_is_refused(client: TestClient) -> None:
    with (
        pytest.raises(WebSocketDisconnect) as exc,
        client.websocket_connect("/api/v1/events?token=wrong", headers=ORIGIN) as ws,
    ):
        ws.receive_json()
    assert exc.value.code == WS_UNAUTHORIZED


def test_hub_delivers_from_threads_and_closes() -> None:
    async def scenario() -> list[Any]:
        hub = EventHub()
        async with hub.subscribe() as queue:
            thread = threading.Thread(target=hub.publish, args=({"n": 1},))
            thread.start()
            thread.join()
            first = await asyncio.wait_for(queue.get(), 1)
            hub.close()
            return [first, await asyncio.wait_for(queue.get(), 1)]

    assert asyncio.run(scenario()) == [{"n": 1}, None]


def test_hub_drops_a_subscriber_whose_queue_is_full() -> None:
    async def scenario() -> list[Any]:
        hub = EventHub()
        async with hub.subscribe() as queue:
            for n in range(1001):
                hub.publish({"n": n})
            await asyncio.sleep(0.05)
            return [queue.get_nowait() for _ in range(queue.qsize())]

    received = asyncio.run(scenario())
    assert received[-1] is None
