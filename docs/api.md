# Agent API (v1, draft)

The base path is `/api/v1`. All routes require `Authorization: Bearer <token>`. JSON in and out. Long-running work always returns `202` with job ids. Nothing blocks on a render (PRD FR-017).

This is the contract the Studio is built against. It is illustrative until Phase 2 freezes it with an OpenAPI schema generated from the FastAPI models.

## Agent

| Method | Path | Purpose |
|---|---|---|
| GET | `/agent` | Capability report: target, CPU, RAM, disk, versions, features (FR-101), and `render_options` (below) |
| GET | `/agent/health` | Liveness; no auth (returns no data) |

`render_options` lists the output choices, so the Studio does not hard-code them:

```json
{"resolutions": [{"id": "480p", "short_edge": 480}, {"id": "720p", "short_edge": 720}, {"id": "1080p", "short_edge": 1080}, {"id": "1440p", "short_edge": 1440}, {"id": "2160p", "short_edge": 2160}],
 "fps": [15, 24, 30, 60], "max_long_edge": 3840, "default": {"resolution": "480p", "fps": 15}}
```

## Projects and files

| Method | Path | Purpose |
|---|---|---|
| GET / POST | `/projects` | List / create (from template or blank) |
| GET / PATCH / DELETE | `/projects/{pid}` | Read / rename / delete (DELETE requires `?confirm=<name>`) |
| GET | `/projects/{pid}/files` | File tree `{entries: [{path, type, size}]}` (no `.pnp`, `.git`, `__pycache__`, `media`, symlinks) |
| POST | `/projects/{pid}/files` | Create a text file `{path, content}` → `201 {path, etag}`; exists → `409 already_exists` |
| GET | `/projects/{pid}/files/{path}` | `{path, content, etag}` + `ETag` header; text (UTF-8) files ≤ 1 MB only |
| PUT / DELETE | `/projects/{pid}/files/{path}` | Save `{content}` / delete. `If-Match: "<etag>"` required (428 without, 412 `conflict` when stale) |
| POST | `/projects/{pid}/files/rename` | `{from, to}` → `{path, etag}`; target exists → `409 already_exists` |

Writes (create, save, rename target) are refused with `400 invalid_path` inside `.pnp`, `.git`, `media` or `__pycache__` (also when reached through a symlink) and under an existing file; content with a NUL byte → `415`. Delete and rename refuse a symlink itself (`400`), so they never act on its target.
| GET | `/projects/{pid}/scenes` | AST discovery → `{scenes: [{ref, file, class_name, line}], errors: [{file, line, message}]}` |
| GET | `/projects/{pid}/revisions` | Revision history `[{id, created_at, file_count, total_bytes}]`, newest first |

## Brands (planned — Truck stage)

These routes are **planned — Truck stage** (T-01 to T-05); they do not exist yet and return `404`.

| Method | Path | Purpose |
|---|---|---|
| GET / POST | `/projects/{pid}/brands` | List / create brand kit |
| GET / PUT / DELETE | `/projects/{pid}/brands/{name}` | Brand kit (logo placement, theme) |
| PUT | `/projects/{pid}/brands/{name}/logo` | Upload logo (multipart) |
| GET | `/projects/{pid}/brands/{name}/preview?format=portrait&t=1.5` | Still frame with logo for the placement editor |

## Compositions, renders, exports

| Method | Path | Purpose |
|---|---|---|
| GET / PUT | `/projects/{pid}/compositions` | `{compositions, etag}`; PUT `{compositions}` with `If-Match` = etag of `pnp.yaml` |
| POST | `/projects/{pid}/renders` | Render one scene: `{scene, format, params?, resolution?, fps?, quality?}` (`brand` comes in Truck) → `202 {job_id, revision_id}` |
| POST | `/projects/{pid}/exports/plan` | **Planned — Truck stage (T-08); not implemented.** Dry-run a matrix → `{variants, units_total, units_unique, units_cached}` (FR-122) |
| POST | `/projects/{pid}/exports` | Start export `{composition, format, resolution?, fps?, quality?}` (`Idempotency-Key` header) → `202 {export_id, job_ids, revision_id}` |
| GET | `/exports?project={pid}` | Exports, newest first |
| GET | `/exports/{eid}` | Export status (units done/total, composite job, artifact) |
| POST | `/exports/{eid}/cancel` | Cancel the composite and every unfinished unit |
| POST | `/exports/{eid}/retry` | Retry every failed/cancelled/interrupted/timed-out job of the export |
| GET | `/jobs?project={pid}&kind=render` | Jobs, newest first, at most 100 (both filters optional; unknown `kind` → 422) |
| GET | `/jobs/{jid}` | Job status, attempts, error summary |
| POST | `/jobs/{jid}/cancel` | Cancel (FR-019) |
| POST | `/jobs/{jid}/retry` | New attempt (FR-020) on the job's own revision; `blocked` instead of `queued` while one of its own dependencies is still failed |
| GET | `/jobs/{jid}/logs?attempt=n` | Full log text (default: latest attempt) |

