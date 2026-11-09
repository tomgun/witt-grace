# Claude Code instructions for `witt-grace`

## Mission, priorities, role
You are building WITT (Web Interactive Thinking Tool), a local-first browser application for the GRACE method (Günther's Reflective Argumentation & Collaborative Evaluation): argument trees and decision options that several people rate on two axes, with an explanatory signed balance. The owner is Tomas Günther, a solo developer working with Claude Code; talk to the owner in Finnish, write code, tests, commits and docs in English. The prototype in `witt-grace-gpt-proto/` (dev32, built with ChatGPT) is frozen and runnable; this repository rebuilds the product on a better technical foundation and must end up at least as good as the prototype in every behaviour the specs name.

Priorities in order: 1) GRACE method truth (the numbers, the separation of people, AI viewpoints and missing values), 2) the refined UX kept intact, 3) testability and the smallest maintainable architecture, 4) privacy and the local-first guarantees, 5) documentation, user guide and nine languages always current, 6) visual polish.

## Always read
`README.md` and `docs/STATUS.md`. Then `docs/README.md` says what to read for the task (specs for behaviour, architecture for code, ADRs for decisions, testing for tests, the issue plan for picking work, principles and lenses for planning and reviews). If code and STATUS disagree, the code wins and STATUS is fixed in the same PR. If code and `docs/spec/` disagree, neither wins: record the mismatch under "Open mismatches" in `docs/spec/CHANGELOG.md` and ask the owner.

## Invariants and hard rules
1. Exactly two rating axes: credence 0–100 % per premise per context, and signed relation influence −5…+5 in 0.5 steps. No third global importance or utility slider, ever (`docs/spec/METHOD_INTENT.md`).
2. The GRACE math is reproduced exactly. The engine matches the prototype's `WittCore` on the golden fixtures (`tests/golden/`): internal `I`, visible balance `S = 2I − 100`, aggregation `equal` / `shares` / `structural`, eligibility gates, ballot independence. `settings.scoring` stays `evidence-v3-links` until the owner names a new version (`docs/spec/GRACE_AND_DATA_MODEL.md`).
3. Missing is not zero. Unassessed, stale, locked, context-local and structural-preview values are distinct states; `—` is never a numeric 0. Never fabricate a vote, copy a review across contexts, or average an AI viewpoint into a human mean by default.
4. Stable IDs are identity; display names change. Never relabel an imported author's work; unknown legacy authorship stays unknown.
5. Untrusted input is parsed once at the boundary (`parseProject`, `parseContributionBundle`, `parseAiDraft`), previewed, and applied only by the person's explicit, granular acceptance. The app never calls a hosted AI service itself. User text never reaches `innerHTML`-class sinks or unescaped SVG.
6. The prototype's visible UI is the contract (owner's decision 2026-11-08): `docs/spec/UI_INVENTORY.md` lists every screen, control, dialog, layer, stage, persisted key and format, and `docs/spec/UX_AND_WORKFLOWS.md` holds the rationale. The new app uses the prototype's element ids and stylesheet so the same browser walk drives both; a deviation is listed in the inventory's S-15 and decided by the owner, never made silently. Quirks of the prototype are reproduced until decided.
7. Local-first: static hosting, browser storage, file import and export. Nothing leaves the browser except files the person saves and clipboard writes the person triggers. Future P2P is database-free by design and not started implicitly.
8. Specs are locked. `docs/spec/**` changes only in a change that also adds a line to `docs/spec/CHANGELOG.md`; the Claude hook and CI refuse otherwise. Numbers and IDs in the specs are pinned by tests; a test that must change to pass is a spec change.
9. The prototype is frozen. No edits under `witt-grace-gpt-proto/` (the hook refuses them); it keeps passing its own `npm run check` and `npm run build` and is published at `/proto/`.
10. Documentation, the user guide and all nine locales ship in the same change as the behaviour. A missing or raw translation key is a failing test.
11. Fixtures and examples are synthetic. Never commit a personal argument document, a real third party's name or a private decision tree.

## Conventions (decided; the first modules follow them — see docs/ARCHITECTURE.md)
- Layout and dependency direction: `src/domain` (pure: Node builtins only, no DOM, no clock, no random) ← `src/lib` (browser infrastructure: storage, file, clipboard, i18n catalog, export renderers, id and clock providers) ← `src/app` (UI; framework per ADR A005). Enforced by ESLint and `tests/unit/import-direction.test.ts` from WG-003 on.
- Domain functions take `now` and `newId` as arguments and return new values; commands are `(project, input) → project`.
- Closed sets (node kinds, stances, semantic types, weighting modes, scoring versions, schema versions) have one owner module each; every `switch` ends in `assertNever`.
- Users read Finnish with ä/ö intact, from `locales/` (nine languages, one catalog, the prototype's vocabulary: Argumentointi, Päätös, Toistuvat perustelut, Näkymäasetukset, Luo kirjastoon, Liitä myös muihin solmuihin…, Tallennettu selaimeen).
- Tests: `must:`/`test:`/`red-against:` header per file; literal oracles; unit tests pure with fixed `now` and `newId`; golden fixtures generated from the frozen prototype; browser tests in Playwright, Chromium only, keyboard first (`docs/TESTING.md`).
- A new runtime dependency needs an ADR row in `docs/ADRS.md`. Target: zero runtime dependencies in `src/domain`.

## Commands
`npm run check` (docs links, lens shape, spec lock; grows with lint, typecheck and unit tests) · `npm run proto:check` (the prototype's 372 tests) · `npm run proto:build` · `npm run proto:dev`. Skills: `/dev`, `/feature`, `/verify`, `/review`.

## Engineering workflow and honesty
Work in issue-sized changes on a `wg-NNN-slug` branch. Plan with `must:`/`test:`/`red-against:` lines and the architecture self-report (`/feature`). Run `/verify` and report each gate as passed, failed (with output) or not-run; never claim a check passed that did not run. Keep `docs/STATUS.md` and `CHANGELOG.md` in sync when behaviour, structure or status changes, and `docs/spec/CHANGELOG.md` when a spec changes. Commit and push only when the owner asks; never push to `main` directly. Git history is human-authored: no AI attribution in commits or PRs (no `Co-Authored-By`, no "generated with" footers).

## Not on day one (keep as issues)
The document format is still evolving and the project is in heavy development (owner, 2026-11-09): change the schema when a feature needs it, with a `docs/spec/CHANGELOG.md` line; old files need no migration for now.
P2P rooms, hosted AI calls, accounts or cloud sync, the mindmap editor, the criteria catalog, group-level AND/OR gates, secret ballots, a UI framework decision (ADR A005), a bundler, an open-source license (WG-017). All listed with ids in `docs/ISSUE-PLAN.md`.
