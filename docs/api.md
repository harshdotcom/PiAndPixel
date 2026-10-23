# Agent API (v1, draft)

The base path is `/api/v1`. All routes require `Authorization: Bearer <token>`. JSON in and out. Long-running work always returns `202` with job ids. Nothing blocks on a render (PRD FR-017).

This is the contract the Studio is built against. It is illustrative until Phase 2 freezes it with an OpenAPI schema generated from the FastAPI models.

## Agent

| Method | Path | Purpose |
|---|---|---|
| GET | `/agent` | Capability report: target, CPU, RAM, disk, versions, features (FR-101) |
| GET | `/agent/health` | Liveness; no auth (returns no data) |

## Projects and files

| Method | Path | Purpose |
|---|---|---|
| GET / POST | `/projects` | List / create (from template or blank) |
| GET / PATCH / DELETE | `/projects/{pid}` | Read / rename / delete (DELETE requires `?confirm=<name>`) |
| GET | `/projects/{pid}/files` | File tree |
| GET / PUT / DELETE | `/projects/{pid}/files/{path}` | Read / save (with `If-Match` etag) / delete one file |
| POST | `/projects/{pid}/scenes/discover` | AST discovery → scene list + errors |
| GET | `/projects/{pid}/revisions` | Revision history |

## Brands

| Method | Path | Purpose |
|---|---|---|
| GET / POST | `/projects/{pid}/brands` | List / create brand kit |
| GET / PUT / DELETE | `/projects/{pid}/brands/{name}` | Brand kit (logo placement, theme) |
| PUT | `/projects/{pid}/brands/{name}/logo` | Upload logo (multipart) |
| GET | `/projects/{pid}/brands/{name}/preview?format=portrait&t=1.5` | Still frame with logo for the placement editor |

## Compositions, renders, exports

| Method | Path | Purpose |
|---|---|---|
| GET / PUT | `/projects/{pid}/compositions` | Read / write compositions (stored in `pnp.yaml`) |
| POST | `/projects/{pid}/renders` | Render one scene: `{scene, format, brand?, params?, quality}` → `202 {job_id}` |
| POST | `/projects/{pid}/exports/plan` | Dry-run a matrix → `{variants, units_total, units_unique, units_cached}` (FR-122) |
| POST | `/projects/{pid}/exports` | Start export (body = job spec, `Idempotency-Key` header) → `202 {export_id, jobs}` |
| GET | `/exports/{eid}` | Export status + variants |
| GET | `/jobs/{jid}` | Job status, attempts, error summary |
| POST | `/jobs/{jid}/cancel` | Cancel (FR-019) |
| POST | `/jobs/{jid}/retry` | New attempt (FR-020) |
| GET | `/jobs/{jid}/logs?attempt=n` | Full log text |

## Artifacts

| Method | Path | Purpose |
|---|---|---|
| GET | `/artifacts/{aid}` | Metadata (duration, WxH, fps, sha256, source revision) |
| GET | `/artifacts/{aid}/stream` | Range-request playback |
| GET | `/artifacts/{aid}/download` | Attachment download |
| GET | `/exports/{eid}/download.zip` | All variants + manifest (P1) |

Artifact ids are opaque UUIDs. The client never sends storage paths (PRD FR-027).

## Terminal (local mode only)

`WS /terminal?project={pid}`: a PTY in the project directory. Disabled unless enabled, as described in [`security.md`](security.md).

## Events

`WS /events`: one stream per Studio tab.

```json
{"type": "job.status",   "job_id": "…", "status": "running", "attempt": 1}
{"type": "job.progress", "job_id": "…", "animations_done": 4, "current_pct": 62, "elapsed_s": 18.4}
{"type": "job.progress", "job_id": "…", "kind": "composite", "pct": 41.0}
{"type": "job.log",      "job_id": "…", "stream": "stderr", "line": "…"}
{"type": "export.status","export_id": "…", "units_done": 6, "units_total": 8, "variants_done": 1, "variants_total": 4}
{"type": "agent.resources", "free_ram_mb": 2210, "slots": 1, "queued": 5}
```

## Errors

```json
{"error": {"code": "scene_not_found", "message": "No Scene subclass 'Proof' in scenes/proof.py", "details": {...}}}
```

Stable codes include `unauthorized`, `forbidden_origin`, `not_found`, `invalid_path`, `validation_error`, `scene_not_found`, `python_syntax_error`, `latex_missing`, `resource_limit`, `timeout`, `duration_exceeded`, `matrix_too_large`, `conflict` (etag), and `storage_error`.
