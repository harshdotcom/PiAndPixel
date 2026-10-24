# Architecture

This document describes the components of Pi & Pixel, how data moves between them, and where the trust boundaries are. It extends PRD §7 for **bring-your-own compute** ([ADR-0001](decisions/0001-bring-your-own-compute.md)).

## 1. Guiding principles

1. **Control plane in the browser, compute on the user's machine.** The Studio never renders. The Agent does all CPU, RAM and disk work.
2. **One render core, many hosts.** `pnp_core` is a headless library. The local Agent, the Colab Agent, the CLI and the future ReelMVP server workers all call the same code.
3. **Manim stays untouched.** We orchestrate the `manim` process; we never re-implement Manim classes (PRD §1.3, FR-009).
4. **Render once, composite many.** Expensive Manim renders are keyed by what actually changes the pixels. Branding overlays, ordering, audio and encoding run as a cheap FFmpeg composite step.
5. **Modular monolith.** One Agent process plus render subprocesses. No microservices until measured load requires them (PRD Risk 6).

---

## 2. System context

```mermaid
flowchart TB
    user(["Creator"])

    subgraph browser["Browser (control plane only)"]
        studio["Pi & Pixel Studio<br/>React SPA"]
    end

    subgraph target["Compute target: Local PC · Docker · Google Colab"]
        agent["Pi & Pixel Agent<br/>FastAPI + job queue"]
        core["pnp_core<br/>render pipeline"]
        proc["Render subprocesses<br/>manim · ffmpeg · ffprobe"]
        disk[("Workspace<br/>projects + .pnp state")]
        agent --> core --> proc
        core --> disk
        agent --> disk
    end

    ai["AI provider (optional, P1)<br/>Claude API"]
    drive[("Google Drive<br/>Colab persistence")]

    user --> studio
    studio <-->|"REST + WebSocket<br/>Bearer token"| agent
    agent -->|"prompt + code + logs<br/>only when user asks"| ai
    disk <-.->|"Colab only"| drive
```

### Compute targets

| Target | Who it's for | How the browser reaches it | Persistence |
|---|---|---|---|
| **Local** | Developers and creators with a decent PC | `http://127.0.0.1:7860`, bound to loopback only | Local folder |
| **Docker** | Anyone who wants no dependency setup | Published to `127.0.0.1` only | Bind-mounted folder |
| **Colab** | Users with low-spec machines | Colab's built-in port proxy, inside or next to the notebook | Google Drive (synced) |
| **Server** *(post-MVP, ReelMVP)* | ReelMVP production | Hosted control plane, with Agents in worker mode | Postgres + S3 |

---

## 3. Agent internals

```mermaid
flowchart LR
    subgraph agent["Pi & Pixel Agent (one process)"]
        direction TB
        http["HTTP / WS layer<br/>auth · CORS · Host check"]
        static["Static Studio bundle"]
        proj["Project service<br/>files · revisions · safe paths"]
        brand["Brand service<br/>brand kits · logo assets"]
        comp["Composition &amp; Variant service<br/>expand matrix → plan"]
        disc["Scene discovery"]
        orch["Job orchestrator<br/>SQLite queue · leases · DAG"]
        res["Resource governor<br/>RAM/CPU-aware concurrency"]
        term["Terminal (PTY)<br/>local mode only"]
        aisvc["AI service (P1)<br/>provider interface"]
        art["Artifact service<br/>metadata · playback · download"]
        db[("state.db<br/>SQLite")]

        http --> static
        http --> proj & brand & comp & disc & orch & art & term & aisvc
        comp --> orch
        orch --> res
        proj & orch & art --> db
    end

    subgraph workers["Worker pool (subprocesses)"]
        rs["Scene renderer<br/>manim CLI"]
        cp["Compositor<br/>ffmpeg"]
        va["Validator<br/>ffprobe"]
    end

    orch -->|"spawn with rlimits,<br/>timeout, process group"| rs & cp & va
    disc -->|"isolated subprocess"| rs
```

