# ADR-0005: Google Colab as a supported compute target

**Status:** Proposed. **Needs verification in M0** · **Date:** 2026-10-24

## Context
Users without capable hardware should still be able to render. Colab gives a Linux VM with more RAM than many laptops, at no or low cost. Constraints:
- Sessions are ephemeral (idle and maximum-lifetime disconnects) → local disk is wiped.
- System packages (Cairo/Pango dev, FFmpeg, TeX) must be installed every session.
- **Terms of use:** Colab's free tier lists restrictions on some usage patterns, including remote proxies and web UIs that bypass the notebook. Paid tiers relax some of these. The current terms must be checked before shipping this mode publicly.
- Manim's default (Cairo) renderer is CPU-based, so Colab GPUs give little benefit.

## Decision
- Ship `colab/PiAndPixel.ipynb` with cells to: (1) install deps (with "skip LaTeX" toggle), (2) mount Drive and choose a workspace folder, (3) start the Agent in the background, (4) **show the Studio through Colab's own port proxy** (`google.colab.output.serve_kernel_port_as_iframe` inside the notebook, or `serve_kernel_port_as_window`).
- No third-party tunnel by default. A tunnel option, if added, is opt-in, forces token auth, disables the terminal, and is documented as subject to Colab's terms.
- Authored files live on Drive. Render scratch and the unit cache live on `/content` (fast local disk). Finished exports are copied to Drive.
- On Agent start, interrupted jobs from a previous session are marked `interrupted` and offered for retry.

## Consequences
- ✅ Same Studio and Agent code as local; Colab is only a launcher.
- ⚠️ First-run setup takes minutes (measured in M0 and shown in the notebook).
- ⚠️ If the terms forbid our usage on the free tier, Colab mode becomes "paid Colab / Kaggle / other Jupyter hosts", and the notebook stays generic Jupyter where possible.
