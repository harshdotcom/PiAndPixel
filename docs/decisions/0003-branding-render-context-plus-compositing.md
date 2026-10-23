# ADR-0003: Branding = theme injected into scenes + logo applied at composite time

**Status:** Proposed · **Date:** 2026-10-24

## Context
Brands need logos in configurable positions and brand colours/fonts. If the logo were drawn inside Manim, every logo tweak and every brand variant would need a full re-render, which is the most expensive operation in the system.

## Decision
Split branding by what it affects:
1. **Theme** (colours, font) is *content*. It is passed into scenes via `pnp.ctx.theme` (env-pointed JSON file), and its hash is part of the render-unit cache key.
2. **Logo / watermark** is *packaging*. It is applied with an FFmpeg `overlay` during the single composite encode. Placement math lives in `pnp_core.compositor.layout` and is shared (via test vectors) with the Studio's live CSS preview.

## Consequences
- ✅ Moving or resizing a logo costs one encode, not N Manim renders (AC-102).
- ✅ Brands that share a theme share all Manim renders (AC-104).
- ✅ Scenes stay plain Manim; `ctx` falls back to defaults outside Pi & Pixel.
- ⚠️ Logos cannot be *animated by Manim* (for example, morphing into a shape). If needed, a scene can import the logo as an asset explicitly; that is then content, not packaging.
- ⚠️ Fonts in `theme.font` must exist on the compute target → the capability report lists fonts; brand kits can bundle font files in `assets/`.
