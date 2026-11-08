# Status — implemented, designed, verified

The single truth table for the rebuild. States: `DONE-source` (code exists), `DONE-verified(unit|golden|e2e|sandbox|mac|github)` (a named check proved it, where), `DESIGNED` (docs only), `OPEN`. The prototype's own behaviour is characterized in `docs/spec/REQUIREMENTS.md`; this table tracks the new implementation and the repository. If code and this table disagree, the code wins and this table is fixed in the same PR.

## Last verified
- 2026-11-08, Linux sandbox (Node 22.22.1, Python 3.14), repository root, no commits yet: `witt-grace-gpt-proto`: `npm run check` passed (372 tests), `npm run build` passed, `node tools/verify-pages-build.cjs` PASS (23 deployable files), standalone SHA-256 matches the handoff; root `npm run check` passed (docs links, spec index, lens placeholders, spec lock); the two Claude hooks block and allow as designed. Not run: GitHub Actions (no remote push yet), Pages.

## Repository and process

| Item | State | Evidence |
| --- | --- | --- |
| Prototype dev32 frozen, runnable, byte-identical to the handoff | DONE-verified(sandbox) | `witt-grace-gpt-proto/handoff/RUNTIME_SOURCE_PROVENANCE.sha256`, `docs/PROTOTYPE_REFERENCE.md` |
| Product specs lifted to `docs/spec/` with change policy | DONE-source | `docs/spec/README.md`, `docs/spec/CHANGELOG.md` |
| Spec lock: hook refuses a spec edit without a changelog change; CI refuses a PR likewise | DONE-verified(sandbox) | `.claude/hooks/protect-files.mjs`, `scripts/check-spec-lock.mjs` |
| Prototype freeze: hook refuses edits and destructive shell writes under `witt-grace-gpt-proto/` | DONE-verified(sandbox) | `.claude/hooks/protect-files.mjs`, `.claude/hooks/guard-bash.mjs` |
| Docs check: local links, every spec listed in the spec index, no unfilled lens placeholder | DONE-verified(sandbox) | `scripts/check-docs.mjs` |
| Principles and lenses with WITT project specifics | DONE-source | `docs/principles/`, `docs/lenses/` |
| Skills `/dev`, `/feature`, `/verify`, `/review` | DONE-source | `.claude/skills/` |
| CI: `checks` and `prototype` jobs | DONE-source — not yet run on GitHub | `.github/workflows/ci.yml` |
| Pages: prototype at `/proto/`, landing page at `/` | DONE-source — not yet run on GitHub | `.github/workflows/pages.yml` |
| GitHub repository `tomgun/witt-grace` with the first push, branch protection, Pages source | OPEN | `CONTRIBUTING.md` |

## New implementation

| Item | State | Evidence |
| --- | --- | --- |
| Golden fixtures generated from the prototype engine (scores per node, viewpoint and weighting; eligibility; ballots; round-trips) | OPEN | WG-002 |
| `src/domain`: typed v8 model, `parseProject`, scoring `evidence-v3-links`, aggregation, eligibility | OPEN | WG-003 |
| Domain commands (nodes, reviews, concepts and uses, groups, ballots) as pure functions | OPEN | WG-004 |
| Serialization: `.witt.json` v8 round-trip, contribution bundle v1, AI draft v2, import atomicity | OPEN | WG-005 |
| Locales: nine languages, coverage test, Finnish glossary | OPEN | WG-006 |
| UI technology decided (ADR A005) and the first vertical slice (argument mode) | OPEN | WG-007 |
| Everything else the prototype does (decision mode, repeated reasons, docking, themes, exports, persistence, AI flows, browser tests) | OPEN | WG-008…WG-016 |
| P2P rooms | DESIGNED | `docs/spec/P2P_NO_DATABASE_RFC_R1.md` |

## Known limitations (documented behaviour, not bugs)
- The prototype's browser tests are Python Playwright scripts that need a Chromium; they are not part of the root `npm run check`.
- The prototype's own `.github/workflows` are inactive in this repository (nested folder); the root workflows cover it.
- Nothing has been pushed to GitHub yet; CI and Pages are unverified until the first push.

## Next 5
1. WG-001 — first commit and push, enable Pages, confirm CI and `/proto/` live.
2. WG-002 — golden fixtures from the prototype engine.
3. WG-003 — `src/domain` with the parser and the scoring engine matching every fixture.
4. WG-006 — locales catalog and coverage test (small, unblocks the UI).
5. A005 — UI technology ADR, decided with the owner once WG-003 is green.
