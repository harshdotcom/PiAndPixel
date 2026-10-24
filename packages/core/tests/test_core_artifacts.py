import hashlib
import json
import time
from pathlib import Path

import pytest
from pnp_core.artifacts import ArtifactStore
from pnp_core.probe import MediaInfo

INFO = MediaInfo(480, 270, 15.0, 5.0, "h264", "yuv420p", False)


@pytest.fixture
def clip(tmp_path: Path) -> Path:
    path = tmp_path / "Proof.mp4"
    path.write_bytes(b"fake video bytes")
    return path


def test_publish_and_get(tmp_path: Path, clip: Path) -> None:
    store = ArtifactStore(tmp_path / "proj" / ".pnp" / "artifacts")
    meta = {"scene": "s.py:S", "job_id": "j1"}
    art = store.publish(clip, kind="scene_clip", project="proj", info=INFO, meta=meta)
    assert len(art.id) == 32
    assert art.path == store.root / f"{art.id}.mp4"
    assert art.path.read_bytes() == b"fake video bytes"
    assert art.sha256 == hashlib.sha256(b"fake video bytes").hexdigest()
    assert art.created_at.endswith("+00:00")
    assert (art.width, art.height, art.fps, art.duration_s) == (480, 270, 15.0, 5.0)
    assert sorted(p.name for p in store.root.iterdir()) == sorted(
        [f"{art.id}.mp4", f"{art.id}.json"]
    )
    assert store.get(art.id) == art
    record = json.loads((store.root / f"{art.id}.json").read_text())
    assert record == art.to_json()
    assert record["path"] == str(art.path)


def test_list_newest_first(tmp_path: Path, clip: Path) -> None:
    store = ArtifactStore(tmp_path / "artifacts")
    assert store.list() == []
    first = store.publish(clip, kind="scene_clip", project="p", info=INFO, meta={})
    time.sleep(0.01)
    second = store.publish(clip, kind="export", project="p", info=INFO, meta={})
    assert [a.id for a in store.list()] == [second.id, first.id]


@pytest.mark.parametrize(
    "bad_id",
    ["", "../x", "A" * 32, "0" * 31, "0" * 33, "g" * 32, "0" * 31 + "/", "../../etc/passwd"],
)
def test_bad_ids_return_none(tmp_path: Path, bad_id: str) -> None:
    store = ArtifactStore(tmp_path / "artifacts")
    assert store.get(bad_id) is None
    assert not store.root.exists()


def test_unknown_id_and_corrupt_record(tmp_path: Path, clip: Path) -> None:
    store = ArtifactStore(tmp_path / "artifacts")
    art = store.publish(clip, kind="scene_clip", project="p", info=INFO, meta={})
    assert store.get("0" * 32) is None
    (store.root / f"{art.id}.json").write_text("{not json")
    assert store.get(art.id) is None
    assert store.list() == []


def test_failed_publish_leaves_no_artifact(tmp_path: Path) -> None:
    store = ArtifactStore(tmp_path / "artifacts")
    with pytest.raises(FileNotFoundError):
        store.publish(tmp_path / "missing.mp4", kind="scene_clip", project="p", info=INFO, meta={})
    assert store.list() == []
    assert not list(store.root.glob("*.mp4"))
    assert not list(store.root.glob("*.part"))
