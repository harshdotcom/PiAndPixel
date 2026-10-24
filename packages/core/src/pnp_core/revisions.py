"""Immutable, content-addressed snapshots of a project's source files."""

import contextlib
import hashlib
import json
import os
import re
import shutil
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pnp_core.fileops import EXCLUDED_NAMES

_ID_RE = re.compile(r"^[0-9a-f]{64}$")
MANIFEST_NAME = "manifest.json"
_READ_ONLY = 0o444  # a snapshot is never edited; tampering needs a deliberate chmod


@dataclass(frozen=True)
class Revision:
    id: str  # sha256 of the canonical file manifest
    created_at: str
    file_count: int
    total_bytes: int
    src: Path  # the snapshot's copy of the project tree; never written after creation


def _copy_source(project_root: Path, dest: Path) -> None:
    """Copy regular files only; symlinks are skipped so nothing outside the project leaks in."""
    for dirpath, dirnames, filenames in os.walk(project_root):
        here = Path(dirpath)
        dirnames[:] = [d for d in dirnames if d not in EXCLUDED_NAMES]
        for name in filenames:
            file = here / name
            if file.is_symlink() or not file.is_file():
                continue
            target = dest / file.relative_to(project_root)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(file, target)
            target.chmod(_READ_ONLY)


def _file_manifest(src: Path) -> list[dict[str, Any]]:
    files: list[dict[str, Any]] = []
    for path in sorted(p for p in src.rglob("*") if p.is_file()):
        data = path.read_bytes()
        rel = path.relative_to(src).as_posix()
        files.append({"path": rel, "sha256": hashlib.sha256(data).hexdigest(), "size": len(data)})
    return files


def _revision_id(files: list[dict[str, Any]]) -> str:
    canonical = json.dumps(files, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def load_revision(revisions_dir: Path, revision_id: str) -> Revision | None:
    if not _ID_RE.fullmatch(revision_id):
        return None
    folder = revisions_dir / revision_id
    try:
        data = json.loads((folder / MANIFEST_NAME).read_text(encoding="utf-8"))
        files: list[dict[str, Any]] = data["files"]
        return Revision(
            id=revision_id,
            created_at=str(data["created_at"]),
            file_count=len(files),
            total_bytes=sum(int(f["size"]) for f in files),
            src=folder / "src",
        )
    except (OSError, ValueError, KeyError, TypeError):
        return None


def _matches(src: Path, files: list[dict[str, Any]]) -> bool:
    """Snapshots hold regular files only, so a symlink is tampering even if hashes match."""
    if any(p.is_symlink() for p in src.rglob("*")):
        return False
    return _file_manifest(src) == files


def _intact(revisions_dir: Path, revision_id: str, files: list[dict[str, Any]]) -> Revision | None:
    """The stored revision if its src/ still hashes to `files`; a tampered one is discarded."""
    folder = revisions_dir / revision_id
    existing = load_revision(revisions_dir, revision_id)
    if existing is not None and _matches(existing.src, files):
        return existing
    if folder.exists():
        trash = revisions_dir / f".bad-{uuid.uuid4().hex}"
        with contextlib.suppress(OSError):  # another snapshot may be replacing it right now
            folder.rename(trash)
        shutil.rmtree(trash, ignore_errors=True)
    return None


def snapshot_project(project_root: Path, revisions_dir: Path) -> Revision:
    """Snapshot the project's source; an identical, intact snapshot is reused, not copied again.

    The hash is taken from the copy, so the recorded id always matches what was copied,
    even when the user saves a file while the snapshot is being taken.
    """
    revisions_dir.mkdir(parents=True, exist_ok=True)
    tmp = revisions_dir / f".tmp-{uuid.uuid4().hex}"
    try:
        _copy_source(project_root.resolve(), tmp / "src")
        (tmp / "src").mkdir(parents=True, exist_ok=True)
        files = _file_manifest(tmp / "src")
        revision_id = _revision_id(files)
        existing = _intact(revisions_dir, revision_id, files)
        if existing is not None:
            return existing
        record = {"id": revision_id, "created_at": datetime.now(UTC).isoformat(), "files": files}
        (tmp / MANIFEST_NAME).write_text(json.dumps(record, indent=2), encoding="utf-8")
        (tmp / MANIFEST_NAME).chmod(_READ_ONLY)
        # If another snapshot with the same content won the race, the rename fails: use it.
        with contextlib.suppress(OSError):
            tmp.rename(revisions_dir / revision_id)
        revision = load_revision(revisions_dir, revision_id)
        if revision is None:
            raise OSError(f"revision {revision_id} could not be stored")
        return revision
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
