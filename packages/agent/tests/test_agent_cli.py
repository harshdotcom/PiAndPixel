"""CLI argument parsing and `pnp render` with a monkeypatched renderer and prober."""

import os
from pathlib import Path

import pytest
import uvicorn
from agent_helpers import PROOF_PY, PYTHAGORAS_YAML, FakeRunner, fake_prober
from fastapi import FastAPI
from pnp_agent import cli


@pytest.fixture
def project(tmp_path: Path) -> Path:
    root = tmp_path / "proj"
    (root / "scenes").mkdir(parents=True)
    (root / "pnp.yaml").write_text(PYTHAGORAS_YAML)
    (root / "scenes" / "proof.py").write_text(PROOF_PY)
    return root


@pytest.fixture
def fake_render(monkeypatch: pytest.MonkeyPatch) -> FakeRunner:
    runner = FakeRunner()
    monkeypatch.setattr(cli, "render_scene", runner)
    monkeypatch.setattr(cli, "probe", lambda path, ffprobe="ffprobe": fake_prober(path))
    return runner


def test_parse_render_defaults() -> None:
    args = cli.build_parser().parse_args(["render", "proj", "--scene", "a.py:A"])
    assert (args.project, args.scene, args.format, args.quality, args.out) == (
        "proj",
        "a.py:A",
        "landscape",
        None,
        None,
    )
    assert (args.resolution, args.fps) == (None, None)
    assert args.func is cli.cmd_render


def test_parse_studio_defaults() -> None:
    args = cli.build_parser().parse_args(["studio", "--no-browser", "--port", "9000"])
    assert (args.workspace, args.host, args.port, args.no_browser) == (
        "./workspace",
        "127.0.0.1",
        9000,
        True,
    )


def test_parse_rejects_bad_quality() -> None:
    with pytest.raises(SystemExit) as exc:
        cli.build_parser().parse_args(["render", "p", "--scene", "a.py:A", "--quality", "ultra"])
    assert exc.value.code == 2


def test_render_writes_output(
    project: Path,
    tmp_path: Path,
    fake_render: FakeRunner,
    capsys: pytest.CaptureFixture[str],
) -> None:
    out = tmp_path / "out" / "clip.mp4"
    code = cli.main(["render", str(project), "--scene", "scenes/proof.py:Proof", "--out", str(out)])
    assert code == 0
    assert out.read_bytes()
    captured = capsys.readouterr()
    assert captured.out.strip() == str(out)
    assert "Partial movie file written" in captured.err
    assert fake_render.requests[0].quality.value == "draft"


def test_render_default_output_name(
    project: Path, tmp_path: Path, fake_render: FakeRunner, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tmp_path)
    assert cli.main(["render", str(project), "--scene", "scenes/proof.py:Proof"]) == 0
    assert (tmp_path / "Proof-landscape-480p-15fps.mp4").is_file()


def test_render_resolution_and_fps_win_over_quality(
    project: Path, tmp_path: Path, fake_render: FakeRunner
) -> None:
    out = tmp_path / "x.mp4"
    args = ["render", str(project), "--scene", "scenes/proof.py:Proof", "--out", str(out)]
    # The fake prober reports 854x480 @ 15, so only the request is checked here.
    cli.main([*args, "--quality", "final", "--resolution", "720p", "--fps", "24"])
    req = fake_render.requests[0]
    assert (req.quality.value, req.resolution, req.fps) == ("final", "720p", 24)


def test_parse_rejects_bad_resolution_and_fps() -> None:
    for extra in (["--resolution", "4k"], ["--fps", "25"]):
        with pytest.raises(SystemExit):
            cli.build_parser().parse_args(["render", "p", "--scene", "a.py:A", *extra])


@pytest.mark.parametrize(
    "extra",
    [
        ["--scene", "scenes/proof.py:Missing"],
        ["--scene", "../evil.py:Proof"],
        ["--scene", "scenes/proof.py:Proof", "--format", "cinema"],
    ],
)
def test_render_bad_input_exits_2(project: Path, fake_render: FakeRunner, extra: list[str]) -> None:
    assert cli.main(["render", str(project), *extra]) == 2
    assert fake_render.requests == []


def test_render_missing_project_exits_2(tmp_path: Path, fake_render: FakeRunner) -> None:
    assert cli.main(["render", str(tmp_path / "nope"), "--scene", "a.py:A"]) == 2


def test_render_failure_exits_1(
    project: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(cli, "render_scene", FakeRunner(fail_with="NameError: boom"))
    out = tmp_path / "x.mp4"
    args = ["render", str(project), "--scene", "scenes/proof.py:Proof", "--out", str(out)]
    assert cli.main(args) == 1
    assert not out.exists()


def test_render_validation_failure_exits_1(
    project: Path, tmp_path: Path, fake_render: FakeRunner
) -> None:
    out = tmp_path / "x.mp4"
    args = ["render", str(project), "--scene", "scenes/proof.py:Proof", "--format", "portrait"]
    assert cli.main([*args, "--out", str(out)]) == 1
    assert not out.exists()


def test_doctor_exit_code(monkeypatch: pytest.MonkeyPatch) -> None:
    assert cli.main(["doctor"]) == 0
    missing = {"available": False, "version": None, "path": None}
    monkeypatch.setattr(
        cli,
        "detect_tools",
        lambda _tools: {n: missing for n in ("manim", "ffmpeg", "ffprobe", "latex")},
    )
    assert cli.main(["doctor"]) == 1


def test_studio_keeps_generated_token_out_of_environ(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # Renders run as the same user and can read the Agent's /proc/<pid>/environ.
    monkeypatch.delenv("PNP_TOKEN", raising=False)
    served: list[object] = []
    monkeypatch.setattr(uvicorn, "run", lambda app, **_kw: served.append(app))
    assert cli.main(["studio", str(tmp_path / "ws"), "--no-browser"]) == 0
    token = capsys.readouterr().out.split("#token=")[1].strip()
    assert served and len(token) >= 24
    assert "PNP_TOKEN" not in os.environ
    assert not any(token in value for value in os.environ.values())


def test_studio_no_terminal_turns_the_terminal_off(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    served: list[FastAPI] = []
    monkeypatch.setattr(uvicorn, "run", lambda app, **_kw: served.append(app))
    assert cli.main(["studio", str(tmp_path / "ws"), "--no-browser", "--no-terminal"]) == 0
    assert served[0].state.settings.terminal_available is False
    assert cli.build_parser().parse_args(["studio"]).no_terminal is False
