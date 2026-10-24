# Requirements Addendum (v1.1)

This document **extends** [`PRD.txt`](../PRD.txt) v1.0. Every PRD requirement still applies unless it is listed under §6 *Deviations*. New requirement IDs start at FR-100 so they never clash with the PRD.

Priorities follow the PRD: **P0** is required for the MVP / CTO demo, **P1** follows the first end-to-end version, and **P2** is post-MVP.

---

## 1. Why this addendum exists

The PRD assumes a hosted, multi-user, server-rendered platform. For the MVP we change three things:

1. **Compute is the user's.** Rendering runs on the user's PC or on Google Colab. The browser is only a controller. This keeps our infrastructure cost near zero while we validate the product, and lets people with weak machines still render (via Colab).
2. **Branding and variations are first-class.** Pi & Pixel feeds ReelMVP, which needs the same content in several formats and brands. That is the "Adobe for animation" part.
3. **ReelMVP integration path.** Everything must be reusable later on our servers without a rewrite.

---

## 2. Compute targets and the Agent

**FR-100: Run anywhere (P0).** The Agent must run on:
- (P0) Linux, macOS and Windows (WSL2 acceptable) with Python 3.12
- (P0) Google Colab, via a provided notebook
- (P1) a Docker image containing Manim, FFmpeg and a TeX subset

**FR-101: Capability report (P0).** `GET /api/v1/agent` and `pnp doctor` report: OS, CPU count, total/free RAM, free disk, Python, Manim, FFmpeg and LaTeX versions/availability, compute target type, and enabled features (terminal, docker sandbox, AI). The Studio shows this as a status badge and warns about missing capabilities (for example *"LaTeX missing: `MathTex` scenes will fail"*).

**FR-102: Pairing and authentication (P0).**
- On start the Agent generates a random token (≥128 bit) and prints a URL that contains it once (`…/#token=…`). The Studio stores it in `sessionStorage` and sends it as a `Bearer` header.
- Local mode binds to `127.0.0.1` by default. Binding to another interface requires an explicit `--host` flag plus a warning.
- Strict CORS allowlist and `Host` header validation (DNS-rebinding protection).

**FR-103: Resource-aware concurrency (P0).**
- The Agent derives max parallel render jobs from free RAM and CPU (configurable per-job memory budget; benchmarked in Phase 0).
- Preview jobs have higher priority than final or variant jobs.
- The Studio shows queue position and why a job is waiting (*"waiting for memory"*).

**FR-104: Low-spec mode (P0).** Renders default to 480p15. The Studio offers the output explicitly as a resolution (480p, 720p, 1080p, 1440p, 4K) and an fps (15, 24, 30, 60), shows the exact output size, and marks 1440p and 4K as "slower, uses more memory". This replaces the draft / preview / final control of PRD FR-015 in the UI; the API and CLI keep those names as shortcuts.

**FR-105: Colab session safety (P0).**
- Projects persist to Google Drive. Renders run on Colab's local disk and finished artifacts are copied to Drive. Drive FUSE is too slow for Manim's partial-movie files.
- The Studio warns that a Colab session can disconnect. Jobs interrupted by a disconnect are marked `interrupted` on next start and can be retried (PRD AC-011).

**FR-106: Headless CLI and job spec (P0).** Every Studio render/export action is also available as `pnp render` / `pnp export`, driven by a versioned JSON job spec. ReelMVP will integrate through this.

---

## 3. Brand kits

**FR-110: Brand kit (P0).** A project may define any number of brand kits (`brands/<name>/brand.yaml`) containing:
- **Logo:** PNG (with alpha) or SVG, up to 5 MB
- **Theme:** background, primary, secondary, accent and text colours; font family
- (P1) intro and outro clips (scene references)
- (P1) watermark (separate image with tiling/opacity)

