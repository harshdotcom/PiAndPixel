"""render_scene against a fake "manim" executable, so no real render is needed."""

import json
import sys
import textwrap
import threading
import time
from pathlib import Path

import pytest
from core_helpers import fake_ffmpeg, ffmpeg_calls
from pnp_core.formats import BUILTIN_FORMATS, Format, Quality
from pnp_core.render import (
    CancelToken,
    RenderLimits,
    RenderRequest,
    RenderResult,
    ToolPaths,
    render_scene,
)

PRELUDE = """\
import json, os, resource, signal, sys, time
from pathlib import Path
args = sys.argv[1:]
work = Path.cwd().parent
(work / "argv.json").write_text(json.dumps(args))
media = Path(args[args.index("--media_dir") + 1])
cls = args[2]

def write_video():
    out = media / "videos" / Path(args[1]).stem / "480p15" / (cls + ".mp4")
    partial = out.parent / "partial_movie_files" / cls / (cls + ".mp4")
    partial.parent.mkdir(parents=True)
    partial.write_bytes(b"partial")
    out.write_bytes(b"video")
"""

SCENE = "from manim import *\n\n\nclass Main(Scene):\n    pass\n"


def fake_manim(tmp_path: Path, body: str, ffmpeg_body: str | None = None) -> ToolPaths:
    script = tmp_path / "fake-manim"
    script.write_text(f"#!{sys.executable}\n{PRELUDE}\n{textwrap.dedent(body)}")
    script.chmod(0o755)
    ffmpeg = fake_ffmpeg(tmp_path) if ffmpeg_body is None else fake_ffmpeg(tmp_path, ffmpeg_body)
    return ToolPaths(manim=str(script), ffmpeg=ffmpeg)


@pytest.fixture
def project(tmp_path: Path) -> Path:
    root = tmp_path / "proj"
    for rel in ["scenes/main.py", ".pnp/jobs/x.py", ".git/HEAD", "media/old.mp4", "__pycache__/a"]:
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text(SCENE)
    return root


def run(
    project: Path, tools: ToolPaths, ref: str = "scenes/main.py:Main", **kw: object
) -> RenderResult:
    req = RenderRequest(
        project_root=project,
        scene_ref=ref,
        fmt=BUILTIN_FORMATS["landscape"],
        quality=Quality.DRAFT,
        params={"title": "Hi"},
    )
    return render_scene(req, project.parent / "work", tools=tools, **kw)  # type: ignore[arg-type]


def test_success_finds_output_and_streams_lines(tmp_path: Path, project: Path) -> None:
    tools = fake_manim(
        tmp_path,
        """
        print("Animation 0 : Partial movie file written", flush=True)
        write_video()
        print("File ready", flush=True)
    """,
    )
    lines: list[str] = []
    result = run(project, tools, on_line=lines.append)
    work = project.parent / "work"
    assert result.status == "completed", result.error
    assert result.output == work / "out.mp4"
    assert (work / "out.mp4").read_bytes() == b"video"
    assert (result.exit_code, result.error) == (0, None)
    assert lines == ["Animation 0 : Partial movie file written", "File ready"]
    assert result.log_path.read_text().splitlines() == lines
    [remux] = ffmpeg_calls(work)
    assert remux[remux.index("-i") + 1] == str(work / "media/videos/main/480p15/Main.mp4")
    assert remux[-3:] == ["-movflags", "+faststart", str(work / "out.mp4")]
    argv = json.loads((work / "argv.json").read_text())
    assert argv == [
        "render", "scenes/main.py", "Main", "--config_file", str(work / "manim.cfg"),
        "--resolution", "854,480", "--fps", "15",
        "--media_dir", str(work / "media"), "--format", "mp4", "--disable_caching",
        "--progress_bar", "none", "-v", "INFO",
    ]  # fmt: skip
    ctx = json.loads((work / "ctx.json").read_text())
    assert ctx["format"] == {"name": "landscape", "width": 854, "height": 480, "fps": 15}
    assert ctx["params"] == {"title": "Hi"}
    frame = (work / "manim.cfg").read_text().splitlines()
    assert frame[:2] == ["[CLI]", "frame_height = 8.0"]
    assert float(frame[2].split("=")[1]) == 8.0 * 854 / 480
    assert (work / "sdk" / "pnp" / "__init__.py").is_file()
    snapshot = sorted(p.name for p in (work / "src").iterdir())
    assert snapshot == ["scenes"]


