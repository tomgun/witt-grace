# Status — implemented, designed, verified

The single truth table for the rebuild. States: `DONE-source` (code exists), `DONE-verified(unit|golden|parity|e2e|sandbox|mac|github)` (a named check proved it, where), `DESIGNED` (docs only), `OPEN`. Since 2026-11-08 the prototype's visible UI is the contract (`docs/spec/UI_INVENTORY.md`); "parity" means a test that drives the frozen prototype module and the port with the same input and compares the output. If code and this table disagree, the code wins and this table is fixed in the same PR.

## Last verified
- 2026-11-09, Linux sandbox (Node 24.22.2), `main` after WG-023 part 2 (`961afb1`) plus the library, export and home-card wiring: `npm run check` passed (docs, spec lock, lint, typecheck, format, 324 unit/golden/parity tests); `npm run build` passed (493 kB main bundle, 150 kB gzip, one chunk per language, examples served from `public/examples/`); `npx playwright test` passed (17 walks at 1440×900 and 390×844, 7 skipped by design); screenshot comparison with `/proto/` at 1440×900 for the home screen, Kartoita, Punnitse with a selected reason, the dock, the reason library, the context menu, decision mode, Bitberg, the assessment round, the review lens, the people and vote dialogs, the table, the tutorial, the visual export and the library dialogs: layout, texts and numbers match the prototype (the quirks the prototype itself has are listed in `UI_INVENTORY.md` S-15). Not run: GitHub Actions, Pages (no push yet). `npm run proto:check` last passed 2026-11-08 (372).
- 2026-11-08, Linux sandbox (Node 24.22.2), `main` after WG-021: `npm run check` passed (258 tests); `npm run build` passed; `npx playwright test` passed (13 walks, 3 skipped on mobile by design); `npm run proto:check` passed (372).
- 2026-11-08, Linux sandbox (Node 22.22.1, Python 3.14), repository root, no commits yet: `witt-grace-gpt-proto`: `npm run check` passed (372 tests), `npm run build` passed, `node tools/verify-pages-build.cjs` PASS (23 deployable files), standalone SHA-256 matches the handoff; root `npm run check` passed; the two Claude hooks block and allow as designed.

## Repository and process

| Item | State | Evidence |
| --- | --- | --- |
| Prototype dev32 frozen, runnable, byte-identical to the handoff | DONE-verified(sandbox) | `witt-grace-gpt-proto/handoff/RUNTIME_SOURCE_PROVENANCE.sha256`, `docs/PROTOTYPE_REFERENCE.md` |
| Product specs in `docs/spec/` with change policy; the UI inventory as the screen-level contract | DONE-source | `docs/spec/README.md`, `docs/spec/UI_INVENTORY.md`, `docs/spec/CHANGELOG.md` |
| Spec lock: hook refuses a spec edit without a changelog change; CI refuses a PR likewise | DONE-verified(sandbox) | `.claude/hooks/protect-files.mjs`, `scripts/check-spec-lock.mjs` |
| Prototype freeze: hook refuses edits and destructive shell writes under `witt-grace-gpt-proto/` | DONE-verified(sandbox) | `.claude/hooks/protect-files.mjs`, `.claude/hooks/guard-bash.mjs` |
| Docs check: local links, every spec listed in the spec index, no unfilled lens placeholder, both user guides present | DONE-verified(sandbox) | `scripts/check-docs.mjs` |
| Principles and lenses with WITT project specifics; skills `/dev`, `/feature`, `/verify`, `/review` | DONE-source | `docs/principles/`, `docs/lenses/`, `.claude/skills/` |
| CI: `checks`, `browser` and `prototype` jobs; Pages: app at `/`, prototype at `/proto/` | DONE-source — not yet run on GitHub | `.github/workflows/ci.yml`, `.github/workflows/pages.yml` |
| GitHub repository `tomgun/witt-grace` with the first push, branch protection, Pages source | OPEN (owner) | `CONTRIBUTING.md` |

## New implementation