**FR-111: Logo placement (P0).** Logo placement supports:
- **Anchor:** 9-point grid (`top-left` … `bottom-right`, `center`) or custom normalised `{x, y}`
- **Margin** as a fraction of the shorter frame edge
- **Size** as a fraction of frame width
- **Opacity** (0–1)
- **Timing:** `from` / `until` (seconds or `end`), with optional fade in/out
- **Per-format overrides**, for example a different anchor and size on 9:16
- **Safe zones** (P1): optional guides and auto-nudge for platform UI areas on 9:16 (Reels/Shorts captions and buttons)

**FR-112: Placement editor (P0 grid / P1 drag).**
- (P0) The Studio shows a still frame of the selected variant with the logo drawn on top. Clicking a 9-point anchor and adjusting sliders updates it live in the browser (CSS preview, no render).
- (P1) Free drag and resize, with snapping to anchors and safe zones.
- Changes write to `brand.yaml`.

**FR-113: Theme injection (P0).** Scenes read the active brand theme through `pnp.ctx.theme`. Scenes that do not use it are unaffected. A theme change invalidates only renders whose theme hash changes.

**FR-114: Logo is a composite step (P0).** Logo and watermark are applied by FFmpeg at composite time. Changing logo placement must **not** trigger a Manim re-render. This is verified by a test.

---

## 4. Multiple videos and variations

**FR-120: Compositions (P0).** A project may contain multiple **compositions** (videos). Each is an ordered list of clips. A clip is a `scene` reference plus optional `params`. The same scene may appear in several compositions with different params. This implements PRD FR-014 (ordering) as P0.

**FR-121: Formats (P0).** Built-in formats:

| Name | Size | Aspect | Typical use |
|---|---|---|---|
| `landscape` | 1920×1080 | 16:9 | YouTube, courses |
| `portrait` | 1080×1920 | 9:16 | Reels, Shorts, TikTok |
| `square` | 1080×1080 | 1:1 | Feed posts |

Custom formats are allowed (even dimensions only, ≤ 3840 on the long edge), all at 30 fps by default. Scenes can adapt their layout through `pnp.ctx.format` (`is_portrait`, `aspect`, `width`, `height`).

**FR-122: Variant matrix (P0).** An export is defined as a matrix over `composition × format × brand × params.*`, with `include`/`exclude` rules. Before rendering, the Studio shows:
- the number of variants
- the number of **unique** Manim render units after dedupe
- the number of render units already cached

The user confirms before any work starts. A configurable cap (default 24 variants per export) prevents accidental explosions.

**FR-123: Parameterised scenes (P0).** Clip and variant params (strings, numbers, booleans, lists) reach the scene through `pnp.ctx.params`. Params are part of the render-unit cache key.

**FR-124: Render dedupe (P0) and persistent cache (P1).**
- (P0) Within one export, identical render units are rendered once.
- (P1) Across exports, a render unit is reused only if its full cache key matches: source hash, scene, format, theme hash, params, quality, Manim version, Python version and sdk version (PRD §8.3: never reuse by name alone).

**FR-125: Variant gallery (P0).** Exports show a grid of variants with thumbnail, status, duration, size, play and download actions.

**FR-126: Batch download (P1).** Download all variants of an export as a ZIP containing a `manifest.json`.

**FR-127: Background audio (P1).** A composition may reference one audio track (MP3/WAV/AAC), trimmed or looped to the video length, with fade-out. Advanced audio editing remains out of scope (PRD §2.2).

---

## 5. Extensibility

**FR-130: Engine adapter interface (P0 design / P2 second engine).** Render units are executed through an `Engine` interface (`discover`, `render_unit`, `version`). Manim CE is the only MVP implementation. The interface must not leak Manim-specific types into the planner or compositor.

**FR-131: Storage adapter (P0 design).** Artifact storage goes through an interface with a `LocalFS` implementation. `S3` is implemented in server mode.

**FR-132: Queue adapter (P0 design).** The job queue goes through an interface with a `SQLiteQueue` implementation. A Redis/SQS implementation is added in server mode.

---

## 6. Deviations from PRD v1.0

