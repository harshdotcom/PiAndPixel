# Implementation Plan

> Stage mapping used in `AGENTS.md`: 🚲 Cycle = M0–M1 · 🚗 Car = M2–M3 · 🚚 Truck = M4–M5 · ✈️ Aeroplane = M6–M8. Task IDs (C-01, R-01, T-01, A-01) and day estimates live in `AGENTS.md` §4.

The PRD phases are re-sequenced for bring-your-own compute, branding and variants. Each milestone ends in a working, tested state (PRD §17.3). The **CTO demo is reachable at the end of M5**.

| # | Milestone | Outcome | Est.* | Status |
|---|---|---|---|---|
| M0 | Foundations | Repo, tooling, Manim + FFmpeg verified locally **and on Colab**, memory benchmark | 2–3 d | ⏳ local done, Colab pending |
| M1 | Vertical slice | `pnp render` CLI + Agent + bare Studio plays a rendered scene | 4–5 d | ⏳ local done, Colab pending |
| M2 | Authoring workflow | Monaco, file tree, scene discovery, live logs, draft/preview/final, revisions | 5–7 d | ✅ local (Colab pending) |
| M3 | Jobs and assembly | SQLite queue, DAG, cancel/retry/recovery, compositions, concat, ffprobe validation, 30-min limit | 5–7 d | ✅ local (Colab pending) |
| M4 | Brand kits | Brand YAML, logo upload, overlay compositor, 9-point placement editor, theme via `pnp.ctx` | 4–5 d | ☐ |
| M5 | Formats and variants | 16:9 / 9:16 / 1:1, matrix + plan preview + dedupe, variant gallery | 5–6 d | ☐ |
| — | **CTO demo** | Script below | — | |
| M6 | Colab + Docker + hardening | Polished notebook, Docker image, security test suite, resource governor tuning | 5–7 d | ☐ |
| M7 | AI assist (P1) | Claude-backed generate/modify/debug with diff review | 5–7 d | ☐ |
| M8 | Server mode (post-MVP) | Postgres/S3/queue adapters, sandboxed workers, ReelMVP integration | TBD | ☐ |

\* Rough estimates for one engineer working with Claude Code. They will be re-estimated after M0, once render benchmarks exist. They are not commitments.

---

## M0: Foundations

- [x] `uv` workspace with `packages/{core,agent,sdk}`, Python 3.12 pinned (`.python-version`)
- [x] `studio/` Vite + React + TS, pnpm
- [x] ruff, pyright, pytest, eslint, vitest; `make check` runs everything
- [ ] Pin Manim CE exact version. Verify `manim render` on: this machine, Colab, and the Docker base image (Manim 0.22.0 verified on this machine; Colab pending; Docker pending)
- [ ] Verify FFmpeg overlay + concat + ffprobe on all three (ffprobe verified locally; overlay/concat not yet; Colab pending)
- [ ] **Benchmark:** peak RSS and wall time for 3 reference scenes (text, MathTex, 3D) × 3 qualities × 2 formats on local and Colab → seeds `per_job_budget` (local text scenes × 3 qualities, landscape, in [`benchmarks.md`](benchmarks.md); MathTex/3D, portrait and Colab pending)
- [ ] Decide the Colab UI exposure method after checking current Colab terms ([ADR-0005](decisions/0005-colab-runtime-mode.md)) (Colab pending)
- [ ] `examples/pythagoras` starter project (3 scenes, 2 brands), which doubles as the render test fixture (3 scenes done and rendered in both orientations; brands come with T-01)

**Exit:** `make check` is green; the benchmark table is committed to `docs/benchmarks.md`.

## M1: Vertical slice

- [x] `pnp_core`: project loader (`pnp.yaml`), `ManimEngine.render_unit()` subprocess with timeout + kill-tree, ffprobe validator (implemented as `render_scene()`)
- [x] `pnp render <project> --scene X --quality draft` → MP4
- [x] `pnp_agent`: FastAPI, token auth, `GET /agent`, `POST /renders` (one-worker thread pool for now), artifact stream
- [x] Studio: token pairing, one button "Render", `<video>` player
- [x] `pnp studio` serves the built Studio and opens the browser

**Exit:** create project → render → watch video in the browser (PRD Phase 1 exit). It also works in a throwaway Colab notebook (Colab pending).

## M2: Authoring workflow

- [x] Monaco editor, tabs, unsaved indicator, save with etag
- [x] File tree, multi-file projects with imports
- [x] AST scene discovery with clear errors
- [x] Live log streaming over `WS /events`; Python tracebacks mapped to file:line links
- [x] Draft / preview / final quality selector (now: resolution 480p–4K and fps 15–60 selects; quality stays as an API/CLI shortcut)
- [x] Immutable revision snapshots, with renders pinned to a revision
- [x] Local terminal panel (xterm.js + PTY), loopback only

## M3: Jobs and assembly

- [x] `SQLiteQueue`: leases, priorities, DAG dependencies, attempts (stdlib `sqlite3`, [ADR-0006](decisions/0006-sqlite-stdlib-job-queue.md))
- [x] Cancel (kill tree), retry, crash recovery on start (`interrupted`)
- [x] Compositions in `pnp.yaml`, plus an ordered clip list in the UI
- [x] Compositor: concat (copy when possible, otherwise encode); validator rules 1–5
- [x] Duration limit (AC-006); preserve previous outputs (AC-007) (the 30-min limit is covered by unit tests, not by a real 30-minute export)

