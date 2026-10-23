# AGENTS.md: rules for Claude Code and contributors

Read this file first. Then read `README.md`, `docs/architecture.md` and `docs/requirements.md`. `PRD.txt` is the base spec; `docs/requirements.md` lists the approved changes to it.

---

## 1. Git rules

- **Never commit, push, tag or merge.** Make changes in the working tree only. The developer reviews and commits.
- Do not change git config, remotes or branches unless asked.
- Never write tokens, keys or passwords into any file, command history or log.

## 2. Pull requests (only when explicitly asked)

Keep them short. No essays, no repeated file lists, no marketing.

```
## What
One or two lines.

## Why
One line (link the task ID, e.g. C-03).

## How to test
- command or click path
- expected result
```

- One PR = one task from §4. Small diffs (aim for < 300 changed lines).
- The title is the task ID plus a short imperative, e.g. `C-03: render scene via CLI`.

## 3. Code style: small and readable

- **Readable over clever.** A new teammate should understand a file in one read.
- **No bulky code.** Functions ≤ ~40 lines, files ≤ ~300 lines. Split by responsibility, not by habit.
- **No speculative abstraction.** Build only what the current task needs. No "future-proof" layers, factories or plugin systems until a second real use exists. The interfaces named in the docs (`Engine`, `Queue`, `ArtifactStore`) are the only planned exceptions, and each starts with one implementation.
- Clear names over comments. Comment only the *why* (a non-obvious decision or constraint).
- No dead code, no commented-out code, no unused dependencies.
- Prefer the standard library and the agreed stack (§5). Ask before adding a new dependency.
- Every change ships with tests for its behaviour. Never claim a test passed unless you ran it.

## 4. Build order: cycle → car → truck → aeroplane

Build in stages. **Do not start a stage until the previous stage's exit test passes.** Inside a stage, do one task at a time: plan → build → test → report.

Estimates are working days for one developer using Claude Code. Re-estimate after the cycle stage, once benchmarks exist.

### 🚲 Cycle: it moves (≈ 6 days)
*Goal: one Manim scene renders and plays in the browser.*

| ID | Task | Est. |
|---|---|---|
| C-01 | Repo skeleton: uv workspace (`packages/core`, `agent`, `sdk`), `studio/` Vite app, `make check` | 1d |
| C-02 | Install and verify Manim + FFmpeg locally and on Colab; pin versions | 0.5d |
| C-03 | `pnp_core`: load `pnp.yaml`, run `manim` subprocess with timeout + kill-tree | 1d |
| C-04 | ffprobe validator (exists, WxH, fps, duration) | 0.5d |
| C-05 | CLI: `pnp render <project> --scene X --quality draft` | 0.5d |
| C-06 | Agent: FastAPI, token auth, `GET /agent`, `POST /renders`, video stream | 1d |
| C-07 | Studio: token pairing, "Render" button, video player | 1d |
| C-08 | Memory/time benchmark: 3 scenes × 3 qualities, local + Colab | 0.5d |

**Exit test:** `pnp studio` → click Render → the video plays. This also works on Colab.

### 🚗 Car: daily driver (≈ 11 days)
*Goal: a real authoring loop with several scenes and one final video.*

| ID | Task | Est. |
|---|---|---|
| R-01 | Monaco editor, tabs, save with etag, unsaved indicator | 1.5d |
| R-02 | File tree, multi-file projects | 1d |
| R-03 | AST scene discovery with clear errors | 0.5d |
| R-04 | Live logs over WebSocket; traceback → file:line link | 1d |
| R-05 | Draft / preview / final quality selector | 0.5d |
| R-06 | Revision snapshots; renders pinned to a revision | 1d |
| R-07 | SQLite job queue: leases, priority, status, retry | 1.5d |
| R-08 | Cancel (kill process tree) and crash recovery | 1d |
| R-09 | Compositions: ordered clips in `pnp.yaml` + UI list | 1d |
| R-10 | Concat + final validation + 30-min limit | 1d |
| R-11 | Local terminal panel (loopback only) | 1d |

**Exit test:** edit → preview → fix an error → render 3 scenes → export one validated MP4.

### 🚚 Truck: carries load (≈ 10 days) → CTO demo
*Goal: brand kits and many variants from one project.*

