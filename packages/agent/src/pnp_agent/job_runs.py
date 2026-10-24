"""What one claimed job does: render a scene clip or composite an export, then publish it."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from pnp_core.artifacts import ArtifactStore
from pnp_core.compose import ComposeRequest
from pnp_core.errors import PnpError
from pnp_core.formats import Quality
from pnp_core.manifest import load_manifest
from pnp_core.probe import MAX_CLIP_DURATION_S, MediaInfo, check_clip
from pnp_core.render import CancelToken, RenderLimits, RenderRequest, ToolPaths
from pnp_core.revisions import load_revision

from pnp_agent.job_records import Finish, JobRecord
from pnp_agent.job_store import JobStore

if TYPE_CHECKING:  # jobs.py imports this module at runtime
    from pnp_agent.jobs import Composer, RenderRunner

_OUTPUT_KEYS = ("quality", "resolution", "fps", "width", "height")
_KILLED_CODES = {"timed_out": "timeout", "cancelled": "cancelled"}


@dataclass
class Tools:
    """What a worker runs jobs with (injectable fakes in tests)."""

    runner: RenderRunner
    prober: Callable[[Path], MediaInfo]
    composer: Composer
    paths: ToolPaths
    limits: RenderLimits


def _failure(status: str, error: str | None, exit_code: int | None) -> Finish:
    if status == "completed":  # exit 0 but nothing to publish
        error = error or "The job produced no video"
        return Finish("failed", error, "render_failed", None, exit_code)
    if status == "failed":
        limited = (error or "").startswith("resource_limit:")
        code = "resource_limit" if limited else "render_failed"
        return Finish("failed", error, code, None, exit_code)
    return Finish(status, error, _KILLED_CODES.get(status, "render_failed"), None, exit_code)


def _invalid_clip(info: MediaInfo, req: dict[str, int], exit_code: int | None) -> Finish | None:
    problems = check_clip(info, width=req["width"], height=req["height"], fps=req["fps"])
    if not problems:
        return None
    # The same stable code an over-long export gets (docs/api.md).
    code = "duration_exceeded" if info.duration_s > MAX_CLIP_DURATION_S else "validation_error"
    return Finish("failed", "; ".join(problems), code, None, exit_code)


def run_render(
    workspace: Path, job: JobRecord, workdir: Path, cancel: CancelToken, tools: Tools,
    on_line: Callable[[str], None],
) -> Finish:  # fmt: skip
    root = workspace / job.project
    rev = load_revision(root / ".pnp" / "revisions", job.revision_id or "")
    if rev is None:
        return Finish("failed", "The project revision of this job is missing", "internal_error")
    req = job.request
    fmt = load_manifest(rev.src).all_formats()[req["format"]]
    render_req = RenderRequest(
        rev.src, req["scene"], fmt, Quality(req["quality"]), params=req["params"],
        # Jobs queued before resolution/fps existed stay on their quality preset.
        resolution=req.get("resolution"), fps=req["fps"] if "resolution" in req else None,
    )  # fmt: skip
    result = tools.runner(render_req, workdir, tools=tools.paths, limits=tools.limits,
                          on_line=on_line, cancel=cancel)  # fmt: skip
    if result.status != "completed" or result.output is None:
        return _failure(result.status, result.error, result.exit_code)
    try:
        info = tools.prober(result.output)
    except PnpError as exc:
        return Finish("failed", str(exc), "probe_error", None, result.exit_code)
    invalid = _invalid_clip(info, req, result.exit_code)
    if invalid is not None:
        return invalid
    meta = {k: req[k] for k in ("scene", "format", *_OUTPUT_KEYS) if k in req}
    meta |= {"job_id": job.id, "revision_id": job.revision_id}
    artifact = ArtifactStore(root / ".pnp" / "artifacts").publish(
        result.output, kind="scene_clip", project=job.project, info=info, meta=meta
    )
    return Finish("completed", None, None, artifact.id, result.exit_code)


def run_composite(
    workspace: Path, job: JobRecord, workdir: Path, cancel: CancelToken, tools: Tools,
    jobs: JobStore, on_line: Callable[[str], None], on_progress: Callable[[float], None],
) -> Finish:  # fmt: skip
    store = ArtifactStore(workspace / job.project / ".pnp" / "artifacts")
    req = job.request
    clips: list[Path] = []
    for clip in req["clips"]:
        unit = jobs.get(clip["unit_job_id"])
        artifact = store.get(unit.artifact_id) if unit and unit.artifact_id else None
        if artifact is None:
            return Finish("failed", f"No video for clip {clip['scene']}", "internal_error")
        clips.append(artifact.path)
    result = tools.composer(
        ComposeRequest(tuple(clips), req["width"], req["height"], req["fps"]), workdir,
        tools=tools.paths, limits=tools.limits, on_line=on_line, on_progress=on_progress,
        cancel=cancel,
    )  # fmt: skip
    if result.status != "completed" or result.output is None:
        end = _failure(result.status, result.error, result.exit_code)
        return Finish(end.status, end.error, result.error_code or end.error_code, None,
                      end.exit_code)  # fmt: skip
    try:
        info = tools.prober(result.output)
    except PnpError as exc:
        return Finish("failed", str(exc), "probe_error", None, result.exit_code)
    meta = {k: req[k] for k in ("composition", "format", *_OUTPUT_KEYS) if k in req}
    meta |= {"export_id": job.export_id, "job_id": job.id, "revision_id": job.revision_id}
    artifact = store.publish(
        result.output, kind="export", project=job.project, info=info, meta=meta
    )
    return Finish("completed", None, None, artifact.id, result.exit_code)
