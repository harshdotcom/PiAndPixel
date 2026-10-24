"""Templates, project creation, listing, details, scenes and path safety."""

import re
from pathlib import Path

import pytest
from agent_helpers import AUTH, create_project
from fastapi.testclient import TestClient
from pnp_agent.projects import slugify
from pnp_agent.settings import Settings


def test_templates_list(client: TestClient) -> None:
    ids = [t["id"] for t in client.get("/api/v1/templates", headers=AUTH).json()]
    assert ids == ["pythagoras", "blank"]


def test_create_blank_project(client: TestClient, settings: Settings) -> None:
    body = {"name": "My First Video", "template": "blank", "description": "hello"}
    resp = client.post("/api/v1/projects", json=body, headers=AUTH)
    assert resp.status_code == 201
    assert resp.json() == {
        "id": "my-first-video",
        "name": "My First Video",
        "description": "hello",
        "error": None,
    }
    assert (settings.workspace / "my-first-video" / "scenes" / "main.py").is_file()
    scenes = client.get("/api/v1/projects/my-first-video/scenes", headers=AUTH).json()
    assert [s["ref"] for s in scenes["scenes"]] == ["scenes/main.py:Main"]


def test_create_from_pythagoras_template(client: TestClient) -> None:
    pid = create_project(client, name='Pi "quoted": name', template="pythagoras")
    assert pid == "pi-quoted-name"
    detail = client.get(f"/api/v1/projects/{pid}", headers=AUTH).json()
    assert detail["name"] == 'Pi "quoted": name'
    assert detail["description"] == "Visual proof"
    assert detail["formats"]["portrait"] == {"width": 1080, "height": 1920, "fps": 30}
    assert detail["compositions"]["main"] == {
        "title": "Main",
        "clips": [{"scene": "scenes/proof.py:Proof", "params": {}}],
    }


def test_list_projects_includes_invalid_manifest(client: TestClient, settings: Settings) -> None:
    create_project(client, name="Good")
    broken = settings.workspace / "broken"
    broken.mkdir()
    (broken / "pnp.yaml").write_text("pnp: 2\n")
    (settings.workspace / "not-a-project").mkdir()
    projects = client.get("/api/v1/projects", headers=AUTH).json()
    assert [p["id"] for p in projects] == ["broken", "good"]
    assert projects[0]["error"]
    assert projects[1]["error"] is None


@pytest.mark.parametrize(
    ("name", "slug"),
    [
        ("Hello World", "hello-world"),
        ("  --A__b!!c--  ", "a-b-c"),
        ("Ünïcode 2024", "unicode-2024"),
        ("Café Größe", "cafe-groe"),
        ("x" * 64, "x" * 48),
        ("!!!", ""),
    ],
)
def test_slug_rules(name: str, slug: str) -> None:
    assert slugify(name) == slug


def test_non_latin_name_gets_hash_id(client: TestClient) -> None:
    assert re.fullmatch(r"project-[0-9a-f]{8}", slugify("数学 动画"))
    body = {"name": "数学 动画", "template": "blank"}
    resp = client.post("/api/v1/projects", json=body, headers=AUTH)
    assert resp.status_code == 201, resp.text
    assert resp.json()["id"] == slugify("数学 动画")
    assert resp.json()["name"] == "数学 动画"


def test_empty_slug_is_422(client: TestClient) -> None:
    resp = client.post("/api/v1/projects", json={"name": "!!!", "template": "blank"}, headers=AUTH)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"


def test_name_too_long_is_422(client: TestClient) -> None:
    body = {"name": "x" * 65, "template": "blank"}
    assert client.post("/api/v1/projects", json=body, headers=AUTH).status_code == 422


def test_duplicate_project_is_409(client: TestClient) -> None:
    create_project(client, name="Same")
    resp = client.post("/api/v1/projects", json={"name": "same", "template": "blank"}, headers=AUTH)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "conflict"


def test_unknown_project_is_404(client: TestClient) -> None:
    resp = client.get("/api/v1/projects/missing", headers=AUTH)
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"


@pytest.mark.parametrize("pid", ["..", "%2e%2e", "%2E%2E", ".pnp", "..%2Fetc", "%2e%2e%2fetc"])
def test_path_traversal_in_pid_is_rejected(client: TestClient, pid: str) -> None:
    for suffix in ("", "/scenes"):
        resp = client.get(f"/api/v1/projects/{pid}{suffix}", headers=AUTH)
        assert resp.status_code in (400, 404), resp.text
        assert resp.json()["error"]["code"] in ("invalid_path", "not_found")


def test_encoded_dotdot_is_invalid_path(client: TestClient) -> None:
    resp = client.get("/api/v1/projects/%2e%2e/scenes", headers=AUTH)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_path"


def test_symlink_project_outside_workspace_rejected(
    client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "pnp.yaml").write_text("pnp: 1\nname: x\n")
    settings.workspace.mkdir(exist_ok=True)
    (settings.workspace / "link").symlink_to(outside)
    resp = client.get("/api/v1/projects/link", headers=AUTH)
    assert resp.status_code in (400, 404)


def test_scenes_listing_reports_errors(client: TestClient, settings: Settings) -> None:
    pid = create_project(client)
    (settings.workspace / pid / "scenes" / "broken.py").write_text("class Oops(:\n")
    body = client.get(f"/api/v1/projects/{pid}/scenes", headers=AUTH).json()
    assert body["scenes"] == [
        {
            "ref": "scenes/proof.py:Proof",
            "file": "scenes/proof.py",
            "class_name": "Proof",
            "line": 4,
        }
    ]
    assert body["errors"][0]["file"] == "scenes/broken.py"
    assert body["errors"][0]["line"] == 1