| ID | Task | Est. |
|---|---|---|
| T-01 | `brand.yaml` schema, API, form UI | 1d |
| T-02 | Logo upload; SVG sanitise + rasterise per format | 1d |
| T-03 | Logo layout math (shared test vectors with the Studio) | 1d |
| T-04 | FFmpeg overlay in the composite step | 1d |
| T-05 | Placement editor: still frame, 9-point grid, sliders | 1.5d |
| T-06 | `pnp.ctx` sdk: format, theme, params | 1d |
| T-07 | Formats 16:9 / 9:16 / 1:1 with Manim frame geometry | 0.5d |
| T-08 | Variant matrix + `/exports/plan` + dedupe + cap | 1.5d |
| T-09 | Variant gallery | 1d |
| T-10 | RAM-aware worker slots, preview priority | 0.5d |

**Exit test:** run the CTO demo script in `docs/implementation-plan.md`. Moving a logo triggers zero Manim renders.

### ✈️ Aeroplane: scale and polish (after the CTO's feedback)
*Estimate after the demo.*

| ID | Task |
|---|---|
| A-01 | Polished Colab notebook, Drive sync, disconnect recovery |
| A-02 | Docker image + opt-in sandbox (`--network none`) |
| A-03 | Security test suite (`docs/security.md` §5), Playwright E2E |
| A-04 | AI assist with Claude: generate / modify / fix, with diff review |
| A-05 | Audio track, intro/outro, watermark, safe zones |
| A-06 | Server mode for ReelMVP: Postgres, S3, queue, sandboxed workers |

**Total to CTO demo: ≈ 27 working days (~5.5 weeks)**, plus a ~20% buffer → **plan for 6–7 weeks**.

### How to work on a task
1. Restate the task ID and scope in one or two lines.
2. Read the relevant code and docs.
3. Build the smallest version that passes the task.
4. Run `make check` (lint, types, tests). Run render tests if `pnp_core` changed.
5. Tick the task in `docs/implementation-plan.md`; update the docs if behaviour changed.
6. Report briefly: what changed, test results, anything left open.

## 5. Tech stack (pinned in the cycle stage)

| Area | Choice |
|---|---|
| Language (backend) | Python **3.12** (matches Colab; system 3.14 is too new for Manim deps) |
| Python tooling | uv, ruff (lint + format), pyright, pytest |
| Animation | Manim Community Edition (exact version pinned in C-02) |
| Media | FFmpeg 6+ / ffprobe |
| LaTeX | TeX Live subset or TinyTeX (optional; only for `MathTex`/`Tex`) |
| API | FastAPI, Uvicorn, Pydantic v2, pydantic-settings |
| Storage | SQLite (WAL) via SQLAlchemy 2 + Alembic; local files / Google Drive |
| Queue | Own SQLite-backed queue (no Redis in the MVP) |
| Frontend | React + TypeScript (strict) + Vite, pnpm |
| Frontend libs | Monaco Editor, xterm.js, TanStack Query, Tailwind CSS |
| Frontend tests | Vitest, Playwright |
| AI (aeroplane) | Claude API through a small provider interface |
| Packaging | `pnp` CLI via `uv tool install`; Docker image; Colab notebook |
| Future (server mode) | Postgres, Redis/SQS, S3, containers/gVisor |

## 6. Non-negotiables

1. **Never run user/AI/template Python inside the Agent process.** Always use a subprocess with timeout, rlimits, its own process group and an allowlisted env.
2. **Every user-supplied path goes through `safe_join`.** Never trust client paths.
3. **Don't rebuild Manim.** Orchestrate the `manim` CLI.
4. `pnp_core` has no web dependencies; the `pnp` sdk uses only the stdlib.
5. **Secrets never reach the browser or render subprocesses.**
6. **No fake progress.** Show only measured counts or percentages.
7. **Failed work never overwrites good work.** Publish by atomic rename; keep logs per attempt.
8. A logo/watermark change must never trigger a Manim re-render.
9. The Agent binds to `127.0.0.1` by default and requires the token on every route.

## 7. Worth knowing

- **Compute is the user's** (local PC, Docker, Colab). Design for 8 GB RAM laptops: draft quality first, one render at a time when memory is low.
- **Colab:** sessions disconnect and disks are wiped. Keep projects on Drive and renders on local disk. Check Colab's terms before exposing any web UI; use Colab's own port proxy, not public tunnels.
- **ReelMVP comes later.** Keep `pnp_core` headless so the server can reuse it unchanged.
- **Scenes must stay plain Manim.** They must run with the normal `manim` command too.
- Record any significant decision as a short ADR in `docs/decisions/`.
