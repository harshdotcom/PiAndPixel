SHELL := /bin/bash
ENV := source scripts/dev-env.sh &&

.PHONY: setup check lint types test test-render studio-build studio-dev dev

setup:            ## install Python and Studio dependencies
	$(ENV) uv sync
	$(ENV) cd studio && pnpm install

check: lint types test   ## everything CI runs (fast)

lint:
	$(ENV) uv run ruff check . && uv run ruff format --check .
	$(ENV) cd studio && pnpm lint

types:
	$(ENV) uv run pyright
	$(ENV) cd studio && pnpm typecheck

test:
	$(ENV) uv run pytest -q
	$(ENV) cd studio && pnpm test

test-render:      ## slow: really runs manim + ffmpeg
	$(ENV) uv run pytest -q -m render

studio-build:     ## build the Studio into studio/dist (served by the Agent)
	$(ENV) cd studio && pnpm build

dev:              ## run the Agent on ./workspace with the built Studio
	$(ENV) uv run pnp studio ./workspace