| Module | Responsibility | PRD ref |
|---|---|---|
| HTTP/WS layer | REST `/api/v1`, event stream, token auth, CORS allowlist, Host-header check (prevents DNS rebinding) | §7.5, SEC-005 |
| Project service | Create/open/rename/delete, file CRUD through `safe_join`, immutable revision snapshots | FR-001…007 |
| Scene discovery | AST scan first (no execution); optional import-based discovery inside a render subprocess | FR-011, FR-012 |
| Brand service | Brand-kit CRUD, logo upload and validation (PNG/SVG, size limits), placement config | FR-110…114 |
| Composition & Variant service | Compositions (videos), formats, variant matrix expansion, render-plan preview and dedupe | FR-120…126 |
| Job orchestrator | Durable queue in SQLite, job DAG (scene units → composite → validate), leases, retry, cancel, crash recovery | FR-010, 017…020 |
| Resource governor | Picks worker concurrency from free RAM and CPU; previews take priority over final renders | §8.4, FR-103 |
| Workers | Subprocesses: `manim`, `ffmpeg`, `ffprobe`. Never inside the API process | SEC-001, SEC-004 |
| Artifact service | Artifact metadata, range-request playback, authorized download, retention | FR-025…027 |
| Terminal | PTY over WebSocket, enabled only on loopback-bound local mode | FR-008 |
| AI service (P1) | Generate, modify and debug through a provider interface; output is shown as a diff and never auto-run | FR-028…032 |

---

## 4. Package boundaries

```mermaid
flowchart LR
    sdk["pnp (sdk)<br/>ctx: format · theme · params<br/>zero heavy deps"]
    core["pnp_core<br/>project model · planner · manim runner<br/>compositor · validator · cache keys"]
    agent["pnp_agent<br/>FastAPI · SQLite queue · auth<br/>serves Studio"]
    cli["pnp CLI<br/>doctor · studio · render · export"]
    studio["studio/<br/>React SPA"]
    reel["ReelMVP workers<br/>(future)"]

    agent --> core
    cli --> core
    cli --> agent
    reel --> core
    studio -. "HTTP only" .-> agent
    core -. "injects ctx via<br/>PNP_RENDER_CONTEXT" .-> sdk
```

- **`pnp` (sdk)** is imported *inside the user's scene process*. It must stay tiny and safe to import anywhere, and it falls back to defaults when no context is present.
- **`pnp_core`** has no web dependencies. This is the piece ReelMVP will reuse.
- **`pnp_agent`** is the only package that knows about HTTP, auth and the browser.

---

## 5. Render flow (one export)

```mermaid
sequenceDiagram
    autonumber
    participant S as Studio
    participant A as Agent API
    participant O as Orchestrator
    participant M as manim (subprocess)
    participant F as ffmpeg/ffprobe
    participant D as Disk / state.db

    S->>A: POST /projects/{id}/exports {composition, variants}
    A->>D: snapshot immutable revision (source hash)
    A->>O: plan = expand variants → render units + composites
    O->>D: dedupe units by cache key, persist job DAG
    A-->>S: 202 {export_id, jobs[]}
    loop each missing render unit (parallel, resource-limited)
        O->>M: manim -r W,H --fps N scene.py Class (ctx via env)
        M-->>O: stdout/stderr stream, exit code
        O-->>S: WS: job progress / logs
        O->>F: ffprobe scene clip → validate
        O->>D: store unit artifact + metadata
    end
    loop each variant
        O->>F: concat clips + logo overlay + audio → single encode
        O->>F: ffprobe: stream, duration ≤ 1800s, WxH, fps
        O->>D: publish final artifact (atomic rename)
    end
    O-->>S: WS: export completed
    S->>A: GET /artifacts/{id}/download
```

Details: [`rendering-pipeline.md`](rendering-pipeline.md).

---

## 6. Variants: render once, composite many

```mermaid
flowchart LR
    subgraph matrix["Variant matrix: main × {16:9, 9:16} × {Default, Acme}"]
        v1["main · 16:9 · Default"]
        v2["main · 16:9 · Acme"]
        v3["main · 9:16 · Default"]
        v4["main · 9:16 · Acme"]
    end

    subgraph units["Scene render units (expensive, Manim)"]
        u1["Intro@16:9·themeA"]
        u2["Proof@16:9·themeA"]
        u3["Intro@9:16·themeA"]
        u4["Proof@9:16·themeA"]
    end

    v1 & v2 --> u1 & u2
    v3 & v4 --> u3 & u4

    subgraph comp["Composites (cheap, FFmpeg)"]
        c1["+ Default logo top-right"]
        c2["+ Acme logo top-left"]
    end
    u1 & u2 --> c1 & c2
```

If both brands share the same **theme** (colours and fonts used *inside* scenes), the four variants need only **four Manim renders, not eight**. Changing a logo's position, size or opacity re-runs only the composite step. A different theme or format creates new render units, because the pixels really do change.

---

