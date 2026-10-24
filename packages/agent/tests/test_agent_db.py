"""state.db: WAL mode, numbered migrations via user_version, revision index."""

import sqlite3
from contextlib import closing
from pathlib import Path

import pytest
from pnp_agent.db import RevisionRow, connect, init_db, list_revisions, migrations, record_revision


def test_init_creates_schema_in_wal_mode(tmp_path: Path) -> None:
    path = tmp_path / ".pnp" / "state.db"
    init_db(path)
    init_db(path)  # idempotent
    with closing(connect(path)) as conn:
        assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        assert conn.execute("PRAGMA user_version").fetchone()[0] == len(migrations())
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"revisions", "exports", "jobs", "job_deps", "job_attempts"} <= tables


def test_migrations_are_numbered_from_one() -> None:
    assert [n for n, _ in migrations()][:1] == [1]


def test_failed_migration_rolls_back(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    path = tmp_path / "state.db"
    good = migrations()
    bad = [*good, (len(good) + 1, "CREATE TABLE t (x INTEGER); SELECT * FROM missing;")]
    monkeypatch.setattr("pnp_agent.db.migrations", lambda: bad)
    with pytest.raises(sqlite3.OperationalError):
        init_db(path)
    with closing(connect(path)) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == len(good)
        names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master")}
    assert "t" not in names


def test_revisions_are_recorded_once_per_project(tmp_path: Path) -> None:
    path = tmp_path / "state.db"
    init_db(path)
    old = RevisionRow("a" * 64, "2026-01-01T00:00:00+00:00", 2, 10)
    new = RevisionRow("b" * 64, "2026-01-02T00:00:00+00:00", 3, 20)
    with closing(connect(path)) as conn:
        for rev in (old, new, old):
            record_revision(conn, "demo", rev)
        record_revision(conn, "other", old)
        assert list_revisions(conn, "demo") == [new, old]
        assert list_revisions(conn, "nope") == []
