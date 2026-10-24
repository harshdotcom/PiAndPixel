"""Dependency propagation between jobs: a failed job blocks its dependents, a retry frees them."""

import sqlite3

RETRYABLE = ("failed", "timed_out", "cancelled", "interrupted")
# A dependency in one of these states keeps its dependents blocked.
_BLOCKING = (*RETRYABLE, "blocked")
_IN_BLOCKING = f"({', '.join(repr(s) for s in _BLOCKING)})"
_DEPENDENTS = "SELECT j.id FROM job_deps d JOIN jobs j ON j.id = d.job_id WHERE d.depends_on = ?"


def block_dependents(conn: sqlite3.Connection, jid: str, status: str) -> list[str]:
    """queued dependents → blocked, transitively. Returns the ids that changed."""
    changed: list[str] = []
    for (dependent,) in conn.execute(f"{_DEPENDENTS} AND j.status = 'queued'", (jid,)).fetchall():
        conn.execute(
            "UPDATE jobs SET status = 'blocked', error = ?, error_code = 'dependency_failed'"
            " WHERE id = ?",
            (f"Blocked: dependency {jid} {status}", dependent),
        )
        changed += [dependent, *block_dependents(conn, dependent, "blocked")]
    return changed


def has_blocking_dep(conn: sqlite3.Connection, jid: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM job_deps d JOIN jobs p ON p.id = d.depends_on"
        f" WHERE d.job_id = ? AND p.status IN {_IN_BLOCKING}",
        (jid,),
    ).fetchone()
    return row is not None


def unblock_dependents(conn: sqlite3.Connection, jid: str) -> list[str]:
    """blocked dependents with no failing dependency left → queued, transitively."""
    changed: list[str] = []
    for (dependent,) in conn.execute(f"{_DEPENDENTS} AND j.status = 'blocked'", (jid,)).fetchall():
        if has_blocking_dep(conn, dependent):
            continue
        conn.execute(
            "UPDATE jobs SET status = 'queued', error = NULL, error_code = NULL WHERE id = ?",
            (dependent,),
        )
        changed += [dependent, *unblock_dependents(conn, dependent)]
    return changed
