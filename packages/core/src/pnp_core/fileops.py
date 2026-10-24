"""Text-file operations inside a project, guarded by safe_join and sha256 etags."""

import functools
import hashlib
import os
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

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
from pnp_core.manifest import MANIFEST_FILE
from pnp_core.paths import safe_join

MAX_TEXT_BYTES = 1_000_000
# Never part of the authored source: hidden from the tree and from revision snapshots.
EXCLUDED_NAMES = frozenset({".pnp", ".git", "__pycache__", "media"})
# Agent state and git internals must never be written through the file API.
_PROTECTED_NAMES = frozenset({".pnp", ".git"})


@dataclass(frozen=True)
class FileEntry:
    path: str
    type: Literal["file", "dir"]
    size: int | None


@dataclass(frozen=True)
class TextFile:
    path: str
    content: str
    etag: str


def _os_errors_as_storage[**P, R](func: Callable[P, R]) -> Callable[P, R]:
    """An OSError the checks did not foresee becomes a stable storage_error, never a crash."""

    @functools.wraps(func)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        try:
            return func(*args, **kwargs)
        except OSError as exc:
            raise StorageError(f"the file system refused this: {exc.strerror or exc}") from None

    return wrapper


def etag_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _parts(root: Path, path: str, target: Path) -> tuple[str, ...]:
    """Both the path as given and where it really leads, so a symlink cannot hide a folder."""
    return (*path.split("/"), *target.relative_to(root.resolve()).parts)


def resolve_file(root: Path, path: str) -> Path:
    """safe_join plus: never inside .pnp or .git (even via a symlink), never the root itself."""
    target = safe_join(root, path)
    if target == root.resolve():
        raise UnsafePathError("path must name a file")
    if any(part in _PROTECTED_NAMES for part in _parts(root, path, target)):
        raise UnsafePathError(f"{path!r} is inside a protected folder")
    return target


def _writable(root: Path, path: str) -> Path:
    """resolve_file plus: never in a folder the tree hides, so every written file can be opened."""
    target = resolve_file(root, path)
    if any(part in EXCLUDED_NAMES for part in _parts(root, path, target)):
        raise UnsafePathError(f"{path!r} is inside a folder the Studio does not show")
    return target


def list_tree(root: Path) -> list[FileEntry]:
    """Every folder and file except EXCLUDED_NAMES and symlinks, sorted by path."""
    base = root.resolve()
    entries: list[FileEntry] = []
    for dirpath, dirnames, filenames in os.walk(base):
        here = Path(dirpath)
        dirnames[:] = sorted(
            d for d in dirnames if d not in EXCLUDED_NAMES and not (here / d).is_symlink()
        )
        for name in dirnames:
            entries.append(FileEntry((here / name).relative_to(base).as_posix(), "dir", None))
        for name in filenames:
            file = here / name
            if not file.is_symlink() and file.is_file():
                rel = file.relative_to(base).as_posix()
                entries.append(FileEntry(rel, "file", file.stat().st_size))
    return sorted(entries, key=lambda e: e.path)


def _decode(path: str, data: bytes) -> str:
    if len(data) > MAX_TEXT_BYTES:
        raise FileTooLargeError(f"{path} is larger than {MAX_TEXT_BYTES} bytes")
    if b"\x00" in data:
        raise UnsupportedFileError(f"{path} is not a text file")
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        raise UnsupportedFileError(f"{path} is not UTF-8 text") from None


def _encode(path: str, content: str) -> bytes:
    """The same rules as _decode, so nothing is written that could not be read back."""
    data = content.encode("utf-8")
    if len(data) > MAX_TEXT_BYTES:
        raise FileTooLargeError(f"{path} would be larger than {MAX_TEXT_BYTES} bytes")
    if b"\x00" in data:
        raise UnsupportedFileError(f"{path} would not be a text file (it contains NUL)")
    return data


def _existing(target: Path, path: str) -> Path:
    if not target.is_file():
        raise NotFoundError(f"File {path!r} not found")
    return target


def _own_file(root: Path, path: str) -> Path:
    """An existing file that is not a symlink: deleting or moving a link would hit its target."""
    target = _existing(resolve_file(root, path), path)
    if (root.resolve() / path).is_symlink():
        raise UnsafePathError(f"{path!r} is a symbolic link")
    return target


def _read_limited(target: Path, path: str) -> bytes:
    """The file's bytes; a file over the limit is refused before it is read into memory."""
    if target.stat().st_size > MAX_TEXT_BYTES:
        raise FileTooLargeError(f"{path} is larger than {MAX_TEXT_BYTES} bytes")
    return target.read_bytes()


def _make_parents(target: Path, path: str) -> None:
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
    except (FileExistsError, NotADirectoryError):
        raise UnsafePathError(f"a parent of {path!r} is a file, not a folder") from None


@_os_errors_as_storage
def read_text(root: Path, path: str) -> TextFile:
    data = _read_limited(_existing(resolve_file(root, path), path), path)
    return TextFile(path, _decode(path, data), etag_of(data))


def write_bytes_atomic(target: Path, data: bytes) -> None:
    """Write next to target, fsync, then rename, so readers never see a half-written file."""
    part = target.with_name(f".{target.name}.{uuid.uuid4().hex}.part")
    try:
        with part.open("wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(part, target)
    except BaseException:
        part.unlink(missing_ok=True)
        raise


def _file_etag(target: Path) -> str:
    """Streamed, so a file over the text limit can still be moved or deleted."""
    with target.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def _check_etag(path: str, current: str, if_match: str) -> None:
    if current != if_match.strip().strip('"'):
        raise ConflictError(f"{path} changed on disk since it was opened")


@_os_errors_as_storage
def create_text(root: Path, path: str, content: str) -> TextFile:
    target = _writable(root, path)
    if target.exists():
        raise AlreadyExistsError(f"{path!r} already exists")
    data = _encode(path, content)
    _make_parents(target, path)
    write_bytes_atomic(target, data)
    return TextFile(path, content, etag_of(data))


@_os_errors_as_storage
def save_text(root: Path, path: str, content: str, if_match: str) -> TextFile:
    target = _existing(_writable(root, path), path)
    _check_etag(path, etag_of(_read_limited(target, path)), if_match)
    data = _encode(path, content)
    write_bytes_atomic(target, data)
    return TextFile(path, content, etag_of(data))


def _refuse_manifest(path: str, action: str) -> None:
    if path == MANIFEST_FILE:
        raise ManifestError(f"{MANIFEST_FILE} cannot be {action}")


@_os_errors_as_storage
def rename_file(root: Path, src: str, dest: str) -> str:
    """Move src to dest; returns the moved file's etag."""
    _refuse_manifest(src, "renamed")
    source = _own_file(root, src)
    target = _writable(root, dest)
    if target.exists():
        raise AlreadyExistsError(f"{dest!r} already exists")
    _make_parents(target, dest)
    source.rename(target)
    return _file_etag(target)


@_os_errors_as_storage
def delete_file(root: Path, path: str, if_match: str) -> None:
    _refuse_manifest(path, "deleted")
    target = _own_file(root, path)
    _check_etag(path, _file_etag(target), if_match)
    target.unlink()
