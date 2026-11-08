# Changelog

All notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are 0.x: a minor may contain breaking changes. "Reviewed:" lines record quality-review rounds.

## [Unreleased]

### Added
- WG-001 repository baseline (2026-11-08). The GPT-era prototype `0.11.0-dev.32` moved to `witt-grace-gpt-proto/` and frozen as the reference (372 tests, build and Pages preflight verified, standalone SHA-256 `8867de17…`). The product specs lifted into `docs/spec/` with a change policy and changelog. Quality system copied from `price-alert-platform` and `agentic-af-for-claude`: `docs/principles/`, `docs/lenses/` with WITT project specifics, `.claude/` hooks (protect files, guard bash) and skills (`/dev`, `/feature`, `/verify`, `/review`). Checks: `scripts/check-docs.mjs` (local links, spec index, lens placeholders) and `scripts/check-spec-lock.mjs` (a spec change needs a changelog line). CI with `checks` and `prototype` jobs; Pages workflow publishing the prototype at `/proto/`. Docs: README, CONTRIBUTING, STATUS, ARCHITECTURE (proposed target), TESTING, ADRS (A001–A009), ISSUE-PLAN (WG-001…WG-020), PROTOTYPE_REFERENCE.
