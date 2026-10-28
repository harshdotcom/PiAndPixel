"""Export planning: one render unit per distinct (scene, params) clip, then one composite."""

import hashlib
import json
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from pnp_core.manifest import Clip

from pnp_agent.job_records import ExportRecord, JobRecord

_RUNNING_OR_DONE = ("running", "completed")
_OUTPUT_KEYS = ("resolution", "fps", "width", "height")


@dataclass(frozen=True)
class RenderUnit:
    scene: str
    params: dict[str, Any]

    @property
    def key(self) -> str:
        return canonical_params(self.scene, self.params)


def canonical_params(scene: str, params: dict[str, Any]) -> str:
    return json.dumps([scene, params], sort_keys=True, separators=(",", ":"))


def plan_units(clips: Sequence[Clip]) -> tuple[list[RenderUnit], list[int]]:
    """Distinct units in first-appearance order, and for each clip the index of its unit."""
    units: list[RenderUnit] = []
    index: dict[str, int] = {}
    clip_units: list[int] = []
    for clip in clips:
        unit = RenderUnit(clip.scene, dict(clip.params))
        if unit.key not in index:
            index[unit.key] = len(units)
            units.append(unit)
        clip_units.append(index[unit.key])
    return units, clip_units


def request_hash(
    composition: str, fmt: str, output: dict[str, Any], extra: dict[str, Any] | None = None
) -> str:
    """Same composition, format and output choices (resolution, fps, size) = same request."""
    body = {"composition": composition, "format": fmt, **output}
    if extra:
        body.update(extra)
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def export_status(units: Sequence[JobRecord], composite: JobRecord) -> str:
    """Derived, never stored: a queued composite reads "running" once any unit has started."""
    if composite.status == "queued":
        started = any(u.status in _RUNNING_OR_DONE for u in units)
        return "running" if started else "queued"
    return composite.status


def export_json(export: ExportRecord, jobs: Sequence[JobRecord]) -> dict[str, Any]:
    """`jobs` = the export's jobs in creation order (units, then the composite)."""
    *units, composite = jobs
    return {
        "id": export.id,
        "project": export.project,
        "composition": export.composition,
        "format": export.format,
        "quality": export.quality,
        "delivery_profile": composite.request.get("delivery_profile", "custom"),
        **{k: composite.request.get(k) for k in _OUTPUT_KEYS},
        "status": export_status(units, composite),
        "revision_id": export.revision_id,
        "created_at": export.created_at,
        "finished_at": composite.finished_at,
        "units_total": len(units),
        "units_done": sum(u.status == "completed" for u in units),
        "unit_job_ids": [u.id for u in units],
        "composite_job_id": composite.id,
        "artifact_id": composite.artifact_id,
        "error": composite.error,
        "error_code": composite.error_code,
    }


def export_status_event(data: dict[str, Any]) -> dict[str, Any]:
    keys = ("project", "status", "units_done", "units_total", "artifact_id", "error")
    return {"type": "export.status", "export_id": data["id"], **{k: data[k] for k in keys}}
