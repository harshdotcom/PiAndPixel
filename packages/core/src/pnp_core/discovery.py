"""Find Manim scene classes by reading source code (never importing it)."""

import ast
import os
from dataclasses import dataclass
from pathlib import Path

_SKIP_DIRS = {"__pycache__", "media"}


@dataclass(frozen=True)
class SceneInfo:
    file: str
    class_name: str
    line: int

    @property
    def ref(self) -> str:
        return f"{self.file}:{self.class_name}"


@dataclass(frozen=True)
class DiscoveryError:
    file: str
    line: int | None
    message: str


def _base_name(base: ast.expr) -> str | None:
    if isinstance(base, ast.Name):
        return base.id
    if isinstance(base, ast.Attribute):
        return base.attr
    return None


def _scenes_in_tree(tree: ast.Module, file: str) -> list[SceneInfo]:
    known: set[str] = set()
    scenes: list[SceneInfo] = []
    # Only top-level classes: scenes are rendered by module-level name.
    for node in tree.body:
        if not isinstance(node, ast.ClassDef):
            continue
        names = [_base_name(base) for base in node.bases]
        if any(n is not None and (n.endswith("Scene") or n in known) for n in names):
            known.add(node.name)
            scenes.append(SceneInfo(file, node.name, node.lineno))
    return scenes


def _python_files(project_root: Path) -> list[Path]:
    files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(project_root):
        dirnames[:] = [d for d in dirnames if not d.startswith(".") and d not in _SKIP_DIRS]
        files.extend(Path(dirpath) / f for f in filenames if f.endswith(".py"))
    return files


def discover_scenes(project_root: Path) -> tuple[list[SceneInfo], list[DiscoveryError]]:
    scenes: list[SceneInfo] = []
    errors: list[DiscoveryError] = []
    for path in _python_files(project_root):
        rel = path.relative_to(project_root).as_posix()
        try:
            tree = ast.parse(path.read_bytes(), filename=rel)
        except SyntaxError as exc:
            errors.append(DiscoveryError(rel, exc.lineno, f"SyntaxError: {exc.msg}"))
            continue
        except (OSError, ValueError) as exc:
            errors.append(DiscoveryError(rel, None, f"cannot read file: {exc}"))
            continue
        scenes.extend(_scenes_in_tree(tree, rel))
    scenes.sort(key=lambda s: (s.file, s.line))
    errors.sort(key=lambda e: (e.file, e.line or 0))
    return scenes, errors
