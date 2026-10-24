"""The `pnp` command: doctor, render (no server) and studio (Agent + Studio)."""

import argparse
import os
import secrets
import shutil
import sys
import tempfile
import webbrowser
from pathlib import Path

from pnp_core.discovery import discover_scenes
from pnp_core.errors import ManifestError, PnpError
from pnp_core.formats import FPS_CHOICES, RESOLUTIONS, Quality, resolve_output
from pnp_core.manifest import load_manifest, parse_scene_ref
from pnp_core.probe import check_clip, probe
from pnp_core.render import RenderRequest, ToolPaths, render_scene

from pnp_agent.capabilities import agent_info, detect_tools
from pnp_agent.settings import REPO_ROOT, is_loopback, settings_from_env

REQUIRED_TOOLS = ("manim", "ffmpeg", "ffprobe")


def _tool_paths() -> ToolPaths:
    return settings_from_env(Path.cwd(), token="unused").tools


def cmd_doctor(_: argparse.Namespace) -> int:
    info = agent_info(Path.cwd(), detect_tools(_tool_paths()))
    print(f"Pi & Pixel {info['version']} on {info['os']} (target: {info['target']})")
    print(f"Python {info['python']}, {info['cpu_count']} CPUs")
    print(f"RAM {info['ram_free_mb']} MB free of {info['ram_total_mb']} MB")
    print(f"Disk {info['disk_free_mb']} MB free")
    for name, tool in info["tools"].items():
        mark = "ok     " if tool["available"] else "MISSING"
        print(f"  [{mark}] {name:8} {tool['version'] or '-'}  ({tool['path'] or 'not on PATH'})")
    missing = [n for n in REQUIRED_TOOLS if not info["tools"][n]["available"]]
    if missing:
        print(f"Missing required tools: {', '.join(missing)}", file=sys.stderr)
        return 1
    return 0


def _render_request(args: argparse.Namespace) -> RenderRequest:
    """Validate CLI input; raises ManifestError with a readable message."""
    root = Path(args.project).resolve()
    formats = load_manifest(root).all_formats()
    if args.format not in formats:
        raise ManifestError(f"Unknown format {args.format!r} (known: {', '.join(sorted(formats))})")
    parse_scene_ref(args.scene)
    scenes, _ = discover_scenes(root)
    if args.scene not in {s.ref for s in scenes}:
        raise ManifestError(f"No scene {args.scene!r} found in {root}")
    fmt = formats[args.format]
    quality = Quality(args.quality) if args.quality else None
    out = resolve_output(fmt, quality=quality, resolution=args.resolution, fps=args.fps)
    return RenderRequest(root, args.scene, fmt, out.quality, resolution=out.resolution, fps=out.fps)


def cmd_render(args: argparse.Namespace) -> int:
    try:
        req = _render_request(args)
    except PnpError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    tools = _tool_paths()
    width, height, fps = resolve_output(
        req.fmt, quality=req.quality, resolution=req.resolution, fps=req.fps
    ).geometry
    class_name = parse_scene_ref(req.scene_ref)[1]
    default_name = f"{class_name}-{args.format}-{req.resolution}-{fps}fps.mp4"
    out = Path(args.out or default_name).resolve()
    with tempfile.TemporaryDirectory(prefix="pnp-render-") as tmp:
        result = render_scene(
            req, Path(tmp), tools=tools, on_line=lambda line: print(line, file=sys.stderr)
        )
        if result.status != "completed" or result.output is None:
            print(f"render {result.status}: {result.error}", file=sys.stderr)
            return 1
        try:
            info = probe(result.output, ffprobe=tools.ffprobe)
        except PnpError as exc:
            print(f"validation failed: {exc}", file=sys.stderr)
            return 1
        problems = check_clip(info, width=width, height=height, fps=fps)
        if problems:
            print(f"validation failed: {'; '.join(problems)}", file=sys.stderr)
            return 1
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(result.output, out)
    print(out)
    return 0


def cmd_studio(args: argparse.Namespace) -> int:
    import uvicorn  # imported here so `pnp render` and `pnp doctor` start fast

    from pnp_agent.app import create_app

    workspace = Path(args.workspace).resolve()
    workspace.mkdir(parents=True, exist_ok=True)
    default_dist = REPO_ROOT / "studio" / "dist"
    dist = args.studio_dist or (default_dist if default_dist.is_dir() else None)
    token = os.environ.get("PNP_TOKEN") or secrets.token_urlsafe(24)
    settings = settings_from_env(
        workspace,
        token=token,
        host=args.host,
        port=args.port,
        studio_dist=dist,
        terminal_enabled=not args.no_terminal,
    )
    if not is_loopback(args.host):
        print(
            f"warning: binding to {args.host} exposes the Agent beyond this machine",
            file=sys.stderr,
        )
    url = f"http://127.0.0.1:{args.port}/#token={token}"
    print(f"Pi & Pixel Studio: {url}", flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    uvicorn.run(create_app(settings), host=args.host, port=args.port)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="pnp", description="Pi & Pixel")
    sub = parser.add_subparsers(dest="command", required=True)

    doctor = sub.add_parser("doctor", help="check this machine can render")
    doctor.set_defaults(func=cmd_doctor)

    render = sub.add_parser("render", help="render one scene without a server")
    render.add_argument("project", help="project folder containing pnp.yaml")
    render.add_argument("--scene", required=True, help="scene ref, e.g. scenes/proof.py:Proof")
    render.add_argument("--format", default="landscape")
    render.add_argument(
        "--quality", choices=[q.value for q in Quality], help="preset (default draft = 480p@15)"
    )
    render.add_argument("--resolution", choices=list(RESOLUTIONS), help="wins over --quality")
    render.add_argument("--fps", type=int, choices=FPS_CHOICES, help="wins over --quality")
    render.add_argument("--out", help="output file (default ./<Class>-<format>-<res>-<fps>fps.mp4)")
    render.set_defaults(func=cmd_render)

    studio = sub.add_parser("studio", help="run the Agent and open the Studio")
    studio.add_argument("workspace", nargs="?", default="./workspace")
    studio.add_argument("--host", default="127.0.0.1")
    studio.add_argument("--port", type=int, default=7860)
    studio.add_argument("--no-browser", action="store_true")
    studio.add_argument("--studio-dist", type=Path, default=None)
    studio.add_argument(
        "--no-terminal", action="store_true", help="disable the Studio terminal panel"
    )
    studio.set_defaults(func=cmd_studio)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)
