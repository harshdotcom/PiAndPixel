"""WS /api/v1/events: live job status, logs, progress and export status."""

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from pnp_agent.events import EventHub
from pnp_agent.security import websocket_denial

router = APIRouter(prefix="/api/v1")


async def _drain_client(websocket: WebSocket) -> None:
    """Server → client only: read and ignore client messages until it disconnects."""
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        return


@router.websocket("/events")
async def events(websocket: WebSocket) -> None:
    denial = websocket_denial(websocket, websocket.app.state.settings)
    if denial is not None:
        await websocket.close(code=denial)
        return
    hub: EventHub = websocket.app.state.events
    async with hub.subscribe() as queue:  # before accept(), so no event after it is missed
        await websocket.accept()
        reader = asyncio.create_task(_drain_client(websocket))
        try:
            while True:
                next_event = asyncio.create_task(queue.get())
                await asyncio.wait({next_event, reader}, return_when=asyncio.FIRST_COMPLETED)
                if not next_event.done():
                    next_event.cancel()
                    return  # the client went away
                event = next_event.result()
                if event is None:
                    await websocket.close()
                    return
                await websocket.send_json(event)
        finally:
            reader.cancel()
