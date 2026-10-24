"""Fake ffmpeg/ffprobe executables and real test clips shared by the core tests."""

import json
import subprocess
import sys
import textwrap
from pathlib import Path

# Every call appends its argv to <cwd>/ffmpeg-calls.jsonl and its env to <cwd>/ffmpeg-env.json.
FFMPEG_PRELUDE = """\
import json, os, shutil, signal, sys, time
from pathlib import Path
args = sys.argv[1:]
with open("ffmpeg-calls.jsonl", "a") as calls:
    calls.write(json.dumps(args) + "\\n")
Path("ffmpeg-env.json").write_text(json.dumps(dict(os.environ)))
out = Path(args[-1])
"""

COPY_INPUT = "shutil.copyfile(args[args.index('-i') + 1], out)"


def fake_ffmpeg(tmp_path: Path, body: str = COPY_INPUT) -> str:
    script = tmp_path / "fake-ffmpeg"
    script.write_text(f"#!{sys.executable}\n{FFMPEG_PRELUDE}\n{textwrap.dedent(body)}")
    script.chmod(0o755)
    return str(script)


def ffmpeg_calls(cwd: Path) -> list[list[str]]:
    path = cwd / "ffmpeg-calls.jsonl"
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines()]


def probe_payload(
    width: int, height: int, fps: int, duration: float, codec: str = "h264", streams: int = 1
) -> dict[str, object]:
    video = {
        "codec_type": "video", "codec_name": codec, "width": width, "height": height,
        "r_frame_rate": f"{fps}/1", "pix_fmt": "yuv420p", "duration": str(duration),
    }  # fmt: skip
    return {"streams": [video] * streams, "format": {"duration": str(duration)}}


def fake_ffprobe(tmp_path: Path, payloads: dict[str, dict[str, object]]) -> str:
    """ffprobe that answers by file name; unknown names fail like a missing file."""
    script = tmp_path / "fake-ffprobe"
    script.write_text(
        f"#!{sys.executable}\nimport json, sys\nfrom pathlib import Path\n"
        f"payloads = json.loads({json.dumps(payloads)!r})\n"
        "name = Path(sys.argv[-1]).name\n"
        "if name not in payloads or not Path(sys.argv[-1]).exists():\n"
        "    sys.stderr.write(name + ': No such file or directory\\n')\n"
        "    sys.exit(1)\n"
        "print(json.dumps(payloads[name]))\n"
    )
    script.chmod(0o755)
    return str(script)


def make_testsrc(path: Path, *, size: str = "160x90", fps: int = 15, seconds: float = 1) -> Path:
    """A real H.264 clip from ffmpeg's lavfi test pattern (needs ffmpeg on PATH)."""
    source = f"testsrc=size={size}:rate={fps}:duration={seconds}"
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-f", "lavfi",
         "-i", source, "-c:v", "libx264", "-pix_fmt", "yuv420p", str(path)],
        check=True,
    )  # fmt: skip
    return path
