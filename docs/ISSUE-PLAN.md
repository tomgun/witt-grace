# Prioritized, issue-sized execution plan

Use these as small GitHub issues once the repository is on GitHub. Start with the foundation, not the attractive features. Status: planned / in progress / done; do not equate docs with code. IDs are `WG-NNN` and never reused.

## Foundation (P0)
- [ ] **WG-001** Repository baseline. Prototype frozen under `witt-grace-gpt-proto/`, specs in `docs/spec/` with lock, principles, lenses, hooks, skills, checks, CI and Pages workflows, the docs set. DONE-source 2026-11-08; open: first push, Pages enabled, CI seen green, `/proto/` opened in a fresh browser profile.
- [ ] **WG-002** Golden fixtures from the prototype engine: `scripts/golden-from-proto.mjs` loads `witt-grace-gpt-proto/src/core.js`, runs every example and the hand-built cases from `docs/spec/GRACE_AND_DATA_MODEL.md` (G-02 table, ≥4 levels, sign reversals, missing/stale, groups, gates, values, two-context reuse, secondary routes, equal/shares/structural, AI exclusion, ballot rounds) and writes `tests/golden/*.json`. Requires reading the prototype's `core.js` API (`WittCore.*`) and recording exactly which functions produce which numbers.
- [ ] **WG-003** `src/domain` first slice (A002, A003): `model.ts`, `parse.ts` (v8, refusals with messages), `scoring.ts`, `eligibility.ts`; `tests/unit/import-direction.test.ts`; every golden fixture green; `npm run check` grows lint, typecheck, prettier, unit.
- [ ] **WG-004** Domain commands as pure functions with `now`/`newId` injected: nodes (add/edit/move/delete/collapse is view-only), reviews per person and context, concepts and uses, groups, users, comments, ballot rounds. Invariant tests: stable IDs, no cycles, no doubled use per target, no author relabelling.
- [ ] **WG-005** Serialization: `.witt.json` v8 canonical round-trip byte-stable for every example; contribution bundle v1 diff/apply; AI draft v2 parse/preview/apply; import atomicity (a refused document changes nothing).
- [ ] **WG-006** Locales: `locales/` catalog from the prototype's `messages.psv`, nine languages, generated typed keys, coverage test (missing, empty, raw key fail), Finnish glossary asserted.
- [x] **WG-007** DONE 2026-11-08: React 19 + Vite (A005 accepted under the owner's mandate); shell, canvas, inspector with reviews and balance, comments, keyboard, autosave, JSON export/open, Playwright walks at both widths. Side-by-side visual comparison with `/proto/` by the owner still pending.

## Parity with the prototype (P1, order by dependency)
- [ ] **WG-008** Pages: the new app at `/`, the prototype at `/proto/`, one-file standalone export of the new app; relative asset paths under a project path.
- [ ] **WG-009** Browser tests (A009): keyboard walks of the WG-007 slice; screenshot comparison against the prototype.
- [ ] **WG-010** Persistence: storage adapter, autosave, document library, the replacement confirmation (UX-E06), low-prominence save status, quota/private-mode errors visible.
- [x] **WG-011** DONE 2026-11-08: options overview, gates from the inspector, ballot dialog with frozen rounds and share weighting, people dialog with the pooled-weighting choice; a two-person ballot walk in Playwright. Groups: addable and structural (no rating, no ballot slot); a group inspector of its own is still open.
- [ ] **WG-012** Repeated reasons: the card shelf, `Luo kirjastoon`, `Liitä myös muihin solmuihin…`, per-context ratings, route notes, locked shared reasons as advanced (UX-C01…C07).
- [ ] **WG-013** People and AI: local profiles, viewpoint selector, AI isolation, AI task copy/TXT parity, proposal preview and granular acceptance, contribution bundle UI (U-01…U-06).
- [ ] **WG-014** Workspace: File/Edit/View/Help menus, four-pane docking `Alt+1..4`, `Näkymäasetukset` dock `Alt+V`, keyboard camera, depth slider, themes incl. Bitberg, 390 px layout (UX-B01…B08).
- [ ] **WG-015** Table view and exports: table model, PNG (single then tiles), SVG, multi-page PDF; exports never mutate (UX-A08, UX-E08).
- [ ] **WG-016** User guide (fi, then en) and in-app help/tutorial, kept current by the docs check; examples library (synthetic) bundled.

## Housekeeping (P2)
- [ ] **WG-017** License decision and `LICENSE` file; until then the notice in `witt-grace-gpt-proto/LICENSE-NOTICE.md` stands.
- [ ] **WG-018** Pin GitHub Actions by commit SHA; Dependabot triage policy.
- [ ] **WG-019** Accessibility pass (axe on every top-level view; keyboard-only walks; contrast of every theme) before calling the new app a replacement.
- [ ] **WG-021** Split the locale catalog per language and load the active one lazily (the nine-language catalog is 490 kB of the 770 kB bundle).
- [ ] **WG-020** Prototype retirement criteria check: every golden fixture, every REQUIREMENTS row marked Implemented, every UX item walked; then decide whether `/proto/` stays as history.

## Future (not scheduled)
P2P rooms per `docs/spec/P2P_NO_DATABASE_RFC_R1.md` (first governance commands, then replication, then signaling); criteria catalog; group AND/OR gates; context-invariant credence sharing; mindmap editor; secret ballots. Each starts with its own ADR and spec changelog line.
