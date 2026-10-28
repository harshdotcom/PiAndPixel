"""Build a bounded, scene-only source excerpt for user-requested narration drafts."""

import ast
import re
from collections.abc import Iterable
from pathlib import Path

from pnp_core.manifest import Clip, parse_scene_ref
from pnp_core.paths import safe_join

from pnp_agent.errors import ApiError

_MAX_SOURCE_BYTES = 200_000
_MAX_CONTEXT_CHARS = 40_000
_SENSITIVE_NAME = re.compile(r"(?:api[_-]?key|secret|password|token)", re.I)
_SECRET_VALUE = re.compile(r"\b(?:sk-[A-Za-z0-9_-]{20,}|dg_[A-Za-z0-9_-]{20,})\b")


def _loaded_names(node: ast.AST) -> set[str]:
    return {
        child.id
        for child in ast.walk(node)
        if isinstance(child, ast.Name) and isinstance(child.ctx, ast.Load)
    }


def _assigned_names(node: ast.stmt) -> set[str]:
    if isinstance(node, ast.Assign):
        targets = node.targets
    elif isinstance(node, ast.AnnAssign):
        targets = [node.target]
    else:
        return set()
    return {
        child.id for target in targets for child in ast.walk(target) if isinstance(child, ast.Name)
    }


def _excerpt(root: Path, clip: Clip) -> str:
    file, class_name = parse_scene_ref(clip.scene)
    path = safe_join(root, file)
    try:
        if path.stat().st_size > _MAX_SOURCE_BYTES:
            raise ApiError(
                413, "scene_source_too_large", f"{file} is too large for a narration draft"
            )
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=file)
    except ApiError:
        raise
    except (OSError, UnicodeDecodeError, SyntaxError):
        raise ApiError(
            422, "scene_source_unavailable", f"Could not read selected scene {clip.scene}"
        ) from None

    definitions = {
        node.name: node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
    }
    scene = definitions.get(class_name)
    if not isinstance(scene, ast.ClassDef):
        raise ApiError(422, "scene_source_unavailable", f"Could not find {class_name} in {file}")

    selected = {class_name}
    needed = _loaded_names(scene)
    changed = True
    while changed:
        changed = False
        for name in needed - selected:
            helper = definitions.get(name)
            if helper is not None:
                selected.add(name)
                needed.update(_loaded_names(helper))
                changed = True

    nodes: list[ast.stmt] = [
        node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
        and node.name in selected
    ]
    nodes.extend(
        node
        for node in tree.body
        if isinstance(node, (ast.Assign, ast.AnnAssign))
        and _assigned_names(node) & needed
        and not any(_SENSITIVE_NAME.search(name) for name in _assigned_names(node))
    )
    nodes.sort(key=lambda node: node.lineno)
    snippets = [ast.get_source_segment(source, node) or "" for node in nodes]
    excerpt = "\n\n".join(snippets)
    excerpt = _SECRET_VALUE.sub("[redacted secret]", excerpt)
    return f"Scene: {clip.scene}\n```python\n{excerpt}\n```"


def selected_scene_context(root: Path, clips: Iterable[Clip]) -> str:
    """Return selected scene classes and local helpers, never unrelated project files."""
    blocks: list[str] = []
    seen: set[str] = set()
    for clip in clips:
        if clip.scene in seen:
            continue
        seen.add(clip.scene)
        blocks.append(_excerpt(root, clip))
    context = "\n\n".join(blocks)
    if not context or len(context) > _MAX_CONTEXT_CHARS:
        raise ApiError(
            413, "scene_context_too_large", "Selected scene code is too large for a narration draft"
        )
    return context
