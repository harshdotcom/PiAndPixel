"""Project text-file operations: tree, read, create, save/delete with etag, rename."""

from pathlib import Path

import pytest
from pnp_core.errors import (
    AlreadyExistsError,
    ConflictError,
    FileTooLargeError,
    ManifestError,
    NotFoundError,
    StorageError,
    UnsafePathError,
    UnsupportedFileError,
)
from pnp_core.fileops import (
    MAX_TEXT_BYTES,
    create_text,
    delete_file,
    etag_of,
    list_tree,
    read_text,
    rename_file,
    save_text,
)


@pytest.fixture
def project(tmp_path: Path) -> Path:
    root = tmp_path / "proj"
    (root / "scenes" / "__pycache__").mkdir(parents=True)
    (root / ".pnp" / "jobs").mkdir(parents=True)
    (root / "media").mkdir()
    (root / "pnp.yaml").write_text("pnp: 1\nname: x\n")
    (root / "scenes" / "a.py").write_text("print(1)\n")
    (root / "scenes" / "__pycache__" / "a.pyc").write_bytes(b"\x00")
    (root / ".pnp" / "state").write_text("secret")
    return root


def test_tree_lists_source_only(project: Path) -> None:
    (project / "link.py").symlink_to(project / "scenes" / "a.py")
    tree = [(e.path, e.type, e.size) for e in list_tree(project)]
    assert tree == [("pnp.yaml", "file", 15), ("scenes", "dir", None), ("scenes/a.py", "file", 9)]


def test_read_returns_content_and_sha256_etag(project: Path) -> None:
    f = read_text(project, "scenes/a.py")
    assert f.content == "print(1)\n"
    assert f.etag == etag_of(b"print(1)\n")


def test_read_rejects_binary_large_and_missing(project: Path) -> None:
    (project / "img.png").write_bytes(b"\x89PNG\x00")
    (project / "big.txt").write_bytes(b"a" * (MAX_TEXT_BYTES + 1))
    with pytest.raises(UnsupportedFileError):
        read_text(project, "img.png")
    with pytest.raises(FileTooLargeError):
        read_text(project, "big.txt")
    with pytest.raises(NotFoundError):
        read_text(project, "nope.py")


@pytest.mark.parametrize("path", [".pnp/state", "x/.git/config", "../x.py", "/etc/passwd"])
def test_protected_and_escaping_paths_are_refused(project: Path, path: str) -> None:
    with pytest.raises(UnsafePathError):
        read_text(project, path)
    with pytest.raises(UnsafePathError):
        create_text(project, path, "x")


def test_create_makes_parents_and_refuses_existing(project: Path) -> None:
    created = create_text(project, "scenes/new/b.py", "x = 1\n")
    assert (project / "scenes/new/b.py").read_text() == "x = 1\n"
    assert created.etag == etag_of(b"x = 1\n")
    with pytest.raises(AlreadyExistsError):
        create_text(project, "scenes/a.py", "")


def test_save_checks_etag(project: Path) -> None:
    etag = read_text(project, "scenes/a.py").etag
    saved = save_text(project, "scenes/a.py", "print(2)\n", f'"{etag}"')
    assert saved.etag == etag_of(b"print(2)\n")
    with pytest.raises(ConflictError):
        save_text(project, "scenes/a.py", "print(3)\n", etag)
    assert (project / "scenes/a.py").read_text() == "print(2)\n"


def test_save_refuses_oversized_content(project: Path) -> None:
    etag = read_text(project, "scenes/a.py").etag
    with pytest.raises(FileTooLargeError):
        save_text(project, "scenes/a.py", "a" * (MAX_TEXT_BYTES + 1), etag)


def test_delete_checks_etag_and_protects_manifest(project: Path) -> None:
    with pytest.raises(ConflictError):
        delete_file(project, "scenes/a.py", "0" * 64)
    delete_file(project, "scenes/a.py", read_text(project, "scenes/a.py").etag)
    assert not (project / "scenes/a.py").exists()
    with pytest.raises(ManifestError):
        delete_file(project, "pnp.yaml", read_text(project, "pnp.yaml").etag)


