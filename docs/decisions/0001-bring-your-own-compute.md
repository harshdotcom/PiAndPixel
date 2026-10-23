# ADR-0001: Bring-your-own compute (browser controls, user's machine renders)

**Status:** Proposed · **Date:** 2026-10-24

## Context
Manim rendering is CPU-, RAM- and disk-heavy, and a 30-minute 1080p video can take a long time. Hosting render capacity for an unvalidated MVP is costly. Many target users do not have powerful machines. Later, ReelMVP will run this on our own servers.

## Decision
Split the product into a **Studio** (static web UI, control only) and an **Agent** (Python process that owns files, jobs and rendering) running on the user's chosen compute: local PC, Docker, or Google Colab. The render pipeline lives in a headless library, `pnp_core`, so the same code can run inside ReelMVP's server workers later.

## Consequences
- ✅ Near-zero infrastructure cost for the MVP; users with weak PCs can use Colab.
- ✅ Clean path to server mode: swap hosts, not pipeline.
- ⚠️ We must support heterogeneous environments (OS, RAM, LaTeX presence) → capability report, `pnp doctor`, Docker image.
- ⚠️ The Agent is a local web server → token auth, loopback binding and Host/Origin checks are mandatory ([security.md](../security.md)).
- ⚠️ Single-user per Agent; accounts are deferred to server mode.

## Alternatives considered
- **Hosted rendering from day one (PRD as written):** highest fidelity to the PRD, but cost and ops burden before validation.
- **Pure in-browser rendering (Pyodide/WASM):** Manim's native deps (Cairo, Pango, LaTeX, FFmpeg) and memory needs make this impractical.
- **Desktop app (Electron/Tauri):** heavier to ship and does not cover Colab; the browser + Agent approach covers both.
