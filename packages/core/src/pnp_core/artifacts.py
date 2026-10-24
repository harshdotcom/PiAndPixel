"""Published, validated video files stored per project."""

import hashlib
import json
import os
import re
import shutil
import uuid
from collections.abc import Callable, Mapping
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, BinaryIO, Literal, cast, get_args

from pnp_core.probe import MediaInfo

ArtifactKind = Literal["scene_clip", "export"]

_ID_RE = re.compile(r"^[0-9a-f]{32}$")


@dataclass(frozen=True)
class Artifact:
    id: str
    kind: ArtifactKind
    project: str
    path: Path
    width: int
    height: int
    fps: float
    duration_s: float
    sha256: str
    created_at: str
    meta: dict[str, Any]

    def to_json(self) -> dict[str, Any]:
        data = asdict(self)
        data["path"] = str(self.path)
        return data


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_atomic(target: Path, write: Callable[[BinaryIO], object]) -> None:
    """Write to <target>.part, fsync, then rename, so readers never see a partial file."""
    part = target.with_name(target.name + ".part")
    try:
        with part.open("wb") as f:
            write(f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(part, target)
    except BaseException:
        part.unlink(missing_ok=True)
        raise


def _copy_from(src: Path) -> Callable[[BinaryIO], None]:
    def write(f: BinaryIO) -> None:
        with src.open("rb") as s:
            shutil.copyfileobj(s, f)

    return write


class ArtifactStore:
    def __init__(self, root: Path) -> None:
        self.root = root

    def publish(
        self,
        src: Path,
        *,
        kind: ArtifactKind,
        project: str,
        info: MediaInfo,
        meta: Mapping[str, Any],
    ) -> Artifact:
        self.root.mkdir(parents=True, exist_ok=True)
        artifact_id = uuid.uuid4().hex
        video = self.root / f"{artifact_id}.mp4"
        _write_atomic(video, _copy_from(src))
        artifact = Artifact(
            id=artifact_id,
            kind=kind,
            project=project,
            path=video,
            width=info.width,
            height=info.height,
            fps=info.fps,
            duration_s=info.duration_s,
            sha256=_sha256(video),
            created_at=datetime.now(UTC).isoformat(),
            meta=dict(meta),
        )
        record = json.dumps(artifact.to_json(), indent=2).encode()
        _write_atomic(self.root / f"{artifact_id}.json", lambda f: f.write(record))
        return artifact

    def get(self, artifact_id: str) -> Artifact | None:
        if not _ID_RE.fullmatch(artifact_id):
            return None
        return self._load(self.root / f"{artifact_id}.json")

    def list(self) -> list[Artifact]:
        if not self.root.is_dir():
            return []
        found = (self._load(p) for p in self.root.glob("*.json"))
        artifacts = [a for a in found if a is not None]
        return sorted(artifacts, key=lambda a: a.created_at, reverse=True)

    def _load(self, record: Path) -> Artifact | None:
        try:
            data = json.loads(record.read_text(encoding="utf-8"))
            kind = data["kind"]
            if kind not in get_args(ArtifactKind) or not _ID_RE.fullmatch(data["id"]):
                return None
            video = self.root / f"{data['id']}.mp4"
            if not video.is_file():
                return None
            return Artifact(
                id=data["id"],
                kind=cast(ArtifactKind, kind),
                project=str(data["project"]),
                path=video,
                width=int(data["width"]),
                height=int(data["height"]),
                fps=float(data["fps"]),
                duration_s=float(data["duration_s"]),
                sha256=str(data["sha256"]),
                created_at=str(data["created_at"]),
                meta=dict(data["meta"]),
            )
        except (OSError, ValueError, KeyError, TypeError):
            return None
