"""remux_faststart against a fake ffmpeg, plus one real remux (-m render)."""

import json
from pathlib import Path

import pytest
from core_helpers import COPY_INPUT, fake_ffmpeg, ffmpeg_calls, make_testsrc
from pnp_core.errors import PnpError
from pnp_core.faststart import remux_faststart
from pnp_core.process import CancelToken, RenderLimits


@pytest.fixture
def work(tmp_path: Path) -> Path:
    work = tmp_path / "work"
    work.mkdir()
    (work / "in.mp4").write_bytes(b"video")
    return work


def remux(
    work: Path, ffmpeg: str, limits: RenderLimits | None = None, cancel: CancelToken | None = None
) -> None:
    remux_faststart(
        work / "in.mp4", work / "out.mp4", ffmpeg=ffmpeg, limits=limits or RenderLimits(),
        log_path=work / "render.log", cancel=cancel,
    )  # fmt: skip


def test_remux_copies_with_faststart(tmp_path: Path, work: Path) -> None:
    remux(work, fake_ffmpeg(tmp_path, f"print('remuxed')\n{COPY_INPUT}"))
    assert (work / "out.mp4").read_bytes() == b"video"
    assert ffmpeg_calls(work) == [
        ["-hide_banner", "-nostdin", "-y", "-i", str(work / "in.mp4"), "-map", "0",
         "-c", "copy", "-movflags", "+faststart", str(work / "out.mp4")],
    ]  # fmt: skip
    assert (work / "render.log").read_text() == "remuxed\n"


def test_remux_env_is_allowlisted(
    tmp_path: Path, work: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("PNP_TOKEN", "secret-token")
    remux(work, fake_ffmpeg(tmp_path))
    env = json.loads((work / "ffmpeg-env.json").read_text())
    assert set(env) == {"PATH", "HOME", "LANG"}
    assert env["HOME"] == str(work / "home")


def test_remux_failure_names_last_line_and_removes_output(tmp_path: Path, work: Path) -> None:
    body = "out.write_bytes(b'half')\nprint('moov atom not found')\nprint('')\nsys.exit(1)"
    with pytest.raises(PnpError, match=r"exit 1\): moov atom not found"):
        remux(work, fake_ffmpeg(tmp_path, body))
    assert not (work / "out.mp4").exists()


def test_remux_timeout(tmp_path: Path, work: Path) -> None:
    with pytest.raises(PnpError, match="time limit"):
        remux(work, fake_ffmpeg(tmp_path, "time.sleep(60)"), limits=RenderLimits(timeout_s=0.3))


def test_remux_cancel(tmp_path: Path, work: Path) -> None:
    token = CancelToken()
    token.cancel()
    with pytest.raises(PnpError, match="cancelled"):
        remux(work, fake_ffmpeg(tmp_path, "time.sleep(60)"), cancel=token)


def test_remux_missing_ffmpeg(tmp_path: Path, work: Path) -> None:
    with pytest.raises(PnpError, match="could not run ffmpeg"):
        remux(work, str(tmp_path / "no-ffmpeg"))


@pytest.mark.render
def test_real_remux_moves_index_to_front(tmp_path: Path) -> None:
    src = make_testsrc(tmp_path / "in.mp4")
    data = src.read_bytes()
    assert data.index(b"moov") > data.index(b"mdat")  # ffmpeg's default layout
    out = tmp_path / "out.mp4"
    remux_faststart(
        src, out, ffmpeg="ffmpeg", limits=RenderLimits(), log_path=tmp_path / "render.log"
    )
    data = out.read_bytes()
    assert data.index(b"moov") < data.index(b"mdat")
