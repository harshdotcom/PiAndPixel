"""Token auth, Host/Origin checks, body size limits and the error envelope."""

import json

import pytest
from agent_helpers import AUTH, create_project
from fastapi.testclient import TestClient

PROTECTED = [
    ("GET", "/api/v1/agent"),
    ("GET", "/api/v1/templates"),
    ("GET", "/api/v1/projects"),
    ("POST", "/api/v1/projects"),
    ("GET", "/api/v1/projects/demo"),
    ("GET", "/api/v1/projects/demo/scenes"),
    ("POST", "/api/v1/projects/demo/renders"),
    ("GET", "/api/v1/projects/demo/files"),
    ("POST", "/api/v1/projects/demo/files"),
    ("POST", "/api/v1/projects/demo/files/rename"),
    ("GET", "/api/v1/projects/demo/files/scenes/proof.py"),
    ("PUT", "/api/v1/projects/demo/files/scenes/proof.py"),
    ("DELETE", "/api/v1/projects/demo/files/scenes/proof.py"),
    ("GET", "/api/v1/projects/demo/revisions"),
    ("GET", "/api/v1/projects/demo/compositions"),
    ("PUT", "/api/v1/projects/demo/compositions"),
    ("GET", "/api/v1/jobs"),
    ("GET", "/api/v1/jobs/abc"),
    ("GET", "/api/v1/jobs/abc/logs"),
    ("GET", "/api/v1/artifacts/abc"),
    ("GET", "/api/v1/nonexistent"),
]


def assert_envelope(body: dict[str, object], code: str) -> None:
    assert set(body) == {"error"}
    error = body["error"]
    assert isinstance(error, dict)
    assert set(error) == {"code", "message", "details"}
    assert error["code"] == code
    assert isinstance(error["message"], str)


@pytest.mark.parametrize(("method", "path"), PROTECTED)
@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer wrong"}, {"Authorization": "test-token-123"}],
    ids=["missing", "wrong", "no-scheme"],
)
def test_protected_routes_require_token(
    client: TestClient, method: str, path: str, headers: dict[str, str]
) -> None:
    resp = client.request(method, path, headers=headers)
    assert resp.status_code == 401
    assert_envelope(resp.json(), "unauthorized")


def test_health_needs_no_token(client: TestClient) -> None:
    resp = client.get("/api/v1/agent/health")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_token_grants_access(client: TestClient) -> None:
    assert client.get("/api/v1/projects", headers=AUTH).status_code == 200


@pytest.mark.parametrize("host", ["evil.example:7860", "127.0.0.1:9999", "attacker.com"])
def test_bad_host_is_rejected(client: TestClient, host: str) -> None:
    resp = client.get("/api/v1/agent/health", headers={"Host": host})
    assert resp.status_code == 403
    assert_envelope(resp.json(), "forbidden_origin")


@pytest.mark.parametrize("host", ["127.0.0.1:7860", "localhost:7860"])
def test_loopback_hosts_are_allowed(client: TestClient, host: str) -> None:
    assert client.get("/api/v1/agent/health", headers={"Host": host}).status_code == 200


def test_bad_origin_is_rejected_even_with_token(client: TestClient) -> None:
    headers = {**AUTH, "Origin": "https://evil.example"}
    resp = client.get("/api/v1/projects", headers=headers)
    assert resp.status_code == 403
    assert_envelope(resp.json(), "forbidden_origin")


@pytest.mark.parametrize(
    "origin", ["http://localhost:5173", "http://127.0.0.1:5173", "http://127.0.0.1:7860"]
)
def test_allowed_origins(client: TestClient, origin: str) -> None:
    resp = client.get("/api/v1/projects", headers={**AUTH, "Origin": origin})
    assert resp.status_code == 200


def test_unknown_route_uses_envelope(client: TestClient) -> None:
    resp = client.get("/api/v1/nonexistent", headers=AUTH)
    assert resp.status_code == 404
    assert_envelope(resp.json(), "not_found")


def test_request_validation_uses_envelope(client: TestClient) -> None:
    resp = client.post("/api/v1/projects", json={"template": "blank"}, headers=AUTH)
    assert resp.status_code == 422
    body = resp.json()
    assert_envelope(body, "validation_error")
    assert any("name" in d["loc"] for d in body["error"]["details"])


def test_render_validation_uses_envelope(client: TestClient) -> None:
    pid = create_project(client)
    resp = client.post(f"/api/v1/projects/{pid}/renders", json={"quality": "ultra"}, headers=AUTH)
    assert resp.status_code == 422
    assert_envelope(resp.json(), "validation_error")


def test_agent_info_shape(client: TestClient) -> None:
    info = client.get("/api/v1/agent", headers=AUTH).json()
    assert info["version"] == "0.1.0"
    assert info["target"] in {"local", "colab", "docker"}
    assert set(info["tools"]) == {"manim", "ffmpeg", "ffprobe", "latex"}
    assert info["features"] == {"terminal": True}  # loopback bind, not disabled
    assert info["cpu_count"] >= 1
    assert info["ram_total_mb"] >= info["ram_free_mb"] >= 0


def test_oversized_body_is_413(client: TestClient) -> None:
    body = json.dumps({"scene": "scenes/proof.py:Proof", "params": {"a": "x" * 2_000_000}})
    headers = {**AUTH, "Content-Type": "application/json"}
    resp = client.post("/api/v1/projects/demo/renders", content=body, headers=headers)
    assert resp.status_code == 413
    assert_envelope(resp.json(), "payload_too_large")


def test_body_without_length_is_411(client: TestClient) -> None:
    chunks = iter([b'{"name": "Demo", ', b'"template": "blank"}'])
    resp = client.post("/api/v1/projects", content=chunks, headers=AUTH)
    assert resp.status_code == 411
    assert_envelope(resp.json(), "length_required")


def test_large_params_are_rejected(client: TestClient) -> None:
    pid = create_project(client)
    body = {"scene": "scenes/proof.py:Proof", "params": {"a": "x" * 100_000}}
    resp = client.post(f"/api/v1/projects/{pid}/renders", json=body, headers=AUTH)
    assert resp.status_code == 422
    assert_envelope(resp.json(), "validation_error")
