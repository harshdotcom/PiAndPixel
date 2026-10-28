"""FastAPI application factory for the Pi & Pixel Agent."""

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from pnp_core.compose import compose_export
from pnp_core.probe import MediaInfo, probe
from pnp_core.render import render_scene

from pnp_agent import (
    __version__,
    artifacts_routes,
    compositions_routes,
    events_routes,
    exports_routes,
    files_routes,
    jobs_routes,
    narration_routes,
    projects,
    revisions_routes,
    terminal_routes,
)
from pnp_agent.capabilities import ToolReport, agent_info
from pnp_agent.db import db_path, init_db
from pnp_agent.errors import install_error_handlers
from pnp_agent.events import EventHub
from pnp_agent.jobs import Composer, JobManager, RenderRunner
from pnp_agent.render_options import render_options
from pnp_agent.security import install_security
from pnp_agent.settings import Settings
from pnp_agent.static import install_studio

__all__ = ["Composer", "RenderRunner", "create_app"]


_ROUTERS = (
    projects.router,
    files_routes.router,
    revisions_routes.router,
    compositions_routes.router,
    jobs_routes.router,
    narration_routes.router,
    exports_routes.router,
    artifacts_routes.router,
    events_routes.router,
    terminal_routes.router,
)


def _install_routes(app: FastAPI, settings: Settings, tool_report: ToolReport) -> None:
    @app.get("/api/v1/agent/health")
    def health() -> dict[str, bool]:  # pyright: ignore[reportUnusedFunction]
        return {"ok": True}

    @app.get("/api/v1/agent")
    def agent() -> dict[str, Any]:  # pyright: ignore[reportUnusedFunction]
        info = agent_info(
            settings.workspace, tool_report.get(), terminal=settings.terminal_available
        )
        return {**info, "render_options": render_options()}

    for router in _ROUTERS:
        app.include_router(router)
    install_studio(app, settings.studio_dist)


def create_app(
    settings: Settings,
    *,
    runner: RenderRunner | None = None,
    prober: Callable[[Path], MediaInfo] | None = None,
    composer: Composer | None = None,
) -> FastAPI:
    tool_report = ToolReport(settings.tools)
    ffprobe = settings.tools.ffprobe
    settings.workspace.mkdir(parents=True, exist_ok=True)
    init_db(db_path(settings.workspace))
    events = EventHub()
    jobs = JobManager(
        settings.workspace,
        runner=runner or render_scene,
        prober=prober or (lambda path: probe(path, ffprobe=ffprobe)),
        composer=composer or compose_export,
        tools=settings.tools,
        limits=settings.render_limits,
        events=events,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        tool_report.start()
        jobs.start()
        yield
        events.close()
        jobs.shutdown()

    app = FastAPI(title="Pi & Pixel Agent", version=__version__, lifespan=lifespan)
    app.state.settings = settings
    app.state.jobs = jobs
    app.state.events = events
    install_error_handlers(app)
    install_security(app, settings)
    _install_routes(app, settings, tool_report)
    return app
