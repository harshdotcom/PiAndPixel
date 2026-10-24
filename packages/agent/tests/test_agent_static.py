"""Studio static files with SPA fallback, and settings from the environment."""

from pathlib import Path

import pytest
from agent_helpers import TOKEN
from fastapi.testclient import TestClient
from pnp_agent.app import create_app
from pnp_agent.settings import REPO_ROOT, Settings, settings_from_env


def test_studio_served_with_spa_fallback(settings: Settings, tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>studio</html>")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    settings.studio_dist = dist
    client = TestClient(create_app(settings))
    assert client.get("/").text == "<html>studio</html>"
    assert client.get("/assets/app.js").text == "console.log(1)"
    assert client.get("/some/client/route").text == "<html>studio</html>"
    assert client.get("/api/v1/agent/health").json() == {"ok": True}
    assert client.get("/api/unknown").status_code == 404


def test_settings_from_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("PNP_MANIM_BIN", "/opt/manim")
    monkeypatch.setenv("PNP_FFPROBE_BIN", "/opt/ffprobe")
    monkeypatch.setenv("PNP_TOKEN", TOKEN)
    monkeypatch.setenv("PNP_TEMPLATES_DIR", str(tmp_path))
    settings = settings_from_env(tmp_path, port=9999)
    assert settings.tools.manim == "/opt/manim"
    assert settings.tools.ffmpeg == "ffmpeg"
    assert settings.tools.ffprobe == "/opt/ffprobe"
    assert settings.token == TOKEN
    assert settings.templates_dir == tmp_path
    assert settings.port == 9999


def test_settings_defaults(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    for name in ("PNP_TOKEN", "PNP_TEMPLATES_DIR", "PNP_MANIM_BIN"):
        monkeypatch.delenv(name, raising=False)
    settings = settings_from_env(tmp_path)
    assert len(settings.token) >= 24
    assert settings.templates_dir == REPO_ROOT / "examples"
    assert (REPO_ROOT / "AGENTS.md").is_file()
