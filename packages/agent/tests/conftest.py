"""Fixtures: an app on a temp workspace with fake render/probe functions (no manim)."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from agent_helpers import (
    FAKE_TOOLS,
    PROOF_PY,
    PYTHAGORAS_YAML,
    TOKEN,
    FakeComposer,
    FakeRunner,
    fake_prober,
)
from fastapi.testclient import TestClient
from pnp_agent.app import create_app
from pnp_agent.settings import Settings


@pytest.fixture(autouse=True)
def no_real_tool_detection(monkeypatch: pytest.MonkeyPatch) -> None:
    # Running `manim --version` takes seconds and lots of RAM; tests never need it.
    monkeypatch.setattr("pnp_agent.capabilities.detect_tools", lambda _tools: FAKE_TOOLS)


@pytest.fixture
def templates_dir(tmp_path: Path) -> Path:
    root = tmp_path / "templates" / "pythagoras"
    (root / "scenes").mkdir(parents=True)
    (root / "pnp.yaml").write_text(PYTHAGORAS_YAML)
    (root / "scenes" / "proof.py").write_text(PROOF_PY)
    return tmp_path / "templates"


@pytest.fixture
def settings(tmp_path: Path, templates_dir: Path) -> Settings:
    return Settings(
        workspace=tmp_path / "workspace", token=TOKEN, templates_dir=templates_dir, testing=True
    )


@pytest.fixture
def runner() -> FakeRunner:
    return FakeRunner()


@pytest.fixture
def composer() -> FakeComposer:
    return FakeComposer()


@pytest.fixture
def client(settings: Settings, runner: FakeRunner, composer: FakeComposer) -> Iterator[TestClient]:
    app = create_app(settings, runner=runner, prober=fake_prober, composer=composer)
    with TestClient(app) as test_client:
        yield test_client