**Exit:** edit → preview → fix an error → render 3 scenes → export one validated MP4. Verified locally in the Studio (headless Chrome) and through the API, including cancel, retry, `kill -9` recovery, revisions and the terminal.

## M4: Brand kits

- [ ] `brand.yaml` schema + API + UI form
- [ ] Logo upload, SVG sanitise and rasterise per format
- [ ] `compositor.layout`: anchor/margin/size math, shared test vectors with the Studio
- [ ] Placement editor: still frame + live CSS overlay + 9-point grid + sliders
- [ ] `pnp.ctx.theme` injection; theme hash in the cache key
- [ ] Test: logo change → zero Manim jobs (AC-102)

## M5: Formats and variants

- [ ] Format registry, Manim frame geometry per aspect
- [ ] Matrix expansion with include/exclude + cap; `POST /exports/plan`
- [ ] In-export dedupe (AC-104)
- [ ] Variant gallery with thumbnails
- [ ] Resource governor v1 (RAM-aware slots, preview priority)

## M6: Colab, Docker, hardening

- [ ] `colab/PiAndPixel.ipynb`: deps cell (with "skip LaTeX" toggle), Drive mount, start Agent, embed Studio
- [ ] Drive sync of exports; disconnect recovery (FR-105)
- [ ] `docker/Dockerfile` + optional sandbox render mode
- [ ] Security tests from [`security.md`](security.md) §5
- [ ] Playwright E2E following PRD §12.3, extended with brand and variants

## M7: AI assist (P1)

- [ ] `AIProvider` interface; Claude implementation (latest model, key in Agent config)
- [ ] Generate scene from prompt → diff → apply → preview
- [ ] "Fix this error" with traceback + file context, bounded to 3 attempts, user-approved

---

## CTO demo script (end of M5, ~10 minutes)

1. **"No server needed."** Run `pnp studio` on a laptop and show that the browser is at `127.0.0.1` with the capability badge (CPU, RAM, Manim, LaTeX).
2. **Create from starter.** Create *Pythagoras explainer* (3 scenes). Show that it is plain Manim code in Monaco.
3. **Iterate.** Change a colour or text and draft-preview the scene in seconds. Introduce a typo and show the traceback linked to the line. Fix it.
4. **Brand.** Upload the Acme logo, click `top-right`, then switch the preview to 9:16 and set the portrait override to `top-left`. All of this is live, with no render.
5. **Variants.** Choose `main × {16:9, 9:16} × {Default, Acme}`. The plan preview shows *4 variants, 6 unique renders* (or similar). Click **Export**.
6. **Watch.** Live progress per unit and composite; the gallery fills in.
7. **The cheap part.** Move the Acme logo to `bottom-right` and re-export. **Zero** Manim renders run, only composites, and it finishes much faster.
8. **Low-spec story.** Open the Colab notebook. The same Studio renders the same project on Colab, and the export lands in Drive.
9. **ReelMVP path.** Run `pnp export --spec job.json` headless, then show the server-mode diagram in [`architecture.md`](architecture.md) §9: the same `pnp_core`, different host.

## Risks specific to this plan

| Risk | Mitigation |
|---|---|
| Colab terms restrict web UIs on the free tier | Use the Colab-native proxy, verify the terms in M0, fall back to "paid Colab / Kaggle / local only" |
| LaTeX install is slow on Colab | "Skip LaTeX" toggle, cached TinyTeX tarball on Drive, and warnings in the capability badge |
| 8 GB laptops OOM on 1080p 3D scenes | Benchmark-driven memory budget, a single slot on low RAM, draft-first workflow |
| Scenes written for 16:9 look wrong on 9:16 | `pnp.ctx.format` helpers, starter scenes that demonstrate responsive layout, and a gallery that makes problems visible |
| Variant explosion | Plan preview, confirmation, and `max` cap |

## A-05: Narration and timed captions

Expanded from the planned audio-track task in `AGENTS.md`. Start after the Truck exit test so narration builds on stable formats and export variants.

- [x] Draft narration from creator context with OpenAI; creator reviews it before synthesis
- [x] Generate one editable voice segment per composition with Deepgram; keys stay in the Agent environment
- [x] Transcribe generated audio with Deepgram word timestamps; align against the script and flag uncertain words
- [x] Add editable word timings and WebVTT/SRT downloads in the Studio
- [x] Mix narration in the FFmpeg composite stage without rerendering Manim
- [x] Add a 1080×1920, 30 fps, three-minute cross-post profile with final media validation
- [x] Add an A1 narration timeline with move, trim, split, enable/disable, delete, and mix enabled clips during export without rerendering matching scenes
- [ ] Add per-clip voice generation, burned-in caption styling, safe-zone preview, and audio level controls

The existing `portrait` format already produces 1080×1920 at 30 fps when exported at 1080p. A cross-post profile should keep the video at 9:16 and cap duration at three minutes, with platform-specific checks kept separate because platform rules can change.
