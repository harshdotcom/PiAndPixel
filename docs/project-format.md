# Project Format

A Pi & Pixel project is a plain folder. Everything a user authors is a text file that can be put in git. Generated state lives in `.pnp/` and can be deleted at any time.

```
pythagoras/
├── pnp.yaml                 project manifest (compositions, formats, variants)
├── scenes/
│   ├── intro.py             plain Manim scenes
│   ├── proof.py
│   └── common/shapes.py     shared helpers, importable from scenes
├── brands/
│   ├── default/brand.yaml
│   └── acme/
│       ├── brand.yaml
│       └── logo.svg
├── assets/                  images, fonts, audio
└── .pnp/                    generated: never edit, safe to delete
    ├── revisions/<sha256>/  immutable source snapshots (content-addressed)
    ├── jobs/<id>/attempt-N/ per-attempt log (and scratch while running)
    ├── artifacts/           published MP4s (scene clips and exports) + metadata
    └── cache/units/         render-unit clips keyed by cache key (P1)
```

The job queue and the revision index live in one SQLite file per workspace, `<workspace>/.pnp/state.db` ([ADR-0006](decisions/0006-sqlite-stdlib-job-queue.md)), not inside each project.

> In Colab, the authored files live on Google Drive. `.pnp/cache` and the scratch render directories live on local disk, and only `.pnp/exports` is synced back to Drive.

---

## `pnp.yaml`

```yaml
pnp: 1                          # manifest schema version
name: pythagoras-explainer
description: "Visual proof of the Pythagorean theorem"

engine:
  name: manim                   # only engine in MVP
  version: "0.19.0"             # exact pin; verified in Phase 0

defaults:
  fps: 30
  quality: preview              # draft | preview | final

formats:                        # built-ins can be omitted; shown for clarity
  landscape: { width: 1920, height: 1080 }
  portrait:  { width: 1080, height: 1920 }
  square:    { width: 1080, height: 1080 }

compositions:                   # each composition = one video
  main:
    title: "Pythagoras in 60 seconds"
    clips:
      - scene: scenes/intro.py:Intro
      - scene: scenes/proof.py:Proof
        params: { show_grid: true }
      - scene: scenes/outro.py:Outro
    audio:                      # P1
      file: assets/music.mp3
      volume: 0.4
      fade_out: 2.0

  teaser:
    clips:
      - scene: scenes/proof.py:Proof
        params: { show_grid: false, title: "Why a² + b² = c²" }

variants:                       # default export matrix
  matrix:
    composition: [main, teaser]
    format: [landscape, portrait]
    brand: [default, acme]
    params:
      lang: [en, hi]            # every params.* key multiplies the matrix
  exclude:
    - { composition: teaser, format: landscape }
  max: 24                       # safety cap
```

Validation rules (enforced on save and before rendering):
- Scene references are `path/to/file.py:ClassName`, with paths relative to the project root and no `..`.
- Format dimensions must be even, and the long edge must be ≤ 3840.
- Unknown keys are errors, not silently ignored.
- Total estimated duration is unknown until rendering. The **1,800 s limit is enforced on the real output** (PRD FR-022).

---

## `brands/<name>/brand.yaml`

```yaml
name: Acme Learning

logo:
  file: logo.svg                # PNG with alpha or SVG; ≤ 5 MB
  anchor: top-right             # top-left | top | top-right | left | center | right
                                # | bottom-left | bottom | bottom-right | {x: 0.9, y: 0.1}
  margin: 0.04                  # fraction of shorter frame edge
  width: 0.12                   # fraction of frame width
  opacity: 0.9
  show: { from: 0, until: end, fade: 0.3 }
  per_format:
    portrait: { anchor: top-left, width: 0.2 }
    square:   { width: 0.15 }

watermark: null                 # P1

theme:                          # visible to scenes via pnp.ctx.theme
  background: "#0F1115"
  primary:    "#58C4DD"
  secondary:  "#FC6255"
  accent:     "#FFFF00"
  text:       "#ECECEC"
  font:       "Inter"           # must be installed on the compute target or in assets/

intro: null                     # P1: scene ref prepended to every composition
outro: null                     # P1
safe_zones: true                # P1: avoid platform UI on portrait
```

**What triggers what**

| You change… | Manim re-render? | Composite re-run? |
|---|---|---|
| `logo.*`, `watermark` | No | Yes |
| `theme.*` | Only scenes that render with that theme hash | Yes |
| Scene source, params, format, resolution, fps (or quality) | Yes, for affected render units | Yes |
| Composition clip order, audio | No | Yes |

---

## Render context: the `pnp` sdk

The Agent writes a JSON context file per render unit and passes its path in `PNP_RENDER_CONTEXT`. The sdk exposes it read-only:

```python
from pnp import ctx

ctx.format.name         # "portrait"
ctx.format.width        # 1080
ctx.format.height       # 1920
ctx.format.is_portrait  # True
ctx.format.aspect       # 0.5625
ctx.theme.primary       # "#58C4DD"
ctx.theme.font          # "Inter"
ctx.params.get("lang", "en")
ctx.brand_name          # "acme" (informational; do not draw logos yourself)
ctx.quality             # "draft" | "preview" | "final" (with an explicit resolution: <720p draft, 720p preview, 1080p+ final)
```

When `PNP_RENDER_CONTEXT` is not set (plain `manim` CLI), `ctx` returns defaults: `landscape`, the Manim default dark theme, and empty params. This guarantees AC-105.

The Agent also sets Manim's frame geometry so that `config.frame_width` / `frame_height` match the aspect ratio (frame height stays 8 units; width scales). Scenes written for 16:9 therefore still render on 9:16, just with less horizontal room. Layout adaptation is the author's choice.

---

## Job spec (CLI / ReelMVP contract)

```json
{
  "spec": 1,
  "project": "./pythagoras",
  "revision": "auto",
  "kind": "export",
  "quality": "final",
  "matrix": {
    "composition": ["main"],
    "format": ["portrait"],
    "brand": ["acme"],
    "params": { "lang": ["en", "hi"] }
  },
  "limits": { "max_variants": 24, "job_timeout_s": 3600 },
  "output": { "dir": "./out", "naming": "{composition}-{format}-{brand}-{lang}.mp4" }
}
```

`revision: "auto"` snapshots the current files. A revision id pins an exact earlier snapshot (PRD AC-012).
