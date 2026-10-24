"""Locating projects inside the workspace folder."""

from pathlib import Path

from pnp_core.paths import safe_join

from pnp_agent.errors import ApiError

MANIFEST = "pnp.yaml"


def project_dirs(workspace: Path) -> list[Path]:
    """Direct children of the workspace that contain a pnp.yaml, sorted by name."""
    if not workspace.is_dir():
        return []
    return sorted(
        p
        for p in workspace.iterdir()
        if p.is_dir() and not p.name.startswith(".") and (p / MANIFEST).is_file()
    )


def resolve_project(workspace: Path, pid: str) -> Path:
    """Map a client project id to its folder. safe_join rejects traversal attempts."""
    root = safe_join(workspace, pid)
    is_direct_child = root.parent == workspace.resolve() and not pid.startswith(".")
    if not is_direct_child or not (root / MANIFEST).is_file():
        raise ApiError(404, "not_found", f"Project {pid!r} not found")
    return root