def test_explicit_resolution_and_fps_win_over_quality(tmp_path: Path, project: Path) -> None:
    tools = fake_manim(tmp_path, "write_video()")
    req = RenderRequest(
        project, "scenes/main.py:Main", BUILTIN_FORMATS["portrait"], Quality.DRAFT,
        resolution="720p", fps=24,
    )  # fmt: skip
    work = tmp_path / "work-720"
    assert render_scene(req, work, tools=tools).status == "completed"
    argv = json.loads((work / "argv.json").read_text())
    assert argv[argv.index("--resolution") + 1 :][:3] == ["720,1280", "--fps", "24"]
    ctx = json.loads((work / "ctx.json").read_text())
    assert ctx["format"] == {"name": "portrait", "width": 720, "height": 1280, "fps": 24}


def test_too_large_resolution_fails_before_manim(tmp_path: Path, project: Path) -> None:
    wide = Format("wide", 2400, 1000)
    req = RenderRequest(project, "scenes/main.py:Main", wide, Quality.DRAFT, resolution="2160p")
    result = render_scene(req, tmp_path / "work-wide", tools=fake_manim(tmp_path, "write_video()"))
    assert result.status == "failed"
    assert "3840" in (result.error or "")
    assert not (tmp_path / "work-wide" / "argv.json").exists()


def test_nonzero_exit_extracts_exception_line(tmp_path: Path, project: Path) -> None:
    tools = fake_manim(
        tmp_path,
        """
        print("Traceback (most recent call last):")
        print("│ in construct │")
        print("NameError: name 'Sqaure' is not defined")
        print("")
        print("[10/24/26 12:00:00] INFO  cleanup done")
        sys.exit(1)
    """,
    )
    result = run(project, tools)
    assert result.status == "failed"
    assert result.exit_code == 1
    assert result.error == "NameError: name 'Sqaure' is not defined"


def test_nonzero_exit_without_exception_uses_last_line(tmp_path: Path, project: Path) -> None:
    tools = fake_manim(
        tmp_path, 'print("first")\nprint("something broke")\nprint("  ")\nsys.exit(3)'
    )
    result = run(project, tools)
    assert (result.status, result.exit_code, result.error) == ("failed", 3, "something broke")


def test_exit_zero_without_video_fails(tmp_path: Path, project: Path) -> None:
    result = run(project, fake_manim(tmp_path, "print('ok')"))
    assert result.status == "failed"
    assert result.error == "manim exited 0 but produced no video"


def test_faststart_failure_fails_the_render(tmp_path: Path, project: Path) -> None:
    tools = fake_manim(tmp_path, "write_video()", "print('Invalid data')\nsys.exit(1)")
    result = run(project, tools)
    assert (result.status, result.output, result.exit_code) == ("failed", None, 0)
    assert result.error == "faststart failed (ffmpeg exit 1): Invalid data"
    assert "[pnp] faststart failed" in result.log_path.read_text()


def test_cancel_during_faststart_is_cancelled(tmp_path: Path, project: Path) -> None:
    tools = fake_manim(tmp_path, "write_video()", "print('remuxing', flush=True)\ntime.sleep(60)")
    token = CancelToken()
    threading.Timer(1.0, token.cancel).start()
    result = run(project, tools, cancel=token)
    assert (result.status, result.error) == ("cancelled", "faststart was cancelled")


def test_timeout_kills_process(tmp_path: Path, project: Path) -> None:
    tools = fake_manim(tmp_path, "print('start', flush=True)\ntime.sleep(60)")
    started = time.monotonic()
    result = run(project, tools, limits=RenderLimits(timeout_s=0.5))
    assert result.status == "timed_out"
    assert time.monotonic() - started < 10
    assert "time limit" in (result.error or "")


