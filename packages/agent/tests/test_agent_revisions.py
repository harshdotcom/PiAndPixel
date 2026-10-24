"""GET /projects/{pid}/revisions lists that project's snapshots, newest first."""

from contextlib import closing

from agent_helpers import AUTH, create_project
from fastapi.testclient import TestClient
from pnp_agent.db import RevisionRow, connect, db_path, record_revision
from pnp_agent.settings import Settings


def test_empty_history(client: TestClient) -> None:
    pid = create_project(client)
    assert client.get(f"/api/v1/projects/{pid}/revisions", headers=AUTH).json() == []


def test_lists_own_revisions_newest_first(client: TestClient, settings: Settings) -> None:
    pid = create_project(client, name="Demo")
    other = create_project(client, name="Other")
    old = RevisionRow("a" * 64, "2026-01-01T00:00:00+00:00", 2, 100)
    new = RevisionRow("b" * 64, "2026-02-01T00:00:00+00:00", 3, 250)
    with closing(connect(db_path(settings.workspace))) as conn:
        record_revision(conn, pid, old)
        record_revision(conn, pid, new)
        record_revision(conn, other, RevisionRow("c" * 64, "2026-03-01T00:00:00+00:00", 1, 1))
    resp = client.get(f"/api/v1/projects/{pid}/revisions", headers=AUTH)
    assert resp.status_code == 200
    assert resp.json() == [
        {"id": "b" * 64, "created_at": new.created_at, "file_count": 3, "total_bytes": 250},
        {"id": "a" * 64, "created_at": old.created_at, "file_count": 2, "total_bytes": 100},
    ]


def test_unknown_project_is_404(client: TestClient) -> None:
    resp = client.get("/api/v1/projects/nope/revisions", headers=AUTH)
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"
