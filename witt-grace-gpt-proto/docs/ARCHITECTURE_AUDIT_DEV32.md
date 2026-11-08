# WITT architecture audit — actual dev32 source

**Reviewed on 2026-11-08, from the provided full dev32 source ZIP.** Baseline runtime files (`src/`, `index.html`, `schemas/`, `locales/`) are byte-for-byte the released dev32 implementation. Test scaffolding, CI and docs are intentionally reviewed/updated; see `docs/REVIEW_REPORT.md`. This is a technical characterization, **not** a statement that the app is already fully modular.

## Current module map

| Area | Current file(s) | Finding | Risk / next boundary |
| --- | --- | --- | --- |
| GRACE domain, versioned scoring and validation | `src/core.js` (~1527 lines) | CommonJS+browser global wrapper; no DOM or network dependencies; domain methods and read-only score evaluation unit-tested. | Still one large module; mutations and evaluation co-located; isolate pure math, data schema and commands without changing behavior. |
| App UI, controller, session state | `src/app.js` (~4333 lines), `index.html`, `src/styles.css` | Too much orchestration, DOM binding, view logic, event handling in one file; most fragile for agentic code edits. | Split by feature behind stable adapter; do not rewrite whole UI at once. |
| Tree layout, table, keyboard | `src/view-layout.js`, `src/table-model.js`, `src/keyboard-nav.js` | Separate testable helpers already exist. | Preserve presentation-only state vs persisted project data. |
| Validation and import format | `src/import-validation.js`, generated `src/project-import-schema.js`, `schemas/project.v8.schema.json` | Explicit v8 validation and errors; schema generator from source schema. | Keep generated schema deterministically synced, no silent migration. |
| Local persistence & document library | `src/workspace.js`, `src/document-library.js` | Separate local store utilities and active-work replacement behavior. | Improve origin/storage error handling and atomic write abstraction; eventually IndexedDB for P2P logs. |
| AI prompts, proposals and multi-author changes | `src/ai-starter.js`, `src/ai-roundtrip.js`, `src/ai-draft-v2.js`, `src/contributions.js`, `src/assessor-view.js` | Already partly modular and tested for author isolation and import correctness. | Keep untrusted import -> validate -> preview -> apply boundary; use canonical author IDs. |
| Diagram exports | `src/diagram-export.js` and `src/app.js` | PNG/SVG/PDF and large-tree behavior tested in browser. | Separate renderer from menu state; visual compare after changes. |
| Locale and examples | `locales/`, `src/i18n.js`, generated `src/examples.js`, `tools/generate-*` | 9 locale catalogs, build-time generated JS. | Add translation and snapshot parity tests before framework rewrite. |
| P2P foundation | `src/p2p-host-engine.js` (~210 lines) | Experimental signed host command/state model. **No network transport, peer replicas, failover, or secure authentication product.** | Retain as a prototype; implement database-free RFC in separate milestone. |
| Release/build/tests | `tools/build.cjs`, `package.json`, `tests/*.test.cjs`, `tools/smoke-*.py` | `npm run check` passes 368 original Node tests; static build reproduces distributed standalone HTML; browser QA scripts available. | Static builds and selected Chromium browser smokes are automated in the reviewed CI; add coverage and a more modular GUI test harness in later PRs. |

## Modularity verdict

1. **Numeric regression protection:** good prototype baseline. Core evaluation is callable from Node without mounting a DOM. Existing tests exercise three modes, deep propagation, shared/contextual reasons, gates, secondary links, missing reviews, rounds, import validation and UI-boundary strings.
2. **UI testability:** partial. Monolithic event orchestrator and global DOM make small safe refactors harder; some tests grep HTML/JS and browser smoke, not every behavior. Add characterization at interactions and boundaries before extracts.
3. **Type safety:** currently plain JavaScript; runtime schema exists. Consider TypeScript with `checkJs`/JSDoc as first bridge and Vite for build before introducing React or other state library. Framework choice is a **future ADR**, not a decision in this handoff.
4. **Production readiness:** no. Public static demo works; local-only profiles are not authenticated; persistent browser store not recoverable across origins; P2P has no transport; no formal security or accessibility audit.

## Proposed target boundaries (technology-neutral)

```text
apps/web                   # UI, tree/table/canvas, accessibility, views
packages/domain            # validated WITT v8 entities, commands, GRACE math
packages/serialization     # schema, import/export, stable IDs, version gates
packages/contributions     # AI/human proposal bundles and author mapping
packages/persistence       # localStorage/IndexedDB/file adapters
packages/collaboration     # future signed events, peers, replication and roles
packages/ui-contracts      # stable UI interaction test fixtures and screenshot baselines
```

This is **a direction**, not an instruction to create every package immediately. Keep `src/core.js` publicly callable throughout transition. Deleting old modules requires proven parity, not just passing unit tests.

## Critical technical risks

- **Scoring drift:** source score is recursively used as strength in ancestor arithmetic. Refactor can subtly change missingness, the treatment of contextual `p`, signed edges and clamp order. Record exact numeric golden cases (individual/equal/shares/structural, 4 levels, hard gates, multi-paths).
- **Attribution drift:** UI events can overwrite `lastEditedBy`, or import can map two authors into one. Verify round-trip and multi-author acceptance.
- **Schema drift:** generated runtime schema can diverge from `schemas/project.v8.schema.json`, and old historical examples may not be valid v8 fixtures. Do NOT use every historical example as a valid import case.
- **UX drift:** desktop dock, mobile panels, keyboard, AI copy/download, recurring reasons, option group display and exports are fragile. Preserve current behavior via Playwright in both widths.
- **Storage and origin:** GitHub Pages is an origin change and locally stored data won't migrate automatically. A project-pages subpath is NOT a localStorage isolation boundary. Expose data-loss/export guidance.
- **Public hosting:** `dist/` only, no secrets or private decision trees. GitHub Pages site may be public even when code repository is private.
- **P2P consensus:** offline/non-quorum state must never be reported as a committed canonical room change. Do not substitute an in-memory signaling service for persistent canonical storage.

## Actual green baseline

- Node 22 baseline: original dev32 had **368/368** Node tests. Current reviewed handoff includes additional contract tests; see `docs/REVIEW_REPORT.md`.
- `npm run build`: generates `dist/index.html` + `dist/src/*` and `dist/witt-standalone.html`.
- SHA256 of the built original standalone matched the distributed dev32 standalone at preparation time: `8867de17dee1f01f97341548d298a706260e4a26c5104fc728dd6af2bad98ec8`.
- Chromium smoke `python3 tools/smoke-dock-header-dev32.py`: passed at **1440×900 and 390×844** in the handoff environment. Other historic smokes exist, but not all were rerun here. Safari/Firefox not certified.

See `TESTING_AND_RELEASE.md` and the file-level status in `DEVELOPMENT-STATUS.md`.
