# AGENTS.md: instructions for Claude Code and contributors

Read `README.md`, `docs/architecture.md` and `docs/requirements.md` before changing code. `PRD.txt` is the base spec; `docs/requirements.md` lists the approved deviations.

## Non-negotiables
1. **Never execute user/AI/template Python inside the Agent process.** Use `pnp_core` runners (subprocess with timeout, rlimits, own process group, allowlisted env).
2. **Every user-supplied path goes through `safe_join`.** Never trust client-supplied storage paths or artifact locations.
3. **Do not reimplement Manim.** Orchestrate the `manim` CLI; no substitute animation classes.
4. **`pnp_core` has no web/HTTP dependencies.** The `pnp` sdk has no dependencies beyond the stdlib.
5. **Secrets never reach the browser or render subprocesses** (Agent token, AI keys).
6. **No invented progress.** Report only measured counts or percentages.
7. **Failed work never overwrites good work.** Publish by atomic rename; keep previous artifacts and per-attempt logs.
8. Logo/watermark changes must never cause Manim re-renders (ADR-0003).

## Conventions
- Python 3.12, `uv`, ruff (format + lint), pyright (strict for `pnp_core`), pytest. Config via `pydantic-settings`; no hard-coded limits.
- Studio: TypeScript strict, React, Vite, pnpm, eslint, vitest, Playwright for E2E.
- API models are pydantic; OpenAPI is generated, never hand-edited.
- Database changes go through Alembic migrations.

## Workflow per change (PRD §17.3)
1. State the scope and the planned change.
2. Implement the smallest coherent unit with tests.
3. Run `make check` (lint, types, unit tests); run render integration tests when touching `pnp_core`.
4. Update the relevant doc in `docs/` and the milestone checklist in `docs/implementation-plan.md`.
5. Record significant decisions as a new ADR in `docs/decisions/`.
6. Report what was done, test results, and remaining limitations. Never claim a test passed unless it was run.
