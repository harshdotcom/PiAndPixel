import os
from pathlib import Path

import pytest
from pnp_core.errors import UnsafePathError
from pnp_core.paths import safe_join

TRAVERSAL_CORPUS = [
    "",
    "..",
    "../x",
    "/etc/passwd",
    "a/../../b",
    "a/..",
    "C:\\x",
    "C:x",
    "\\\\server\\x",
    "a\\b",
    "a\x00b",
]


@pytest.mark.parametrize("user_path", TRAVERSAL_CORPUS)
def test_rejects_unsafe_paths(tmp_path: Path, user_path: str) -> None:
    with pytest.raises(UnsafePathError):
        safe_join(tmp_path, user_path)


def test_unsafe_path_error_code() -> None:
    assert UnsafePathError.code == "invalid_path"


def test_accepts_nested_relative_path(tmp_path: Path) -> None:
    result = safe_join(tmp_path, "scenes/proof.py")
    assert result == tmp_path.resolve() / "scenes" / "proof.py"
    assert result.is_absolute()


def test_accepts_dot_segments_that_stay_inside(tmp_path: Path) -> None:
    assert safe_join(tmp_path, "./a/./b.py") == tmp_path.resolve() / "a" / "b.py"


def test_rejects_symlink_escaping_root(tmp_path: Path) -> None:
    root = tmp_path / "root"
    outside = tmp_path / "outside"
    root.mkdir()
    outside.mkdir()
    (outside / "secret.txt").write_text("x")
    os.symlink(outside, root / "link")
    with pytest.raises(UnsafePathError):
        safe_join(root, "link/secret.txt")


def test_allows_symlink_inside_root(tmp_path: Path) -> None:
    (tmp_path / "real").mkdir()
    os.symlink(tmp_path / "real", tmp_path / "alias")
    assert safe_join(tmp_path, "alias/f.py") == tmp_path.resolve() / "real" / "f.py"
