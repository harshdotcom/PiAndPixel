# Security Model

Pi & Pixel executes Python code: the user's own, AI-generated, or imported from templates. The PRD's security requirements (§9) still apply. What changes in the MVP is **whose machine the code runs on**, and that shifts which threats matter most.

## 1. Threat model by compute target

| Threat | Local / Docker | Colab | Server mode (future) |
|---|---|---|---|
| Malicious code harming *the host* | Low: user's own code on own machine. **Medium** for imported templates | Low: disposable VM, but Drive is mounted | **High**: multi-tenant |
| Other sites in the user's browser calling the Agent (CSRF, DNS rebinding) | **High** | Medium | n/a |
| Agent reachable from the network or internet | Medium (if `--host 0.0.0.0`) | **High** if a public tunnel is used | **High** |
| Code reading secrets (AI key, tokens) | Medium | Medium | **High** |
| Resource exhaustion freezing the machine | **High** (8 GB laptops) | Medium (session dies) | High |
| Path traversal through file API | **High** | **High** | **High** |

## 2. Controls in the MVP

**API boundary (SEC-005)**
- Random bearer token per Agent start. It is required on every REST route and on the WebSocket (`?token=` is accepted only for the WS handshake, and only from an allowed `Origin`).
- Bind `127.0.0.1` by default. Non-loopback binding needs an explicit flag and prints a warning.
- `Host` header allowlist (rejects DNS rebinding) and a strict CORS `Origin` allowlist.
- Request size limits (bodies over 1 MB get 413, bodies without a length get 411, render `params` over 64 KB get 422), and server-side schema validation (pydantic) for every input.
- The terminal endpoint is served only when the Agent is bound to loopback. It is on by default for `pnp studio` and turned off with `--no-terminal`; it is never served on a non-loopback bind. The shell gets an **allowlisted** environment: `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `LANG`, `LC_*`, `COLUMNS`, `LINES` from the Agent, plus `TERM=xterm-256color`. Nothing else is passed (not the token, not API keys), because everything the shell prints reaches the browser.

**Filesystem (SEC-003)**
- All file operations go through `safe_join(project_root, user_path)`, which resolves symlinks and rejects any path outside the root. The file API also refuses any path that leads into `.pnp/` or `.git/`, checked on every segment both as written and after resolving symlinks. Symlink rule: read, create, save and the rename target follow a symlink only when its fully resolved target is inside the project and outside `.pnp/`, `.git/`, `media/` and `__pycache__/` (writes are refused in those folders even without a link); delete and rename refuse a path whose last segment is a symlink (`400 invalid_path`), so they never act on its target. Written content follows the read rules (no NUL, at most 1 MB), and a file's size is checked with `stat()` before it is read. File-system errors become `storage_error`, never a 500. It is covered by a test suite of malicious names (`..`, absolute paths, NUL bytes, Windows drive letters, symlink escapes, unicode look-alikes).
- Uploads (logos, assets) are checked for type by content sniffing and size. SVGs are sanitised (scripts and external references stripped) before rasterising.
- Archive import (P1) checks for zip-slip and enforces a size and file-count cap.
- Renders run in a scratch copy of the revision, not in the live project. Revision snapshot files are made read-only when written, and a stored snapshot is reused only if its files still match its manifest hashes; otherwise it is discarded and taken again.

**Execution (SEC-001, SEC-004)**
- User code never runs inside the Agent process. Scene discovery uses AST parsing first.
- Each render is a subprocess in its own session/process group, with wall-clock timeout, memory and process rlimits, an output-size watchdog and kill-tree on cancel.
- The subprocess environment is **allowlisted**: `PATH`, `HOME` (scratch), `PNP_RENDER_CONTEXT`, locale. The Agent token, the AI API key and any other env vars are **not** inherited.
- **Docker sandbox (opt-in, P1):** `--network none`, read-only source mount, writable scratch only, `--memory`, `--cpus`, `--pids-limit`, non-root user. Recommended when rendering imported or community projects.
- **Network (SEC-002):** in local subprocess mode the OS does not block outbound network, and we document this honestly. Docker sandbox and server mode enforce no-network.
- **Same-user processes:** in local subprocess mode a render runs as the same OS user as the Agent, so it can read `/proc/<pid>/environ` of the Agent, of `uv`, and of the shell that started them. A `PNP_TOKEN` or `ANTHROPIC_API_KEY` exported there is therefore readable by scene code, even though the render's own environment is allowlisted. Leave `PNP_TOKEN` unset: the Agent then generates the token in memory, which a render cannot read when Yama `ptrace_scope` is 1 or higher (the Ubuntu default: a process may only read the memory of its own descendants). Use the Docker sandbox for code you do not trust.

**AI (SEC-006, P1)**
- The API key is stored server-side only (Agent config file, `0600`) and never sent to the browser.
- Only the current file(s), the selected error log and Manim docs snippets are sent to the provider. The Studio shows exactly what will be sent.
- AI output is shown as a diff. It is applied only on user click, and runs only through the normal render pipeline.

## 3. Colab-specific notes

- Prefer **Colab's own port proxy** (`google.colab.output.serve_kernel_port_as_iframe/window`). That URL is tied to the user's Google session, so it is not public.
- Third-party tunnels (cloudflared, ngrok) create **public** URLs. If they are ever enabled: token required, terminal forced off, and the user is warned. They are also subject to Colab's terms (see [ADR-0005](decisions/0005-colab-runtime-mode.md)).
- Drive is mounted read-write. Render subprocesses run with cwd and `HOME` in a scratch dir on local disk. They are not prevented from reading Drive in subprocess mode; this is documented.

## 4. Server mode (future): restoring full PRD §9

Containers or gVisor per job, no network, per-tenant storage prefixes with signed URLs, Postgres row-level ownership checks, rate limits per tenant, secrets in a vault, and audit logs. PRD AC-009 and AC-010 become mandatory gates.

## 5. Security tests (Phase 6)

- Every route returns 401 without a token and 403 for a bad `Host`/`Origin` (AC-106).
- Path-traversal corpus against the file, brand and asset APIs.
- A render that allocates beyond the memory limit is killed and reported as a `resource_limit` error (the job error starts with `resource_limit:`).
- `fork` bomb / `sleep 1e9` scenes are killed by the limits and the timeout.
- Cancel kills grandchildren (LaTeX, ffmpeg spawned by Manim).
- The subprocess cannot see `PNP_TOKEN` or `ANTHROPIC_API_KEY` in its environment.
- Docker sandbox mode: outbound socket connect fails (AC-010).
