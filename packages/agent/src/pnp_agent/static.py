"""Serve the built Studio single-page app, falling back to index.html for client routes."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from pnp_core.errors import UnsafePathError
from pnp_core.paths import safe_join

from pnp_agent.errors import ApiError


def install_studio(app: FastAPI, dist: Path | None) -> None:
    if dist is None or not (dist / "index.html").is_file():
        return
    index = dist / "index.html"

    @app.get("/{path:path}", include_in_schema=False)
    def studio(path: str) -> FileResponse:  # pyright: ignore[reportUnusedFunction]
        if path == "api" or path.startswith("api/"):
            raise ApiError(404, "not_found", "Not found")
        try:
            target = safe_join(dist, path) if path else index
        except UnsafePathError:
            target = index
        return FileResponse(target if target.is_file() else index)
