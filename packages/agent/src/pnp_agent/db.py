"""SQLite state database: connection settings and numbered schema migrations."""

import re
import sqlite3
from contextlib import closing
from dataclasses import dataclass
from importlib import resources
from pathlib import Path

_MIGRATION_NAME = re.compile(r"^(\d{4})_[a-z0-9_]+\.sql$")
_BUSY_TIMEOUT_S = 10.0


@dataclass(frozen=True)
class RevisionRow:
    id: str
    created_at: str
    file_count: int
    total_bytes: int


def db_path(workspace: Path) -> Path:
    return workspace / ".pnp" / "state.db"


def connect(path: Path) -> sqlite3.Connection:
    """A new connection; use one per thread. Rows are sqlite3.Row, foreign keys are on."""
    conn = sqlite3.connect(path, timeout=_BUSY_TIMEOUT_S, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


def migrations() -> list[tuple[int, str]]:
    """(number, sql) of every file in migrations/, in order. Numbers must be 1, 2, 3, ..."""
    found: list[tuple[int, str]] = []
    for entry in resources.files("pnp_agent").joinpath("migrations").iterdir():
        match = _MIGRATION_NAME.match(entry.name)
        if match:
            found.append((int(match.group(1)), entry.read_text(encoding="utf-8")))
    found.sort()
    if [n for n, _ in found] != list(range(1, len(found) + 1)):
        raise RuntimeError("migrations must be numbered 0001, 0002, ... without gaps")
    return found


def init_db(path: Path) -> None:
    """Create the database if needed, switch it to WAL and apply pending migrations.

    The applied version is stored in PRAGMA user_version; each migration runs in its
    own transaction together with the version bump, so a crash never half-applies one.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(connect(path)) as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        current = int(conn.execute("PRAGMA user_version").fetchone()[0])
        for number, sql in migrations():
            if number <= current:
                continue
            try:
                conn.executescript(
                    f"BEGIN IMMEDIATE;\n{sql}\nPRAGMA user_version = {number};\nCOMMIT;"
                )
            except sqlite3.Error:
                if conn.in_transaction:
                    conn.execute("ROLLBACK")
                raise


def record_revision(conn: sqlite3.Connection, project: str, rev: RevisionRow) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO revisions (project, id, created_at, file_count, total_bytes)"
        " VALUES (?, ?, ?, ?, ?)",
        (project, rev.id, rev.created_at, rev.file_count, rev.total_bytes),
    )


def list_revisions(conn: sqlite3.Connection, project: str) -> list[RevisionRow]:
    rows = conn.execute(
        "SELECT id, created_at, file_count, total_bytes FROM revisions"
        " WHERE project = ? ORDER BY created_at DESC, id",
        (project,),
    ).fetchall()
    return [RevisionRow(r["id"], r["created_at"], r["file_count"], r["total_bytes"]) for r in rows]
