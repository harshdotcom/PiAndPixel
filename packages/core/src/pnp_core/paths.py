"""Safe resolution of user-supplied relative paths."""

import re
from pathlib import Path

from pnp_core.errors import UnsafePathError

_WINDOWS_DRIVE = re.compile(r"^[A-Za-z]:")


def safe_join(root: Path, user_path: str) -> Path:
    """Join a client-supplied relative path onto root, refusing anything that could escape it."""
    if not user_path:
        raise UnsafePathError("path is empty")
    if "\x00" in user_path:
        raise UnsafePathError("path contains a NUL byte")
    if "\\" in user_path:
        raise UnsafePathError("path contains a backslash")
    if user_path.startswith("/") or _WINDOWS_DRIVE.match(user_path):
        raise UnsafePathError("path must be relative")
    if ".." in user_path.split("/"):
        raise UnsafePathError("path must not contain '..'")
    base = root.resolve()
    # resolve() follows symlinks, so a link pointing outside root is caught here.
    resolved = (base / user_path).resolve()
    if not resolved.is_relative_to(base):
        raise UnsafePathError("path escapes the project root")
    return resolved
