"""Test helpers shared by the agent tests: fakes for render/probe and small API shortcuts."""

import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from pnp_agent.settings import Settings
from pnp_core.compose import ComposeRequest, ComposeResult
from pnp_core.formats import BUILTIN_FORMATS, Quality, render_geometry
from pnp_core.probe import MediaInfo
from pnp_core.render import CancelToken, RenderLimits, RenderRequest, RenderResult, ToolPaths

TOKEN = "test-token-123"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
VIDEO_BYTES = bytes(range(256)) * 4
DEFAULT_TOOLS = ToolPaths()
DEFAULT_LIMITS = RenderLimits()

PYTHAGORAS_YAML = """\
pnp: 1
name: Pythagoras explainer
description: "Visual proof"
engine: { name: manim }
compositions:
  main: { title: "Main", clips: [ {scene: "scenes/proof.py:Proof"} ] }
"""

PROOF_PY = """\
from manim import Scene


class Proof(Scene):
    def construct(self):
        pass
"""


class FakeRunner:
    """Stands in for pnp_core.render.render_scene: writes a log and a small 'video'."""

    def __init__(self, fail_with: str | None = None) -> None:
        self.fail_with = fail_with
        self.requests: list[RenderRequest] = []

    def __call__(
        self,
        req: RenderRequest,
        workdir: Path,
        *,
        tools: ToolPaths = DEFAULT_TOOLS,
        limits: RenderLimits = DEFAULT_LIMITS,
        on_line: Callable[[str], None] | None = None,
        cancel: CancelToken | None = None,
    ) -> RenderResult:
        self.requests.append(req)
        workdir.mkdir(parents=True, exist_ok=True)
        lines = ["Rendering...", "Animation 0 : Partial movie file written in x.mp4"]
        if self.fail_with:
            lines.append(self.fail_with)
        log = workdir / "render.log"
        log.write_text("\n".join(lines) + "\n")
        for line in lines:
            if on_line:
                on_line(line)
        if self.fail_with:
            return RenderResult("failed", None, 1, log, self.fail_with, 0.1)
        output = workdir / "media" / "videos" / "Proof.mp4"
        output.parent.mkdir(parents=True)
        output.write_bytes(VIDEO_BYTES)
        return RenderResult("completed", output, 0, log, None, 0.1)


class GatedRunner(FakeRunner):
    """Holds every render until `gate` is set (or the job is cancelled), to queue jobs behind it."""

    def __init__(self, fail_with: str | None = None) -> None:
        super().__init__(fail_with)
        self.gate = threading.Event()
        self.started = threading.Event()

    def __call__(
        self,
        req: RenderRequest,
        workdir: Path,
        *,
        tools: ToolPaths = DEFAULT_TOOLS,
        limits: RenderLimits = DEFAULT_LIMITS,
        on_line: Callable[[str], None] | None = None,
        cancel: CancelToken | None = None,
    ) -> RenderResult:
        self.started.set()
        while not self.gate.wait(0.01):
            if cancel is not None and cancel.cancelled:
                log = workdir / "render.log"
                return RenderResult("cancelled", None, -15, log, "render was cancelled", 0.0)
        return super().__call__(req, workdir, on_line=on_line, cancel=cancel)


class FakeComposer:
    """Stands in for pnp_core.compose.compose_export: reports progress, writes 'export.mp4'."""

    def __init__(self, fail: tuple[str, str] | None = None) -> None:
        self.fail = fail  # (error_code, error)
        self.requests: list[ComposeRequest] = []

    def __call__(
        self,
        req: ComposeRequest,
        workdir: Path,
        *,
        tools: ToolPaths = DEFAULT_TOOLS,
        limits: RenderLimits = DEFAULT_LIMITS,
        on_line: Callable[[str], None] | None = None,
        on_progress: Callable[[float], None] | None = None,
        cancel: CancelToken | None = None,
    ) -> ComposeResult:
        self.requests.append(req)
        log = workdir / "composite.log"
        log.write_text("concat\n")
        if on_line:
            on_line("concat")
        for pct in (0.5, 40.0, 40.5, 100.0):
            if on_progress:
                on_progress(pct)
        if self.fail:
            return ComposeResult("failed", None, None, log, self.fail[1], self.fail[0], 0.1)
        output = workdir / "export.mp4"
        output.write_bytes(VIDEO_BYTES)
        return ComposeResult("completed", output, 0, log, None, None, 0.1)


def fake_prober(_: Path) -> MediaInfo:
    """Reports exactly the geometry of a landscape draft render."""
    w, h, fps = render_geometry(BUILTIN_FORMATS["landscape"], Quality.DRAFT)
    return MediaInfo(w, h, float(fps), 4.0, "h264", "yuv420p", False)


FAKE_TOOLS = {
    name: {"available": True, "version": f"{name} 1.0", "path": f"/usr/bin/{name}"}
    for name in ("manim", "ffmpeg", "ffprobe", "latex")
}


def create_project(client: TestClient, name: str = "Demo", template: str = "pythagoras") -> str:
    resp = client.post("/api/v1/projects", json={"name": name, "template": template}, headers=AUTH)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def wait_for_job(client: TestClient, job_id: str, timeout_s: float = 10.0) -> dict[str, Any]:
    return wait_until(client, f"/api/v1/jobs/{job_id}", timeout_s)


def wait_until(
    client: TestClient,
    url: str,
    timeout_s: float = 10.0,
    done: Callable[[dict[str, Any]], bool] = lambda d: d["status"] not in ("queued", "running"),
) -> dict[str, Any]:
    """Poll a job or export URL until `done` (default: no longer queued or running)."""
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        data = client.get(url, headers=AUTH).json()
        if done(data):
            return data
        time.sleep(0.02)
    raise AssertionError(f"{url} did not finish")


def start_render(client: TestClient, pid: str, **body: object) -> str:
    body = {"scene": "scenes/proof.py:Proof", **body}
    resp = client.post(f"/api/v1/projects/{pid}/renders", json=body, headers=AUTH)
    assert resp.status_code == 202, resp.text
    return resp.json()["job_id"]


AB_SCENES_PY = """\
from manim import Scene


class A(Scene):
    def construct(self):
        pass


class B(Scene):
    def construct(self):
        pass
"""

EXPORT_MANIFEST = """\
pnp: 1
name: Demo
compositions:
  main:
    clips:
      - {scene: "scenes/ab.py:A"}
      - {scene: "scenes/ab.py:B"}
      - {scene: "scenes/ab.py:A"}
      - {scene: "scenes/ab.py:A", params: {x: 1}}
  broken:
    clips: [{scene: "scenes/ab.py:Missing"}]
"""


def export_project(client: TestClient, settings: Settings) -> str:
    pid = create_project(client)
    root = settings.workspace / pid
    (root / "scenes" / "ab.py").write_text(AB_SCENES_PY)
    (root / "pnp.yaml").write_text(EXPORT_MANIFEST)
    return pid


def start_export(
    client: TestClient, pid: str, key: str | None = None, **body: Any
) -> dict[str, Any]:
    headers = {**AUTH, "Idempotency-Key": key} if key else AUTH
    payload = {"composition": "main", "quality": "draft", **body}
    resp = client.post(f"/api/v1/projects/{pid}/exports", json=payload, headers=headers)
    assert resp.status_code == 202, resp.text
    return resp.json()
