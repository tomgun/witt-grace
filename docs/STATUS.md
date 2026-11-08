# Status — implemented, designed, verified

The single truth table for the rebuild. States: `DONE-source` (code exists), `DONE-verified(unit|golden|e2e|sandbox|mac|github)` (a named check proved it, where), `DESIGNED` (docs only), `OPEN`. The prototype's own behaviour is characterized in `docs/spec/REQUIREMENTS.md`; this table tracks the new implementation and the repository. If code and this table disagree, the code wins and this table is fixed in the same PR.

## Last verified
- 2026-11-08, Linux sandbox (Node 24.22.2), `main` after WG-006: `npm run check` passed (258 tests); `npm run build` passed (Vite, 770 kB JS of which the nine-language catalog is 490 kB — WG-021); `npx playwright test` passed (7 walks, 1 skipped on mobile by design); `npm run proto:check` passed (372). Not run: GitHub Actions, Pages.
- 2026-11-08, Linux sandbox (Node 24.22.2 installed for the session; the distro Node 22 lacks TypeScript support), branch `main` after WG-001: `npm run check` passed (docs links, spec index, lens placeholders, spec lock, lint, typecheck, prettier, 258 tests: serialization and i18n, the command parity test, 38 golden fixtures × parse/equal/shares/structural/per-person/feasibility-ballots-influence-directions, plus the import-direction and purity tests); `npm run proto:check` passed (372). Not run: GitHub Actions, Pages.
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
| Golden fixtures generated from the prototype engine: 18 examples + 20 hand-built cases; per node and viewpoint (equal, shares, structural, each person) the internal score, balance, base, delta, contributions, incompleteness; marginal target effects; rankings; feasibility; ballot preferences; influence summaries; displayed directions | DONE-verified(golden, sandbox) | `scripts/golden-from-proto.mjs`, `tests/golden/*.json` |
| `src/domain`: typed v8 model and closed sets, `parseProject` (the boundary, prototype's refusal messages), `evaluate` / `evaluateAssessor` (evidence-v3-links), marginal effects, feasibility, ballot preference, rankings, review readers; pure (no DOM, clock, random); dependency direction enforced by ESLint and a test | DONE-verified(golden, unit, sandbox): every fixture reproduced exactly | `src/domain/*.ts`, `tests/golden/golden.test.ts`, `tests/unit/import-direction.test.ts` |
| Domain commands (nodes, reviews, concepts and uses, groups, ballots) as pure functions | OPEN | WG-004 |
| Serialization: `.witt.json` file form byte-identical to the prototype's export for every example, compact storage form, export filename slug | DONE-verified(unit, sandbox) | `src/domain/serialize.ts`, `tests/unit/serialize.test.ts`; contribution bundle v1 and AI draft v2 parsers arrive with WG-013 |
| Locales: `locales/messages.psv` (866 keys × 9 languages, the prototype's table) → generated typed catalog `src/lib/i18n/catalog.ts` (`npm run i18n`); `translate`/`translator`; tests pin catalog sync, completeness, placeholder parity and the Finnish glossary | DONE-verified(unit, sandbox) | `scripts/generate-locales.ts`, `src/lib/i18n/`, `tests/unit/i18n.test.ts` |
| React 19 + Vite app (A005): top bar with title, four zone toggles (`Alt+1..4`), language and theme (light, dark, paper, Bitberg); toolbar with Argumentointi/Päätös, person and viewpoint selectors, File/Edit/View/Help menus; outline; pannable, zoomable canvas with draggable cards, edges, balance and `75%/+5` pairs; inspector with title, details, relation, parent, semantic type, gate status, score explanation, personal review sliders, comments; bottom zone; view-settings dock (`Alt+V`); keyboard `+`/`−`/`Del`/`F2`/`Ctrl+Z`; autosave to the prototype's storage key; JSON export/open with the replacement confirmation; new document | DONE-verified(e2e, sandbox): 7 keyboard-first walks at 1440×900 and 390×844 | `src/app/*`, `tests/e2e/argument-walk.spec.ts` |
| Decision-mode options and groups can be added and scored; gates set from the inspector | DONE-source (walked by e2e for an option) | `src/app/Inspector.tsx` |
| Ballots UI, repeated-reason shelf, table view, PNG/SVG/PDF exports, document library, AI flows, contribution bundles, depth slider, focus highlighting, tutorial, examples | OPEN | WG-010…WG-016 |
| P2P rooms | DESIGNED | `docs/spec/P2P_NO_DATABASE_RFC_R1.md` |

## Known limitations (documented behaviour, not bugs)
- The prototype's browser tests are Python Playwright scripts that need a Chromium; they are not part of the root `npm run check`.
- The prototype's own `.github/workflows` are inactive in this repository (nested folder); the root workflows cover it.
- Nothing has been pushed to GitHub yet; CI and Pages are unverified until the first push.

## Next 5
1. WG-011 — decision mode UI: ballots dialog with frozen rounds, option ranking view, feasibility badges.
2. WG-012 — repeated-reason shelf and "Liitä myös muihin solmuihin…".
3. WG-010 — document library and the persistence edge cases.
4. WG-015 — table view and exports.
5. WG-001 close-out — push, enable Pages, confirm CI and `/proto/` live (owner).
