# Render benchmarks (C-08)

Date: 2026-10-24. Local machine only. **Colab numbers are still pending** (Colab was not reachable from the build machine).

## Machine

| | |
|---|---|
| CPU | Intel Core i5-1135G7 @ 2.40 GHz, 8 logical CPUs |
| RAM | 7.6 GB total, about 1.9 GB available during the run |
| OS | Linux 7.0 (x86_64) |
| Tools | Manim Community 0.22.0 (conda-forge), FFmpeg 9.0.2, Python 3.12 |

## Method

- Scenes: `examples/pythagoras` (`Intro`, `Proof`, `Outro`). Text only, no LaTeX.
- Format: landscape. Geometry from `render_geometry` at the time of the benchmark: draft 480x270 @15, preview 960x540 @30, final 1920x1080 @30. (The presets have since changed to draft 854x480 @15 and preview 1280x720 @30; re-run before quoting draft/preview numbers.)
- The same command, env allowlist, render context and frame config that `pnp_core.render_scene` uses, wrapped in `/usr/bin/time -f "%e %M"`.
- One render at a time, caching disabled.
- Peak RSS is the largest resident set of the manim process or any child it waited for (ffmpeg runs in-process through PyAV).

## Results

| Scene | Clip length | Draft time | Draft peak RSS | Preview time | Preview peak RSS | Final time | Final peak RSS |
|---|---|---|---|---|---|---|---|
| Intro | 5.9 s | 1.24 s | 192 MB | 1.80 s | 272 MB | 3.15 s | 610 MB |
| Proof | 6.8 s | 1.09 s | 189 MB | 1.67 s | 290 MB | 3.86 s | 637 MB |
| Outro | 5.2 s | 1.37 s | 196 MB | 1.98 s | 293 MB | 3.33 s | 679 MB |

## Takeaways

- Text scenes are cheap: even final quality stays under 700 MB, so one final render fits an 8 GB laptop with room to spare.
- RSS grows with pixel count (about 3.5x from draft to final), so a `per_job_budget` of roughly 1 GB for final 1080p text scenes is a safe starting point.

## Still pending

- Colab runs of the same table.
- Portrait and square formats, and MathTex / 3D reference scenes (the plan's full matrix). LaTeX is not installed on this machine.
