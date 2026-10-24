# ADR-0002: SQLite + filesystem instead of Postgres + Redis + S3 for the MVP

**Status:** Proposed · **Date:** 2026-10-24

## Context
PRD §7.2 recommends PostgreSQL, Redis and S3. Under [ADR-0001](0001-bring-your-own-compute.md), each Agent serves one user on their own machine or a Colab VM, where running three extra services is unreasonable.

## Decision
- Metadata and job state: **SQLite** at `<workspace>/.pnp/state.db`, in WAL mode. Migrations: numbered SQL files on stdlib `sqlite3` ([ADR-0006](0006-sqlite-stdlib-job-queue.md) replaced Alembic).
- Queue: **durable SQLite queue** with leases, priorities and dependencies, behind a `Queue` interface.
- Artifacts: **local filesystem** behind an `ArtifactStore` interface; atomic rename on publish.
- Authored content (`pnp.yaml`, `brand.yaml`, scenes) stays in **files**; the DB indexes it.

## Consequences
- ✅ `pnp studio` works with zero services; state survives restarts (PRD FR-017).
- ✅ Projects are portable folders that can go in git.
- ⚠️ Single-process writer; fine for one Agent, not for a fleet.
- ↩️ Server mode adds `PostgresRepo`, `RedisQueue`/`SQSQueue` and `S3Store` behind the same interfaces. Ownership columns (`owner_id`) are added then.
