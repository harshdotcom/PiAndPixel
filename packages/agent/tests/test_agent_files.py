"""File API: tree, read, create, save with etags, rename, delete and path safety."""

import hashlib
from pathlib import Path
from urllib.parse import unquote

import pytest
from agent_helpers import AUTH, PROOF_PY, create_project
from fastapi.testclient import TestClient
from httpx import Response
from pnp_agent.settings import Settings

FILES = "/api/v1/projects/demo/files"

# URL-encoded where a client would otherwise normalise the path before sending it.
TRAVERSAL = [
    "..%2Fsecret.txt",
    "%2e%2e/secret.txt",
    "scenes%2F..%2F..%2Fsecret.txt",
    "%2Fetc%2Fpasswd",
    "scenes%5C..%5Cx.py",
    "a%00b.py",
    "C:%2Fwindows.py",
    ".pnp/state.txt",
    ".git/config",
    "scenes/.pnp/x.py",
    "outside/secret.txt",  # a symlink to a folder outside the project
    "pp/state.txt",  # a symlink to .pnp inside the project
]


@pytest.fixture
def root(client: TestClient, settings: Settings) -> Path:
    assert create_project(client, name="Demo") == "demo"
    root = settings.workspace / "demo"
    outside = settings.workspace.parent / "outside"
    outside.mkdir()
    (outside / "secret.txt").write_text("secret")
    (settings.workspace / "secret.txt").write_text("secret")
    (root / "outside").symlink_to(outside)
    (root / "pp").symlink_to(".pnp")
    (root / ".pnp").mkdir(exist_ok=True)
    (root / ".pnp" / "state.txt").write_text("agent state")
    return root


