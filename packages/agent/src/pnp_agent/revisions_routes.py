"""GET /projects/{pid}/revisions: the project's source snapshots, newest first."""

from contextlib import closing
from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Request

from pnp_agent.db import connect, db_path, list_revisions
from pnp_agent.files_routes import project_root

router = APIRouter(prefix="/api/v1")


@router.get("/projects/{pid}/revisions")
def get_revisions(pid: str, request: Request) -> list[dict[str, Any]]:
    root = project_root(request, pid)
    with closing(connect(db_path(request.app.state.settings.workspace))) as conn:
        return [asdict(row) for row in list_revisions(conn, root.name)]