## 7. Data model (SQLite in MVP, Postgres in server mode)

```mermaid
erDiagram
    PROJECT ||--o{ REVISION : snapshots
    PROJECT ||--o{ SCENE : contains
    PROJECT ||--o{ BRAND_KIT : has
    PROJECT ||--o{ COMPOSITION : defines
    COMPOSITION ||--o{ CLIP : "ordered clips"
    CLIP }o--|| SCENE : references
    PROJECT ||--o{ EXPORT : requests
    EXPORT ||--o{ VARIANT : "matrix rows"
    VARIANT }o--|| COMPOSITION : of
    VARIANT }o--|| BRAND_KIT : uses
    JOB }o--|| REVISION : "pinned to"
    JOB ||--o{ JOB_ATTEMPT : retries
    JOB ||--o{ JOB : "depends on"
    RENDER_UNIT ||--o| ARTIFACT : produces
    VARIANT ||--o| ARTIFACT : "final mp4"

    PROJECT { string id string name string path datetime created_at }
    REVISION { string id int number string source_hash json manifest }
    SCENE { string id string file string class_name }
    BRAND_KIT { string id string name json logo json theme string theme_hash }
    COMPOSITION { string id string name json clips }
    EXPORT { string id string revision_id json matrix string status }
    VARIANT { string id string format string brand_id json params string composite_key }
    RENDER_UNIT { string cache_key string scene_id string format string theme_hash json params string quality }
    JOB { string id string type string status datetime lease_until int priority }
    JOB_ATTEMPT { string id int n int exit_code string log_path string error_summary }
    ARTIFACT { string id string kind string storage_key float duration int width int height float fps string sha256 }
```

The state database is one SQLite file per workspace, **`<workspace>/.pnp/state.db`** (WAL mode, plain `sqlite3` with numbered SQL migrations, see [ADR-0006](decisions/0006-sqlite-stdlib-job-queue.md)). It holds revisions, exports, jobs, job dependencies and job attempts. Revision snapshots, attempt logs and artifacts are files under each project's `.pnp/` folder.

Projects, scenes, brand kits and compositions live **in files** (`pnp.yaml`, `brand.yaml`, `scenes/*.py`) so that they are portable and git-friendly. The database **indexes** them and stores job state and artifact metadata. Binary media are never stored in the database (PRD §7.4).

**Single-user MVP:** the PRD's `User` / `owner_id` model is deferred. Each Agent belongs to one person and is protected by a token. Ownership columns come back in server mode ([ADR-0002](decisions/0002-local-first-storage-and-queue.md)).

---

## 8. Trust boundaries

```mermaid
flowchart TB
    subgraph b0["Untrusted: network"]
        net["Anything that can reach the Agent's port<br/>(other sites in the browser, LAN, tunnel URL)"]
    end
    subgraph b1["Boundary 1: Agent API"]
        api["Token auth · Host/Origin checks · input validation · safe paths"]
    end
    subgraph b2["Boundary 2: Render subprocess"]
        sub["User/AI/template Python code<br/>rlimits · timeout · own process group · scratch dir<br/>optional Docker: --network none, read-only mounts"]
    end
    subgraph b3["Trusted: Agent internals"]
        int["state.db · tokens · AI API key · other projects"]
    end
    net --> api --> int
    int --> sub
    sub -. "must not read" .-x int
```

Full threat model per compute target: [`security.md`](security.md).

---

## 9. Future: server mode for ReelMVP (post-MVP)

```mermaid
flowchart LR
    reelui["ReelMVP UI / Studio"] --> cp
    subgraph cloud["Our infrastructure"]
        cp["Control plane API<br/>auth · multi-tenant · billing"]
        pg[("Postgres")]
        q[["Queue<br/>Redis / SQS"]]
        s3[("S3 artifacts")]
        cp --> pg & q
        subgraph pool["Autoscaled render workers"]
            w1["pnp_core worker<br/>sandboxed container"]
            w2["pnp_core worker"]
        end
        q --> w1 & w2
        w1 & w2 --> s3
    end
    byo["User's own Agent<br/>(local / Colab) in worker mode"] -. "optional: pulls jobs<br/>outbound only" .-> q
```

What carries over unchanged: `pnp_core`, the `pnp` sdk, the project format, the job spec, and the Studio components. What changes: auth becomes multi-tenant, SQLite becomes Postgres, the in-process queue becomes Redis/SQS, disk becomes S3, and sandboxing becomes mandatory (containers or gVisor, no network), which restores the full PRD §9 model.