def _etag(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _code(resp: Response) -> str:
    return resp.json()["error"]["code"]


@pytest.mark.parametrize("path", TRAVERSAL)
def test_traversal_refused_on_every_route(client: TestClient, root: Path, path: str) -> None:
    match = {**AUTH, "If-Match": '"x"'}
    raw = unquote(path)
    responses = [
        client.get(f"{FILES}/{path}", headers=AUTH),
        client.put(f"{FILES}/{path}", json={"content": "x"}, headers=match),
        client.delete(f"{FILES}/{path}", headers=match),
        client.post(FILES, json={"path": raw, "content": "x"}, headers=AUTH),
        client.post(f"{FILES}/rename", json={"from": raw, "to": "a.py"}, headers=AUTH),
        client.post(f"{FILES}/rename", json={"from": "scenes/proof.py", "to": raw}, headers=AUTH),
    ]
    for resp in responses:
        assert (resp.status_code, _code(resp)) == (400, "invalid_path"), resp.request.url
    assert (root.parent / "secret.txt").read_text() == "secret"
    assert (root.parent.parent / "outside" / "secret.txt").read_text() == "secret"
    assert (root / ".pnp" / "state.txt").read_text() == "agent state"
    assert (root / "scenes" / "proof.py").read_text() == PROOF_PY


def test_tree_hides_state_and_symlinks(client: TestClient, root: Path) -> None:
    (root / "__pycache__").mkdir()
    entries = client.get(FILES, headers=AUTH).json()["entries"]
    assert entries == [
        {"path": "pnp.yaml", "type": "file", "size": (root / "pnp.yaml").stat().st_size},
        {"path": "scenes", "type": "dir", "size": None},
        {"path": "scenes/proof.py", "type": "file", "size": len(PROOF_PY)},
    ]


def test_unknown_project_is_404(client: TestClient, root: Path) -> None:
    resp = client.get("/api/v1/projects/nope/files", headers=AUTH)
    assert (resp.status_code, _code(resp)) == (404, "not_found")


def test_read_returns_content_and_etag(client: TestClient, root: Path) -> None:
    resp = client.get(f"{FILES}/scenes/proof.py", headers=AUTH)
    etag = _etag(PROOF_PY.encode())
    assert resp.json() == {"path": "scenes/proof.py", "content": PROOF_PY, "etag": etag}
    assert resp.headers["etag"] == f'"{etag}"'
    missing = client.get(f"{FILES}/scenes/none.py", headers=AUTH)
    assert (missing.status_code, _code(missing)) == (404, "not_found")


@pytest.mark.parametrize(
    ("data", "status", "code"),
    [(b"\x00\x01binary", 415, "unsupported_file"), (b"\xff\xfe latin", 415, "unsupported_file"),
     (b"x" * 1_000_001, 413, "payload_too_large")],
)  # fmt: skip
def test_read_rejects_binary_and_oversize(
    client: TestClient, root: Path, data: bytes, status: int, code: str
) -> None:
    (root / "blob.bin").write_bytes(data)
    resp = client.get(f"{FILES}/blob.bin", headers=AUTH)
    assert (resp.status_code, _code(resp)) == (status, code)


def test_create_file(client: TestClient, root: Path) -> None:
    body = {"path": "scenes/new/extra.py", "content": "x = 1\n"}
    resp = client.post(FILES, json=body, headers=AUTH)
    assert resp.status_code == 201
    assert resp.json() == {"path": "scenes/new/extra.py", "etag": _etag(b"x = 1\n")}
    assert (root / "scenes" / "new" / "extra.py").read_text() == "x = 1\n"
    again = client.post(FILES, json=body, headers=AUTH)
    assert (again.status_code, _code(again)) == (409, "already_exists")
    extra = client.post(FILES, json={**body, "mode": "x"}, headers=AUTH)
    assert (extra.status_code, _code(extra)) == (422, "validation_error")


def test_save_with_etag(client: TestClient, root: Path) -> None:
    etag = client.get(f"{FILES}/scenes/proof.py", headers=AUTH).json()["etag"]
    resp = client.put(
        f"{FILES}/scenes/proof.py",
        json={"content": "v2\n"},
        headers={**AUTH, "If-Match": f'"{etag}"'},
    )
    assert resp.status_code == 200
    assert resp.json() == {"path": "scenes/proof.py", "etag": _etag(b"v2\n")}
    assert resp.headers["etag"] == f'"{_etag(b"v2\n")}"'
    assert (root / "scenes" / "proof.py").read_text() == "v2\n"


def test_stale_etag_is_412_and_keeps_file(client: TestClient, root: Path) -> None:
    stale = client.get(f"{FILES}/scenes/proof.py", headers=AUTH).json()["etag"]
    (root / "scenes" / "proof.py").write_text("changed on disk\n")
    headers = {**AUTH, "If-Match": stale}
    resp = client.put(f"{FILES}/scenes/proof.py", json={"content": "mine"}, headers=headers)
    assert (resp.status_code, _code(resp)) == (412, "conflict")
    assert (root / "scenes" / "proof.py").read_text() == "changed on disk\n"
    deleted = client.delete(f"{FILES}/scenes/proof.py", headers=headers)
    assert (deleted.status_code, _code(deleted)) == (412, "conflict")
    assert (root / "scenes" / "proof.py").exists()


def test_if_match_is_required(client: TestClient, root: Path) -> None:
    put = client.put(f"{FILES}/scenes/proof.py", json={"content": "x"}, headers=AUTH)
    delete = client.delete(f"{FILES}/scenes/proof.py", headers=AUTH)
    for resp in (put, delete):
        assert (resp.status_code, _code(resp)) == (428, "precondition_required")
    assert (root / "scenes" / "proof.py").read_text() == PROOF_PY


def test_save_missing_file_is_404(client: TestClient, root: Path) -> None:
    headers = {**AUTH, "If-Match": "abc"}
    resp = client.put(f"{FILES}/scenes/none.py", json={"content": "x"}, headers=headers)
    assert (resp.status_code, _code(resp)) == (404, "not_found")
    assert not (root / "scenes" / "none.py").exists()


def test_oversize_save_is_413(client: TestClient, root: Path) -> None:
    headers = {**AUTH, "If-Match": _etag(PROOF_PY.encode())}
    resp = client.put(
        f"{FILES}/scenes/proof.py", json={"content": "x" * 1_000_001}, headers=headers
    )
    assert (resp.status_code, _code(resp)) == (413, "payload_too_large")
    assert (root / "scenes" / "proof.py").read_text() == PROOF_PY


def test_manifest_save_is_validated(client: TestClient, root: Path) -> None:
    original = (root / "pnp.yaml").read_bytes()
    headers = {**AUTH, "If-Match": _etag(original)}
    bad = client.put(f"{FILES}/pnp.yaml", json={"content": "pnp: 2\n"}, headers=headers)
    assert (bad.status_code, _code(bad)) == (422, "validation_error")
    assert (root / "pnp.yaml").read_bytes() == original
    good = client.put(f"{FILES}/pnp.yaml", json={"content": "pnp: 1\nname: New\n"}, headers=headers)
    assert good.status_code == 200
    assert client.get("/api/v1/projects/demo", headers=AUTH).json()["name"] == "New"


def test_rename(client: TestClient, root: Path) -> None:
    body = {"from": "scenes/proof.py", "to": "scenes/sub/moved.py"}
    resp = client.post(f"{FILES}/rename", json=body, headers=AUTH)
    assert resp.status_code == 200
    assert resp.json() == {"path": "scenes/sub/moved.py", "etag": _etag(PROOF_PY.encode())}
    assert not (root / "scenes" / "proof.py").exists()
    assert (root / "scenes" / "sub" / "moved.py").read_text() == PROOF_PY


@pytest.mark.parametrize(
    ("src", "dest", "status", "code"),
    [("scenes/none.py", "a.py", 404, "not_found"),
     ("scenes/proof.py", "pnp.yaml", 422, "validation_error"),
     ("pnp.yaml", "other.yaml", 422, "validation_error")],
)  # fmt: skip
def test_rename_errors(
    client: TestClient, root: Path, src: str, dest: str, status: int, code: str
) -> None:
    resp = client.post(f"{FILES}/rename", json={"from": src, "to": dest}, headers=AUTH)
    assert (resp.status_code, _code(resp)) == (status, code)
    assert (root / "pnp.yaml").is_file()


def test_rename_onto_existing_file_is_409(client: TestClient, root: Path) -> None:
    (root / "scenes" / "other.py").write_text("other")
    body = {"from": "scenes/proof.py", "to": "scenes/other.py"}
    resp = client.post(f"{FILES}/rename", json=body, headers=AUTH)
    assert (resp.status_code, _code(resp)) == (409, "already_exists")
    assert (root / "scenes" / "other.py").read_text() == "other"


@pytest.mark.parametrize(
    ("url", "body"),
    [(FILES, {"path": "scenes/proof.py/x", "content": ""}),
     (f"{FILES}/rename", {"from": "scenes/proof.py", "to": "scenes/proof.py/x"})],
)  # fmt: skip
def test_write_under_a_file_is_400(
    client: TestClient, root: Path, url: str, body: dict[str, str]
) -> None:
    resp = client.post(url, json=body, headers=AUTH)
    assert (resp.status_code, _code(resp)) == (400, "invalid_path")
    assert (root / "scenes" / "proof.py").read_text() == PROOF_PY


def test_delete(client: TestClient, root: Path) -> None:
    headers = {**AUTH, "If-Match": f'"{_etag(PROOF_PY.encode())}"'}
    resp = client.delete(f"{FILES}/scenes/proof.py", headers=headers)
    assert resp.status_code == 204
    assert not (root / "scenes" / "proof.py").exists()
    again = client.delete(f"{FILES}/scenes/proof.py", headers=headers)
    assert (again.status_code, _code(again)) == (404, "not_found")


def test_manifest_cannot_be_deleted(client: TestClient, root: Path) -> None:
    headers = {**AUTH, "If-Match": _etag((root / "pnp.yaml").read_bytes())}
    resp = client.delete(f"{FILES}/pnp.yaml", headers=headers)
    assert (resp.status_code, _code(resp)) == (422, "validation_error")
    assert (root / "pnp.yaml").is_file()


def test_symlink_is_refused_for_delete_and_its_target_kept(client: TestClient, root: Path) -> None:
    (root / "lnk").symlink_to("scenes/proof.py")
    headers = {**AUTH, "If-Match": f'"{_etag(PROOF_PY.encode())}"'}
    resp = client.delete(f"{FILES}/lnk", headers=headers)
    assert (resp.status_code, _code(resp)) == (400, "invalid_path")
    assert (root / "scenes" / "proof.py").read_text() == PROOF_PY


def test_nul_content_and_media_writes_are_refused(client: TestClient, root: Path) -> None:
    nul = client.post(FILES, json={"path": "a.py", "content": "a\x00b"}, headers=AUTH)
    assert (nul.status_code, _code(nul)) == (415, "unsupported_file")
    media = client.post(FILES, json={"path": "media/a.py", "content": ""}, headers=AUTH)
    assert (media.status_code, _code(media)) == (400, "invalid_path")
    assert not (root / "a.py").exists() and not (root / "media" / "a.py").exists()


def test_file_system_refusal_is_storage_error_not_500(client: TestClient, root: Path) -> None:
    (root / "locked").mkdir()
    (root / "locked").chmod(0o555)
    try:
        resp = client.post(FILES, json={"path": "locked/x.py", "content": ""}, headers=AUTH)
    finally:
        (root / "locked").chmod(0o755)
    assert (resp.status_code, _code(resp)) == (409, "storage_error")