def test_timeout_escalates_to_sigkill(tmp_path: Path, project: Path) -> None:
    tools = fake_manim(
        tmp_path,
        """
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        print("stubborn", flush=True)
        time.sleep(60)
    """,
    )
    started = time.monotonic()
    result = run(project, tools, limits=RenderLimits(timeout_s=0.3))
    assert result.status == "timed_out"
    assert result.exit_code == -9
    assert time.monotonic() - started < 15


def test_cancel_kills_process(tmp_path: Path, project: Path) -> None:
    tools = fake_manim(tmp_path, "print('Animation 0', flush=True)\ntime.sleep(60)")
    token = CancelToken()
    result = run(project, tools, cancel=token, on_line=lambda _line: token.cancel())
    assert token.cancelled
    assert result.status == "cancelled"
    assert "cancelled" in result.log_path.read_text()


def test_output_size_limit(tmp_path: Path, project: Path) -> None:
    tools = fake_manim(
        tmp_path,
        """
        media.mkdir(parents=True)
        (media / "big.bin").write_bytes(b"x" * 4096)
        time.sleep(60)
    """,
    )
    result = run(project, tools, limits=RenderLimits(max_output_bytes=1024))
    assert result.status == "failed"
    assert "size limit" in (result.error or "")


def test_env_is_allowlisted(tmp_path: Path, project: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PNP_TOKEN", "secret-token")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-secret")
    tools = fake_manim(tmp_path, "(work / 'env.json').write_text(json.dumps(dict(os.environ)))")
    run(project, tools)
    work = project.parent / "work"
    env = json.loads((work / "env.json").read_text())
    assert set(env) == {
        "PATH", "HOME", "LANG", "PNP_RENDER_CONTEXT", "PYTHONPATH",
        "PYTHONDONTWRITEBYTECODE", "NO_COLOR", "TERM", "COLUMNS",
    }  # fmt: skip
    assert env["HOME"] == str(work / "home")
    assert (work / "home").is_dir()
    assert env["PYTHONPATH"] == str(work / "sdk")
    assert env["PNP_RENDER_CONTEXT"] == str(work / "ctx.json")
    assert "secret" not in json.dumps(env)


def test_memory_limit_applied(tmp_path: Path, project: Path) -> None:
    tools = fake_manim(
        tmp_path,
        """
        soft, _hard = resource.getrlimit(resource.RLIMIT_AS)
        print("limit", soft, flush=True)
    """,
    )
    lines: list[str] = []
    run(project, tools, limits=RenderLimits(memory_bytes=1 << 30), on_line=lines.append)
    assert lines == [f"limit {1 << 30}"]


def test_memory_limit_is_reported_as_resource_limit(tmp_path: Path, project: Path) -> None:
    tools = fake_manim(tmp_path, "bytearray(2 << 30)")
    result = run(project, tools, limits=RenderLimits(memory_bytes=512 << 20))
    assert result.status == "failed"
    expected = "resource_limit: the render hit the memory or process limit (MemoryError)"
    assert result.error == expected


def test_default_limits_cap_memory_and_processes() -> None:
    limits = RenderLimits()
    assert limits.memory_bytes is not None and limits.memory_bytes >= 4 << 30
    assert limits.extra_processes == 512


@pytest.mark.parametrize(
    ("ref", "message"),
    [
        ("scenes/missing.py:Main", "does not exist"),
        ("scenes/main.py:Other", "no scene class Other"),
        (".pnp/jobs/x.py:Main", "does not exist"),
        ("bad-ref", "scene ref"),
    ],
)
def test_bad_scene_fails_without_starting_process(
    tmp_path: Path, project: Path, ref: str, message: str
) -> None:
    tools = fake_manim(tmp_path, "")
    result = run(project, tools, ref=ref)
    assert result.status == "failed"
    assert message in (result.error or "")
    assert result.exit_code is None
    assert not (project.parent / "work" / "argv.json").exists()


def test_missing_manim_binary(tmp_path: Path, project: Path) -> None:
    result = run(project, ToolPaths(manim=str(tmp_path / "no-manim")))
    assert result.status == "failed"
    assert result.exit_code is None
