# Verified development status — GitHub / Claude Code handoff

- Baseline: WITT `0.11.0-dev.32`, Nov 8 2026.
- Native `.witt.json` schema: **v8**. Scoring: **`evidence-v3-links`**. No code behavior change requested for handoff.
- Regression baseline: **368 original tests passing**; separate new handoff tests may add to the total. `npm run build` reproduces the original standalone HTML exactly.
- Already tested previously in Chromium 1440px desktop and 390px mobile. Optional browser smoke scripts depend on Playwright and Chromium. Safari/Firefox NOT certified.
- GitHub Pages: **feasible and workflow prepared; not deployed**. No GitHub repo created, no remote changes.
- P2P: `src/p2p-host-engine.js` is a protocol experiment, NOT a connected real-time collaboration product. Database-free RFC is design-only.
- Main architecture debt: `src/app.js` (approximately 4,333 lines) combines state orchestration and UI/event binding; `src/core.js` (approximately 1,527 lines) contains domain semantics and calculations in one testable non-DOM module. Refactor through characterized PRs, not a rewrite.
- Primary handoff docs: `docs/HANDOFF_START_HERE.md`, `docs/specifications/`, `docs/REFACTOR_PR_ROADMAP.md`.

The historical verbose status is in the separate optional history ZIP, not the active repository.
