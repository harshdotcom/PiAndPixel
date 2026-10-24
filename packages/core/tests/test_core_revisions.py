"""Content-addressed revision snapshots."""

import json
import stat
from pathlib import Path

from pnp_core.revisions import load_revision, snapshot_project


def _project(tmp_path: Path) -> Path:
    root = tmp_path / "proj"
    for folder in ("scenes/__pycache__", ".pnp/jobs", "media/videos", ".git"):
        (root / folder).mkdir(parents=True)
    (root / "pnp.yaml").write_text("pnp: 1\nname: x\n")
    (root / "scenes" / "a.py").write_text("print(1)\n")
    (root / "scenes" / "__pycache__" / "a.pyc").write_bytes(b"x")
    (root / "media" / "videos" / "old.mp4").write_bytes(b"x")
    (root / ".git" / "HEAD").write_text("ref")
    (tmp_path / "outside.txt").write_text("secret")
    (root / "leak.txt").symlink_to(tmp_path / "outside.txt")
    return root


def test_snapshot_copies_source_only(tmp_path: Path) -> None:
    root = _project(tmp_path)
    rev = snapshot_project(root, root / ".pnp" / "revisions")
    files = sorted(p.relative_to(rev.src).as_posix() for p in rev.src.rglob("*") if p.is_file())
    assert files == ["pnp.yaml", "scenes/a.py"]
    assert len(rev.id) == 64
    assert (rev.file_count, rev.total_bytes) == (2, 24)
    manifest = json.loads((rev.src.parent / "manifest.json").read_text())
    assert [f["path"] for f in manifest["files"]] == files


def test_identical_source_is_deduplicated(tmp_path: Path) -> None:
    root = _project(tmp_path)
    revisions = root / ".pnp" / "revisions"
    first = snapshot_project(root, revisions)
    second = snapshot_project(root, revisions)
    assert second == first
    (root / "scenes" / "a.py").write_text("print(2)\n")
    third = snapshot_project(root, revisions)
    assert third.id != first.id
    assert (first.src / "scenes" / "a.py").read_text() == "print(1)\n"
    assert sorted(p.name for p in revisions.iterdir()) == sorted([first.id, third.id])


def test_load_revision_rejects_bad_ids(tmp_path: Path) -> None:
    assert load_revision(tmp_path, "../x") is None
    assert load_revision(tmp_path, "a" * 64) is None


def test_tampered_snapshot_is_replaced_not_reused(tmp_path: Path) -> None:
    root = _project(tmp_path)
    revisions = root / ".pnp" / "revisions"
    first = snapshot_project(root, revisions)
    (first.src / "scenes" / "a.py").chmod(0o644)
    (first.src / "scenes" / "a.py").write_text("TAMPERED")
    (first.src / "extra.py").write_text("x")
    second = snapshot_project(root, revisions)
    assert second.id == first.id
    assert (second.src / "scenes" / "a.py").read_text() == "print(1)\n"
    assert not (second.src / "extra.py").exists()
    assert sorted(p.name for p in revisions.iterdir()) == [first.id]


def test_snapshot_with_a_broken_manifest_is_replaced(tmp_path: Path) -> None:
    root = _project(tmp_path)
    revisions = root / ".pnp" / "revisions"
    first = snapshot_project(root, revisions)
    (first.src.parent / "manifest.json").chmod(0o644)
    (first.src.parent / "manifest.json").write_text("not json")
    second = snapshot_project(root, revisions)
    assert second.id == first.id
    assert (second.src / "scenes" / "a.py").read_text() == "print(1)\n"


def test_snapshot_files_are_read_only(tmp_path: Path) -> None:
    root = _project(tmp_path)
    rev = snapshot_project(root, root / ".pnp" / "revisions")
    files = [p for p in rev.src.parent.rglob("*") if p.is_file()]
    assert len(files) == 3  # pnp.yaml, scenes/a.py, manifest.json
    assert all(stat.S_IMODE(p.stat().st_mode) == 0o444 for p in files)


def test_snapshot_with_a_planted_symlink_is_replaced(tmp_path: Path) -> None:
    root = _project(tmp_path)
    revisions = root / ".pnp" / "revisions"
    first = snapshot_project(root, revisions)
    scene = first.src / "scenes" / "a.py"
    (tmp_path / "same.py").write_text("print(1)\n")
    scene.unlink()
    scene.symlink_to(tmp_path / "same.py")
    second = snapshot_project(root, revisions)
    assert second.id == first.id
    assert not (second.src / "scenes" / "a.py").is_symlink()
