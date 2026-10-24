import json
import sys
from pathlib import Path

import pytest
from pnp_core.errors import ProbeError
from pnp_core.probe import MediaInfo, check_clip, probe

GOOD = MediaInfo(480, 270, 15.0, 5.0, "h264", "yuv420p", False)


def fake_ffprobe(tmp_path: Path, payload: object, exit_code: int = 0) -> str:
    script = tmp_path / "ffprobe"
    script.write_text(
        f"#!{sys.executable}\nimport sys\n"
        f"sys.stdout.write({json.dumps(payload)!r})\n"
        f"sys.stderr.write('bad file\\n')\nsys.exit({exit_code})\n"
    )
    script.chmod(0o755)
    return str(script)


def test_probe_parses_streams(tmp_path: Path) -> None:
    payload = {
        "streams": [
            {"codec_type": "video", "codec_name": "h264", "width": 480, "height": 270,
             "r_frame_rate": "30000/1001", "pix_fmt": "yuv420p", "duration": "4.5"},
            {"codec_type": "audio", "codec_name": "aac"},
        ],
        "format": {"duration": "4.6"},
    }  # fmt: skip
    info = probe(tmp_path / "x.mp4", ffprobe=fake_ffprobe(tmp_path, payload))
    assert info == MediaInfo(480, 270, 30000 / 1001, 4.5, "h264", "yuv420p", True)


def test_probe_counts_video_streams(tmp_path: Path) -> None:
    video = {"codec_type": "video", "width": 2, "height": 2, "r_frame_rate": "15/1"}
    payload = {"streams": [video, {"codec_type": "audio"}, video], "format": {"duration": "1"}}
    info = probe(tmp_path / "x.mp4", ffprobe=fake_ffprobe(tmp_path, payload))
    assert info.video_streams == 2


def test_probe_falls_back_to_format_duration(tmp_path: Path) -> None:
    payload = {
        "streams": [{"codec_type": "video", "width": 2, "height": 2, "r_frame_rate": "15/1"}],
        "format": {"duration": "2.0"},
    }
    info = probe(tmp_path / "x.mp4", ffprobe=fake_ffprobe(tmp_path, payload))
    assert (info.fps, info.duration_s, info.has_audio) == (15.0, 2.0, False)


def test_probe_without_video_stream(tmp_path: Path) -> None:
    payload = {"streams": [{"codec_type": "audio"}], "format": {}}
    with pytest.raises(ProbeError, match="no video stream"):
        probe(tmp_path / "x.mp4", ffprobe=fake_ffprobe(tmp_path, payload))


def test_probe_ffprobe_failure(tmp_path: Path) -> None:
    with pytest.raises(ProbeError, match="bad file"):
        probe(tmp_path / "x.mp4", ffprobe=fake_ffprobe(tmp_path, {}, exit_code=1))


def test_probe_missing_ffprobe(tmp_path: Path) -> None:
    with pytest.raises(ProbeError):
        probe(tmp_path / "x.mp4", ffprobe=str(tmp_path / "nope"))


def test_check_clip_valid() -> None:
    assert check_clip(GOOD, width=480, height=270, fps=15) == []
    assert check_clip(GOOD, width=480, height=270, fps=15.005) == []


def test_check_clip_reports_every_problem() -> None:
    problems = check_clip(GOOD, width=960, height=540, fps=30, max_duration_s=1)
    assert len(problems) == 3
    assert any("480x270" in p for p in problems)


def test_check_clip_zero_duration() -> None:
    info = MediaInfo(480, 270, 15.0, 0.0, "h264", "yuv420p", False)
    assert check_clip(info, width=480, height=270, fps=15) == ["duration is zero"]