def test_rename(project: Path) -> None:
    rename_file(project, "scenes/a.py", "scenes/sub/b.py")
    assert (project / "scenes/sub/b.py").read_text() == "print(1)\n"
    create_text(project, "c.py", "")
    with pytest.raises(AlreadyExistsError):
        rename_file(project, "c.py", "scenes/sub/b.py")
    with pytest.raises(ManifestError):
        rename_file(project, "pnp.yaml", "x.yaml")


def test_symlink_to_pnp_cannot_reach_agent_state(project: Path) -> None:
    (project / "pp").symlink_to(".pnp")
    etag = etag_of(b"secret")
    with pytest.raises(UnsafePathError):
        read_text(project, "pp/state")
    with pytest.raises(UnsafePathError):
        save_text(project, "pp/state", "TAMPERED", etag)
    with pytest.raises(UnsafePathError):
        create_text(project, "pp/evil.txt", "x")
    with pytest.raises(UnsafePathError):
        rename_file(project, "scenes/a.py", "pp/moved.py")
    with pytest.raises(UnsafePathError):
        delete_file(project, "pp/state", etag)
    assert (project / ".pnp" / "state").read_text() == "secret"
    assert sorted(p.name for p in (project / ".pnp").iterdir()) == ["jobs", "state"]


def test_delete_and_rename_refuse_a_symlink_instead_of_its_target(project: Path) -> None:
    (project / "lnk").symlink_to("scenes/a.py")
    with pytest.raises(UnsafePathError):
        delete_file(project, "lnk", read_text(project, "lnk").etag)
    with pytest.raises(UnsafePathError):
        rename_file(project, "lnk", "moved.py")
    assert (project / "scenes" / "a.py").read_text() == "print(1)\n"


def test_writes_under_a_file_are_refused(project: Path) -> None:
    with pytest.raises(UnsafePathError):
        create_text(project, "scenes/a.py/x", "")
    with pytest.raises(UnsafePathError):
        create_text(project, "scenes/a.py/x/y.py", "")
    with pytest.raises(UnsafePathError):
        rename_file(project, "scenes/a.py", "scenes/a.py/x")


def test_writes_refuse_what_reads_and_the_tree_refuse(project: Path) -> None:
    with pytest.raises(UnsupportedFileError):
        create_text(project, "bin.py", "a\x00b")
    with pytest.raises(UnsupportedFileError):
        save_text(project, "scenes/a.py", "a\x00b", read_text(project, "scenes/a.py").etag)
    for hidden in ("media/x.py", "scenes/__pycache__/x.py"):
        with pytest.raises(UnsafePathError):
            create_text(project, hidden, "")
    with pytest.raises(UnsafePathError):
        rename_file(project, "scenes/a.py", "media/a.py")
    assert not (project / "bin.py").exists()


def test_oversized_file_is_refused_before_it_is_read(
    project: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (project / "big.txt").write_bytes(b"a" * (MAX_TEXT_BYTES + 1))

    def no_read(self: Path) -> bytes:
        raise AssertionError(f"{self} was read")

    monkeypatch.setattr(Path, "read_bytes", no_read)
    with pytest.raises(FileTooLargeError):
        read_text(project, "big.txt")
    with pytest.raises(FileTooLargeError):
        save_text(project, "big.txt", "x", "0" * 64)


def test_os_errors_become_storage_errors(project: Path) -> None:
    (project / "locked").mkdir()
    (project / "locked").chmod(0o555)
    try:
        with pytest.raises(StorageError):
            create_text(project, "locked/x.py", "")
        with pytest.raises(StorageError):
            rename_file(project, "scenes/a.py", "locked/a.py")
    finally:
        (project / "locked").chmod(0o755)
    assert (project / "scenes" / "a.py").is_file()


def test_large_files_can_be_moved_and_deleted(project: Path) -> None:
    data = b"a" * (MAX_TEXT_BYTES + 1)
    (project / "big.txt").write_bytes(data)
    assert rename_file(project, "big.txt", "moved.txt") == etag_of(data)
    delete_file(project, "moved.txt", etag_of(data))
    assert not (project / "moved.txt").exists()
