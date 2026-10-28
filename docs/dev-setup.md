# Set up Pi & Pixel on a new machine

This guide sets up the local Agent, Manim renderer, FFmpeg, and browser Studio from a fresh checkout. The supported setup described here is **Ubuntu 24.04**. On Windows, use **WSL2 with Ubuntu 24.04** and run the project inside the Ubuntu shell; native PowerShell is not the supported render environment.

## Requirements

| Tool | Version | Why it is needed |
|---|---|---|
| Ubuntu | 24.04 LTS | Supported local environment; use it directly or through WSL2 |
| Python | 3.12.x | Required by the workspace; `uv` installs it |
| `uv` | Current stable | Creates the Python environment from `uv.lock` |
| Manim Community | 0.22.0 | Renders scene files; installed as a separate CLI tool |
| FFmpeg + ffprobe | 6 or newer | Composes and validates MP4 exports |
| Node.js | 22.12 or newer in the 22.x line | Builds the Studio (Vite 8 requirement) |
| pnpm | 9.15.9 | Installs the Studio dependencies from its lockfile |
| LaTeX | Optional | Only needed by scenes using `MathTex` or `Tex` |

The Python and JavaScript lockfiles pin application dependencies. Manim, FFmpeg, and Node are system tools and are checked separately by `pnp doctor`.

## 1. Install system tools

### Windows: install WSL2

Run this in **PowerShell as Administrator**, then restart Windows if prompted and launch Ubuntu from the Start menu:

```powershell
wsl --install -d Ubuntu-24.04
```

Complete Ubuntu's first-run username/password setup. Continue with all remaining commands in the **Ubuntu terminal**, not PowerShell.

### Ubuntu 24.04: install build and media packages

```bash
sudo apt update
sudo apt install -y git curl ca-certificates build-essential python3-dev pkg-config \
  libcairo2-dev libpango1.0-dev ffmpeg
```

Ubuntu 24.04 supplies FFmpeg 6.1 and `ffprobe` with the `ffmpeg` package. The compiler, Python headers, Cairo, Pango, and `pkg-config` are needed to install Manim's rendering dependencies.

### Install uv and Python 3.12

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source "$HOME/.local/bin/env"
uv python install 3.12
```

If `source` says the file does not exist, open a new Ubuntu terminal and run `uv --version`. If it is still not found, add `~/.local/bin` to your shell's `PATH`.

### Install Manim

```bash
uv tool install --python 3.12 "manim==0.22.0"
source "$HOME/.local/bin/env"
```

Manim is a separate command-line program. It does not need to be added to this project's Python dependencies; the Agent launches the `manim` command in a render subprocess.

### Install Node.js 22 and pnpm

Install Node.js 22 with `nvm`, then install the pnpm version used by this project:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash
source "$HOME/.bashrc"
nvm install 22
nvm use 22
npm install --global pnpm@9.15.9
node --version
pnpm --version
```

The Node 22 version installed must be `22.12.0` or later. This is the minimum supported by the project's Vite version.

## 2. Clone and install the project

Run these commands in the Ubuntu terminal. Keeping the checkout in Ubuntu's home directory is recommended for WSL2; it avoids cross-filesystem performance and file-locking issues.

```bash
mkdir -p "$HOME/src"
cd "$HOME/src"
git clone https://github.com/harshdotcom/PiAndPixel.git
cd PiAndPixel
```

If the repository is private when you set it up, authenticate with GitHub before cloning. Do not put an access token in the clone URL.

Install the locked dependencies and build the Studio:

```bash
source scripts/dev-env.sh
uv sync --locked
cd studio
pnpm install --frozen-lockfile
pnpm build
cd ..
```

`uv sync --locked` uses the root `uv.lock`; `pnpm install --frozen-lockfile` uses `studio/pnpm-lock.yaml`. The build creates `studio/dist`, which the Agent serves to the browser.

## 3. Check the installation

From the repository root, run:

```bash
source scripts/dev-env.sh
uv run --locked pnp doctor
manim --version
ffmpeg -version
ffprobe -version
node --version
pnpm --version
```