| Item | State | Evidence |
| --- | --- | --- |
| Golden fixtures from the prototype engine (18 examples + 20 hand-built cases): scores, balances, contributions, marginal effects, rankings, feasibility, ballots, influence summaries, directions | DONE-verified(golden, sandbox) | `scripts/golden-from-proto.mjs`, `tests/golden/` |
| `src/domain`: v8 model, `parseProject`, `evidence-v3-links` engine (shared and per person), reviews, eligibility, ballots, rankings, views; pure, direction enforced | DONE-verified(golden, unit) | `src/domain/*.ts`, `tests/unit/import-direction.test.ts` |
| Serializable commands (46) with caller-supplied ids; 60 replayed edits identical to the prototype | DONE-verified(unit) | `src/domain/commands.ts`, `tests/unit/commands.test.ts` |
| Serialization byte-identical to the prototype's export; export filename slug | DONE-verified(unit) | `src/domain/serialize.ts` |
| Layout (three orientations, four-way balancing and stable additions, compact and depth projections, edge and link paths), keyboard navigation, review lens and assessor summary, table rows and details: line-for-line ports | DONE-verified(parity): every example × orientations × card heights × keys; 7 620 table-row comparisons | `src/domain/layout.ts`, `navigation.ts`, `lens.ts`, `table.ts`; `tests/unit/layout-parity.test.ts`, `table-parity.test.ts` |
| AI draft v2, contribution v2 and bundle v1, starter v1, import preflight and report: prompts byte-equal, documents and previews identical to the prototype | DONE-verified(parity, 34 tests) | `src/domain/ai/`, `tests/unit/ai-*.test.ts`, `tests/fixtures/ai-task-decision-fi.txt` |
| Locales: nine languages, one lazily loaded module each, completeness and placeholder parity tested | DONE-verified(unit, e2e) | `src/lib/i18n/`, `tests/unit/i18n.test.ts` |
| Browser storage: the prototype's keys and shapes (`witt-project-v3`, `witt-view-v1`, `witt-zones-v1`, `witt-appearance-v1`, `witt-locale-v1`, `witt-keybindings-v1`, per-document actor, lens and assessment pass, `witt-workspace-meta-v1`); document library on IndexedDB with conflict rules, backup and restore | DONE-verified(unit for meta and library transforms; e2e for autosave and reload) | `src/app/view.ts`, `src/app/store.ts`, `src/lib/workspaceMeta.ts`, `src/lib/library.ts`, `tests/unit/lib-*.test.ts` |
| Visual export: SVG byte-equal to the prototype for every example (648 renders), PNG plan and tiles, PDF page plan and bytes, ZIP bytes, estimate text, filenames | DONE-verified(parity) | `src/lib/export/`, `tests/unit/lib-export.test.ts` |
| Workspace shell to the inventory: home screen (S-01), top bar (S-02), toolbar with stages, actor select, menus and the perspective banner (S-03, S-04), left panel with the reason library pane and the add block (S-05), canvas cards, context menu, inline editing, drag, edges, camera, quick bar, legend (S-07), the dock (S-07.1), inspector sections 1–19 (S-08), bottom zone (S-09), footer (S-10); the prototype stylesheet with eight themes; the 390 px layout | DONE-verified(e2e, sandbox screenshots against `/proto/`) | `src/app/*.tsx`, `src/app/styles.css`, `tests/e2e/argument-walk.spec.ts`, `reuse-walk.spec.ts` |
| Dialogs: shared and context reasons (via the library pane and inspector), links, visual export, examples, review lens, tutorial, assessment round, move, new work, about, vote, people, help with shortcut settings, confirm/notice/text, replace, library (S-11.1–11.11, 11.14–11.23, 11.27) | DONE-verified(e2e: review, table, onboarding, decision walks) | `src/app/*Dialog.tsx`, `src/app/Tutorial.tsx`, `tests/e2e/*.spec.ts` |
| AI draft, proposal (contribution) and AI results dialogs, the import report, File → Avaa JSON routing by format (S-11.12, 11.13, 11.20, 11.24–11.26) | OPEN — in progress (WG-023 part 3) | `docs/ISSUE-PLAN.md` |
| P2P rooms | DESIGNED | `docs/spec/P2P_NO_DATABASE_RFC_R1.md` |

## Known limitations (documented behaviour, not bugs)
- Prototype quirks reproduced on purpose until the owner decides otherwise (WG-024): see `docs/spec/UI_INVENTORY.md` S-15.
- The prototype's browser tests are Python Playwright scripts; they are not part of the root `npm run check`.
- Adding a node in the four-way orientation records two undo steps (the node and the offsets); the prototype records one.
- Nothing has been pushed to GitHub yet; CI and Pages are unverified until the first push.

## Next 5
1. WG-023 part 3 — the AI dialogs, the import report and File → Avaa JSON routing; then the full screenshot pass.
2. WG-025 — dual-target browser walks against `/proto/` and the app.
3. WG-024 — owner decisions on the S-15 quirks.
4. WG-001 close-out — push, enable Pages, confirm CI and `/proto/` live (owner).
5. WG-017 — license decision (owner).
