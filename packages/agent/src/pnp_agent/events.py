"""Fan-out of job/export events from worker threads to WebSocket subscribers."""

import asyncio
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

Event = dict[str, Any]
_QUEUE_SIZE = 1000

_Subscriber = tuple[asyncio.AbstractEventLoop, "asyncio.Queue[Event | None]"]


def _deliver(queue: "asyncio.Queue[Event | None]", event: Event | None) -> None:
    """Runs on the subscriber's loop. A full queue means a stuck client: drop it."""
    if event is None or queue.full():
        while not queue.empty():
            queue.get_nowait()
        queue.put_nowait(None)
    else:
        queue.put_nowait(event)


class EventHub:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subscribers: list[_Subscriber] = []

    def publish(self, event: Event) -> None:
        """Thread-safe and non-blocking; a subscriber whose queue is full is disconnected."""
        self._send(event)

    @asynccontextmanager
    async def subscribe(self) -> AsyncIterator["asyncio.Queue[Event | None]"]:
        """A queue of events for one WebSocket; None means the hub closed this subscriber."""
        sub: _Subscriber = (asyncio.get_running_loop(), asyncio.Queue(maxsize=_QUEUE_SIZE))
        with self._lock:
            self._subscribers.append(sub)
        try:
            yield sub[1]
        finally:
            with self._lock:
                self._subscribers.remove(sub)

    def close(self) -> None:
        """Agent shutdown: every subscriber receives None."""
        self._send(None)

    def _send(self, event: Event | None) -> None:
        with self._lock:
            subscribers = list(self._subscribers)
        for loop, queue in subscribers:
            try:
                loop.call_soon_threadsafe(_deliver, queue, event)
            except RuntimeError:  # the subscriber's loop is already closed
                continue