Confirm that Manim and FFmpeg/ffprobe are found and that Node is `v22.12.0` or later in the 22.x line. A missing LaTeX installation is fine for scenes that use `Text`; install LaTeX only if you need `MathTex` or `Tex`.

## 4. Start the Studio

From the repository root:

```bash
source scripts/dev-env.sh
uv run --locked pnp studio ./workspace
```

The Agent creates `./workspace` if needed, starts on `127.0.0.1:7860`, and prints a Studio URL containing a temporary access token. Open that **full printed URL** in a browser on the same machine. If WSL does not open the browser automatically, copy the URL into the Windows browser. Keep the token private. It is generated again when the Agent restarts, so use the newly printed URL after a restart. Stop the Agent with **Ctrl+C**.

In the Studio, choose **New project**, enter a name, and select **Pythagoras** for the included starter project or **Blank** for an empty Manim project. Click **Render** to make the first preview.

The `workspace/` folder contains your projects and render state. Back it up if you want to preserve work; it is intentionally excluded from Git.

## Optional: enable script drafting and voice generation

OpenAI script drafting and Deepgram voice generation are optional. Without keys, the rest of the Studio still runs. Create a local `.env` file in the repository root and add only the keys for providers you want to use:

```dotenv
OPENAI_API_KEY=your_openai_key
DEEPGRAM_API_KEY=your_deepgram_key
```

Keep the actual values private. `.env` is ignored by Git; never commit keys or paste them into chat, source code, or project files. Provider calls can incur charges and happen only when you click **Draft with OpenAI** or **Generate voice**.

Stop the Agent, then launch it with the local environment file loaded:

```bash
source scripts/dev-env.sh
uv run --locked --env-file .env pnp studio ./workspace
```

If a key is added or changed while the Agent is running, restart the Agent so it reads the new value. The browser never receives provider keys.

## Updating an existing checkout

From the repository root:

```bash
git pull --ff-only
source scripts/dev-env.sh
uv sync --locked
cd studio
pnpm install --frozen-lockfile
pnpm build
```

Restart the Agent after updating backend code. Refresh the browser after rebuilding the Studio.

## Common setup problems

| Symptom | Fix |
|---|---|
| `uv`, `manim`, or `pnpm` is not found | Run `source scripts/dev-env.sh`; if needed, open a new terminal after installing the tool. |
| `manim: command not found` in `pnp doctor` | Install Manim with the command above, then source `~/.local/bin/env` and `scripts/dev-env.sh`. |
| `ffmpeg` or `ffprobe` is missing | Install Ubuntu's `ffmpeg` package with `sudo apt install ffmpeg`. |
| `pnp doctor` reports missing LaTeX | This affects `MathTex`/`Tex` scenes only. Install LaTeX or use `Text` instead. |
| Studio asks for a token after an Agent restart | Open the new full URL printed by the Agent; restarts generate a fresh token. |
| OpenAI/Deepgram actions are disabled | Check the variable names in `.env`, then restart with `uv run --env-file .env ...`. Never include quotes around the entire `KEY=value` line. |
| Port 7860 is already in use | Stop the other Agent with Ctrl+C, or start this one with `uv run --locked pnp studio ./workspace --port 7861`. |
| Render is slow or runs out of memory | Start at draft quality (480p, 15 fps) and run one render at a time. An 8 GB machine is the project's baseline target. |

## Optional LaTeX installation

Install LaTeX only if a scene uses `MathTex` or `Tex`:

```bash
sudo apt install -y texlive-latex-extra texlive-fonts-extra dvisvgm
```

These packages use significant disk space. Run `uv run --locked pnp doctor` again after installation to check detection.

## Reference links

- [Manim Community Linux installation](https://docs.manim.community/en/stable/installation/linux.html)
- [uv installation](https://docs.astral.sh/uv/getting-started/installation/)
- [uv Python installation](https://docs.astral.sh/uv/guides/install-python/)
- [Node.js downloads](https://nodejs.org/en/download)
- [nvm installation instructions](https://github.com/nvm-sh/nvm#installing-and-updating)
- [Vite Node.js requirement](https://vite.dev/guide/)
- [pnpm installation](https://pnpm.io/installation)