| PRD item | MVP behaviour | Reason | Restored when |
|---|---|---|---|
| §2.1 User accounts | Single-user Agent and token auth; no accounts | Compute and data belong to the user running the Agent | Server mode |
| FR-002 / AC-009 multi-user isolation | Not applicable within one Agent. Token auth and path safety still enforced | One owner per Agent | Server mode |
| §7.2 PostgreSQL | SQLite (`.pnp/state.db`) | Zero-setup on laptop and Colab | Server mode |
| §7.2 Redis queue | Durable SQLite queue with leases | Same | Server mode |
| §7.2 S3 storage | Local filesystem / Google Drive | Same | Server mode |
| SEC-001/002 isolated containers, no network | Subprocess isolation + rlimits + timeout. Docker sandbox (`--network none`) is opt-in locally | The user runs their own code on their own machine, which is equivalent to running `manim` themselves | Mandatory in server mode |
| §2.2 "multiple animation engines" out of scope | Still out of scope. Only the adapter interface is designed | Keeps the door open cheaply | P2 |
| FR-014 ordering P1 | P0 (compositions) | Required for multi-video and variants | n/a |
| §8.3 incremental rendering P1 | In-export dedupe P0; cross-export cache P1 | Variants are unaffordable without dedupe | n/a |

All deviations are recorded as ADRs in [`decisions/`](decisions/).

---

## 7. Additional acceptance criteria

**AC-100 Colab end-to-end.** On a fresh Colab runtime, running the notebook cells top to bottom lets a user open the Studio, render the starter project at draft quality, and download an MP4, with no local installs.

**AC-101 Low-spec machine.** On a machine with 8 GB RAM, draft previews of the starter project complete without the Agent or OS running out of memory. Concurrency is reduced automatically.

**AC-102 Logo moves are cheap.** After an export completes, changing only the logo anchor and re-exporting triggers **zero** Manim jobs and only composite jobs.

**AC-103 Variant matrix.** Exporting `main × {landscape, portrait} × {default, acme}` produces 4 validated MP4s with correct dimensions, and the logo is at the configured anchor in each (checked by sampling a frame).

**AC-104 Dedupe.** In AC-103, if `default` and `acme` share the same theme, exactly 2 × (number of scenes) Manim render units run.

**AC-105 Plain Manim compatibility.** Every starter scene renders with `manim -ql scenes/x.py Class` outside Pi & Pixel, using defaults for `pnp.ctx`.

**AC-106 Network exposure.** A request without a valid token, or with a foreign `Host`/`Origin`, is rejected for every API route and the WebSocket.

**AC-107 Headless parity.** `pnp export` with the same job spec produces byte-identical *plans* (same render units and cache keys) as the Studio.

---

## 8. Non-functional targets (to be confirmed by Phase 0 benchmarks)

| Area | Target |
|---|---|
| Agent idle RAM | < 300 MB |
| Studio first load from Agent | < 3 s on localhost |
| Time from `pnp studio` to usable UI | < 5 s (deps already installed) |
| Colab setup (first run, with LaTeX) | Measured and shown in the notebook; goal < 6 min |
| Draft preview of a simple 10 s scene | Benchmarked per target; shown to the user, never promised |

---

## 9. Open questions for CTO review

1. **Colab terms of use.** Colab's free tier restricts some remote-UI/proxy usage. We plan to show the Studio through Colab's own port proxy, not third-party tunnels. Do we need legal sign-off, or should Colab be "paid tier only" for public users? See [ADR-0005](decisions/0005-colab-runtime-mode.md).
2. **ReelMVP contract.** Will ReelMVP call Pi & Pixel as a CLI/job spec, as a Python library, or through an HTTP API? This decides how much of the Agent API we freeze.
3. **Hosted Studio.** Should the Studio also be hosted on our domain (and connect to a user's Agent), or always be served by the Agent? Serving it from the Agent avoids mixed-content and CORS problems in the MVP.
4. **AI in the demo.** Do we include Claude-based scene generation in the CTO demo (Phase 7, P1) or keep the demo to the core pipeline?
5. **Brand assets.** Do brand kits need to be shared across projects (a global brand library) in the MVP, or is per-project enough?
