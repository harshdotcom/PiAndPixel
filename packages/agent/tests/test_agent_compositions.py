"""GET/PUT /projects/{pid}/compositions: round trip through pnp.yaml with an etag."""

import hashlib
from pathlib import Path
from typing import Any

import pytest
import yaml
from agent_helpers import AUTH, create_project
from fastapi.testclient import TestClient
from pnp_agent.settings import Settings

URL = "/api/v1/projects/demo/compositions"
TWO_CLIPS = {
    "main": {
        "title": "Main cut",
        "clips": [
            {"scene": "scenes/proof.py:Proof", "params": {"n": 3}},
            {"scene": "scenes/proof.py:Proof", "params": {}},
        ],
    },
    "short": {"title": None, "clips": [{"scene": "scenes/proof.py:Proof", "params": {}}]},
}


@pytest.fixture
def manifest(client: TestClient, settings: Settings) -> Path:
    assert create_project(client, name="Demo") == "demo"
    path = settings.workspace / "demo" / "pnp.yaml"
    path.write_text(
        path.read_text() + "defaults: { fps: 24 }\nformats: { tiny: {width: 160, height: 90} }\n"
    )
    return path


def _etag(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _put(client: TestClient, body: dict[str, Any], etag: str | None) -> Any:
    headers = AUTH if etag is None else {**AUTH, "If-Match": f'"{etag}"'}
    return client.put(URL, json=body, headers=headers)


def test_get_compositions(client: TestClient, manifest: Path) -> None:
    resp = client.get(URL, headers=AUTH)
    assert resp.status_code == 200
    assert resp.json() == {
        "compositions": {
            "main": {"title": "Main", "clips": [{"scene": "scenes/proof.py:Proof", "params": {}}]}
        },
        "etag": _etag(manifest),
    }


def test_round_trip_keeps_other_keys(client: TestClient, manifest: Path) -> None:
    before = yaml.safe_load(manifest.read_text())
    resp = _put(client, {"compositions": TWO_CLIPS}, _etag(manifest))
    assert resp.status_code == 200
    assert resp.json() == {"compositions": TWO_CLIPS, "etag": _etag(manifest)}
    after = yaml.safe_load(manifest.read_text())
    assert {k: v for k, v in after.items() if k != "compositions"} == {
        k: v for k, v in before.items() if k != "compositions"
    }
    assert client.get(URL, headers=AUTH).json()["compositions"] == TWO_CLIPS


def test_compositions_can_be_removed(client: TestClient, manifest: Path) -> None:
    resp = _put(client, {"compositions": {}}, _etag(manifest))
    assert resp.status_code == 200
    assert resp.json()["compositions"] == {}


@pytest.mark.parametrize(
    "compositions",
    [{"main": {"clips": []}},
     {"main": {"clips": [{"scene": "no-class-here"}]}},
     {"main": {"clips": [{"scene": "../x.py:X"}]}},
     {"main": {"clips": [{"scene": "scenes/proof.py:Proof", "extra": 1}]}},
     {"-bad": {"clips": [{"scene": "scenes/proof.py:Proof"}]}},
     {"a" * 65: {"clips": [{"scene": "scenes/proof.py:Proof"}]}}],
    ids=["empty-clips", "bad-ref", "traversal-ref", "extra-key", "bad-name", "long-name"],
)  # fmt: skip
def test_invalid_compositions_are_rejected(
    client: TestClient, manifest: Path, compositions: dict[str, Any]
) -> None:
    original = manifest.read_bytes()
    resp = _put(client, {"compositions": compositions}, _etag(manifest))
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"
    assert manifest.read_bytes() == original


def test_if_match_required_and_checked(client: TestClient, manifest: Path) -> None:
    original = manifest.read_bytes()
    missing = _put(client, {"compositions": TWO_CLIPS}, None)
    assert (missing.status_code, missing.json()["error"]["code"]) == (428, "precondition_required")
    stale = _put(client, {"compositions": TWO_CLIPS}, "0" * 64)
    assert (stale.status_code, stale.json()["error"]["code"]) == (412, "conflict")
    assert manifest.read_bytes() == original


def test_invalid_manifest_on_disk_is_422(client: TestClient, manifest: Path) -> None:
    manifest.write_text("pnp: 2\n")
    assert client.get(URL, headers=AUTH).status_code == 422
    assert _put(client, {"compositions": {}}, _etag(manifest)).status_code == 422
    assert manifest.read_text() == "pnp: 2\n"


def test_unknown_project_is_404(client: TestClient) -> None:
    resp = client.get("/api/v1/projects/nope/compositions", headers=AUTH)
    assert resp.status_code == 404
