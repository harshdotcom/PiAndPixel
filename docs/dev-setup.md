# Developer setup

How to set up and run Pi & Pixel from a clone of this repo.

**What you need:** Python 3.12 (via uv), Manim Community 0.22 as a CLI, FFmpeg/ffprobe, Node 22 + pnpm. LaTeX is optional.

**Windows:** use WSL2 (Ubuntu) and follow route A inside it.

## 1. Install the tools (pick one route)

### Route A: Ubuntu / Debian with sudo

```bash
sudo apt install build-essential pkg-config libcairo2-dev libpango1.0-dev ffmpeg
curl -LsSf https://astral.sh/uv/install.sh | sh    # uv (manages Python 3.12)
uv tool install manim                              # Manim as an isolated CLI on PATH
# Node 22 (e.g. from nodesource or nvm), then:
corepack enable                                    # provides pnpm
```

### Route B: no sudo (micromamba, conda-forge)

This is what the main dev machine uses. Everything lives in your home directory.

```bash
# micromamba: https://mamba.readthedocs.io/en/latest/installation/micromamba-installation.html
micromamba create -n pnp -c conda-forge python=3.12 manim ffmpeg nodejs=22 pnpm
curl -LsSf https://astral.sh/uv/install.sh | sh
source scripts/dev-env.sh                          # puts the env's manim/ffmpeg/node on PATH
```

`scripts/dev-env.sh` expects the env at `~/.local/share/mamba/envs/pnp` (override with `PNP_MAMBA_ENV`). On route A it changes nothing. The Makefile sources it for you; source it yourself before running `uv`, `manim` or `pnpm` by hand.

Manim is never imported by the project's Python code. `pnp_core` runs the `manim` CLI as a subprocess, so the project venv does not need Manim installed.

### Check the tools

```bash
manim --version      # Manim Community v0.22.x
ffmpeg -version      # 6 or newer
node --version       # v22.x
pnpm --version
```

## 2. Build and run

```bash
make setup           # uv sync + pnpm install
make check           # lint, types and tests (Python + Studio)
make studio-build    # build the Studio into studio/dist
make dev             # Agent on ./workspace; prints http://127.0.0.1:7860/#token=...
```

### Optional narration providers

The Studio can draft scripts with OpenAI and generate/align voice with Deepgram. Put the keys in the project-root `.env` file, which is ignored by Git, and launch the Agent through `uv` so it loads them into the Agent process environment:

```bash
cd /mnt/d/04_Rough/PiAndPixel
source scripts/dev-env.sh
uv run --env-file .env pnp studio ./workspace
```

Edit `.env` locally and fill in `OPENAI_API_KEY` and `DEEPGRAM_API_KEY`. Do not commit or share this file: it contains plain-text secrets. The Agent reads the keys server-side; they are not sent to the browser or render subprocesses. Stop a previously running Agent before starting another. Provider calls may incur separate charges and happen only after you click the relevant action.

Open the printed URL (the token is in the `#` part and stays in the browser). Stop the server with Ctrl+C.

Without the Studio:

```bash
uv run pnp doctor    # shows manim / ffmpeg / ffprobe / latex; exit 1 if a required tool is missing
uv run pnp render examples/pythagoras --scene scenes/proof.py:Proof --quality draft
uv run pnp render examples/pythagoras --scene scenes/proof.py:Proof --format portrait --resolution 720p --fps 24
```

`--resolution` (480p … 2160p) and `--fps` (15, 24, 30, 60) win over `--quality` (draft = 480p @ 15, preview = 720p @ 30, final = 1080p).

`make test-render` runs the slow tests that really call Manim and FFmpeg. On a machine with little RAM, render at draft quality, one render at a time.

To run an example scene with plain Manim, put the sdk on `PYTHONPATH`:

```bash
cd examples/pythagoras
PYTHONPATH=../../packages/sdk/src manim render -ql scenes/proof.py Proof
```

## 3. LaTeX (optional)

Only needed for scenes that use `MathTex` or `Tex`. The examples use `Text`, so you can skip it.

```bash
sudo apt install texlive-latex-extra texlive-fonts-extra dvisvgm
```

Without sudo, install TinyTeX in your home directory, or skip LaTeX. `pnp doctor` shows whether it was found.
