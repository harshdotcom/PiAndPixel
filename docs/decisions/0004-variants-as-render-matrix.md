# ADR-0004: Multiple videos and variations as compositions × a variant matrix

**Status:** Proposed · **Date:** 2026-10-24

## Context
ReelMVP needs the same lesson as a long 16:9 video, a 9:16 reel, a teaser, in several brands and languages. Copy-pasting projects per variation does not scale and wastes renders.

## Decision
- A project defines several **compositions** (videos): ordered clips, each a scene plus params.
- An **export** is a matrix over `composition × format × brand × params.*` with include/exclude rules and a cap.
- The planner expands the matrix into **render units** (keyed by everything that changes Manim pixels) and **composites** (one per variant). It dedupes units before queuing and shows the counts before the user confirms.

## Consequences
- ✅ One source of truth per lesson; N outputs.
- ✅ The cost is visible before rendering (`/exports/plan`).
- ✅ The same mechanism serves ReelMVP batch generation via the job spec.
- ⚠️ Authors must make scenes layout-aware for 9:16 (`ctx.format`); starter templates must model this well.
- ⚠️ A cap is needed to prevent accidental combinatorial explosions (default 24).