**Output size.** `resolution` (`480p`, `720p`, `1080p`, `1440p`, `2160p`) sets the format's *short* edge; the long edge keeps the format's aspect, rounded to the nearest even number (landscape 480p = 854×480, portrait 720p = 720×1280, square 1080p = 1080×1080). `fps` is one of 15, 24, 30, 60. Both win over `quality`, which stays as a shortcut: `draft` = 480p @ 15, `preview` = 720p @ 30, `final` = 1080p @ the format's fps. With only `resolution`, `quality` (what scenes see as `ctx.quality`) follows it: below 720p draft, 720p preview, 1080p and up final; fps then comes from that preset. With none of them, renders use `draft` and exports `final`. An unknown resolution or fps, or a long edge over 3840 px for this format, → `422 validation_error`. Renders at 1080p and up get the final (lower) queue priority.

Each job's `request`, each export and each artifact's `meta` record `quality`, `resolution`, `fps`, `width` and `height`. The `Idempotency-Key` check compares composition, format and all of these, so the same key with another resolution or fps → `409 conflict`.

## Artifacts

| Method | Path | Purpose |
|---|---|---|
| GET | `/artifacts/{aid}` | Metadata (duration, WxH, fps, sha256, `meta` with the source revision) plus signed `stream_url` and `download_url` |
| GET | `/artifacts/{aid}/stream?sig=…` | Range-request playback |
| GET | `/artifacts/{aid}/download?sig=…` | Attachment download |
| GET | `/exports/{eid}/download.zip` | **Planned — Truck stage (variants); not implemented.** All variants + manifest |

Artifact ids are opaque UUIDs. The client never sends storage paths (PRD FR-027). `stream` and `download` take the `sig` from the metadata URLs instead of the bearer token, so a `<video>` tag can load them; a wrong `sig` → `403 forbidden`. Exports are artifacts with `kind: "export"`.

## Terminal (local mode only)

`WS /terminal?project={pid}&token=…`: a PTY in the project directory. Only served when the Agent is bound to loopback and not started with `--no-terminal` (`GET /agent` → `features.terminal`). JSON text frames: client → `{"type":"input","data":"…"}`, `{"type":"resize","cols":120,"rows":30}`; server → `{"type":"output","data":"…"}`, `{"type":"exit","code":0}`.

WebSocket auth: browsers cannot set headers on a WebSocket, so both WS routes take the token as `?token=`, and only with an allowed `Origin`. A refused handshake is closed with 4401 (token), 4403 (Host/Origin, terminal disabled) or 4404 (unknown project).

## Events

`WS /events`: one stream per Studio tab.

```json
{"type": "job.status",   "job_id": "…", "project": "demo", "kind": "render", "export_id": null, "status": "running", "attempt": 1, "error": null, "error_code": null, "artifact_id": null}
{"type": "job.progress", "job_id": "…", "project": "demo", "kind": "render", "animations_done": 4}
{"type": "job.progress", "job_id": "…", "project": "demo", "kind": "composite", "pct": 41.0}
{"type": "job.log",      "job_id": "…", "project": "demo", "attempt": 1, "line": "…"}
{"type": "export.status","export_id": "…", "project": "demo", "status": "running", "units_done": 2, "units_total": 3, "artifact_id": null, "error": null}
```

Server → client only; client messages are ignored. Render output is one merged stream (stdout + stderr). A client that falls more than 1000 events behind is disconnected and should reconnect and refetch. `agent.resources` and variant counts come with the resource governor and variants (Truck).

## Errors

```json
{"error": {"code": "scene_not_found", "message": "No Scene subclass 'Proof' in scenes/proof.py", "details": {...}}}
```

Stable codes include `unauthorized`, `forbidden_origin`, `not_found`, `invalid_path`, `validation_error` (always HTTP 422), `payload_too_large` (body over 1 MB, 413), `length_required` (411), `scene_not_found`, `python_syntax_error`, `latex_missing`, `resource_limit`, `timeout`, `duration_exceeded`, `matrix_too_large`, `conflict` (stale etag, 412; also 409 for an existing project folder), `already_exists` (409), `unsupported_file` (binary or non-UTF-8, 415), `precondition_required` (`If-Match` missing, 428), `invalid_state` (cancel/retry not allowed in this job status, 409), and `storage_error` (the file system refused a file operation, e.g. permission denied, 409).
