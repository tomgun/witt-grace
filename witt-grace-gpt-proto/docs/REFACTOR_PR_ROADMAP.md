# Claude Code / GitHub PR roadmap (do not big-bang rewrite)

Every PR must state: affected requirement IDs from `specifications/REQUIREMENTS_TRACEABILITY.md`, expected behavior change **yes/no**, exact files touched, golden/browser tests, screenshot/serialization deltas, security implications and rollback plan. PRs modifying `src/core.js` require explicit mathematical justification even if tests pass.

## Phase 0 — owner creates GitHub repo (NO Claude remote writes)

Owner imports this ZIP as repo root; verifies local test/build. Enables branch protection on `main`, CI checks, GitHub Pages deployment source = GitHub Actions, and decides public vs private source and license. See `GITHUB_SETUP.md`.

## PR-01 — first deployment of **unchanged** dev32 prototype

**Goal:** establish trust in baseline and deployed runtime, not modernize code.

- CI green with Node 22 and static `dist/` checks. Deploy on protected `main` from the included `pages.yml`.
- Test site under GitHub Pages **project path**, assets load with relative URLs, local save/open and export behave as before.
- Confirm no source tests, docs, fixtures, secrets or `.env` in published artifact.
- Verify the browser's old local files do not automatically transfer from `file://` to Pages; demonstrate import/export manually.
- Capture desktop/mobile screenshots and identify genuine issues **without** changing features in this PR.

**Exit:** working Pages URL, CI passes, baseline tag e.g. `prototype-dev32`, release notes. No GRACE engine or UI code modifications.

## PR-02 — characterization and golden test protection

- Pin exact examples for (a) individual/equal/shares/structural views, (b) leaf→middle→root across >=4 levels, (c) +/- sign reversals, (d) missing/stale reviews, (e) option groups, gates and value claims, (f) contextual reason two-target isolation, (g) secondary multi-path effects and (h) voting-round snapshots.
- Add file-format golden round-trips and import failure atomicity tests; cover identity/AI isolation and per-user contributions.
- Expand the browser smoke CI already supplied here into broader fixtures/visual regression coverage; classify intentional screenshot diffs, pin browser revision where feasible.
- Introduce coverage measurements as **observation first**; set thresholds only after measuring effective behavior and excluding generated/vendor/fixtures.

**Exit:** reviewers can detect score drift, JSON drift and key UX drift without manual interpretation.

## PR-03 — serialization and persistence adapters

- Extract import/export JSON, schema checks, local storage and document-library operations behind typed stable functions.
- Keep native v8 fields, stable IDs, timestamps (when known), browser autosave and replacement prompt semantics byte/behavior compatible.
- Exercise quota/private-mode/invalid JSON/round-trip/error/cancel cases. No automatic migration or server save.

**Exit:** pure domain logic can run without browser globals; persistence failures visible; check/build/Pages green.

## PR-04 — domain and UI controllers

- Split app orchestration into feature controllers (tree editing, review, repeated reasons, voting, AI proposals, file dialogs, exports, dock state), with dependency injection for DOM/storage/clock where helpful.
- Preserve current HTML/CSS semantics and accessible states; no visual redesign disguised as modularization.
- Extract GRACE pure scoring helpers and domain commands only behind existing API with exact score fixtures. Incremental migration and review.

**Exit:** high-complexity functions shrink; no regressions or new duplicate sources of truth.

## PR-05 — technology ADR (only now pick implementation)

Candidates for discussion, **not selected yet**: JS+JSDoc and incremental type checking; TypeScript+Vite with vanilla DOM; TypeScript+Vite+React or alternative for UI-specific benefits. Record bundle and single-file export implications, GitHub Pages base paths, offline use, translations, tests, typed contracts, developer ergonomics, and accessibility. Compare risk and migration complexity.

**Exit:** owner-approved ADR with rollback/compatibility strategy. A change of framework is not automatically an improvement if it breaks the highly refined UX.

## PR-06+ — incremental migration after ADR

Migrate one feature/view at a time under characterization tests; never rewrite everything in parallel. Keep a consistent domain API, stable JSON v8 unless explicit version bump, full offline operation, and Pages deployment. Port visual themes carefully.

## Separate future milestone — database-free P2P (do not start implicitly)

Execute `P2P_NO_DATABASE_RFC_R1.md` only when authorized: first formal room commands/governance/permissions, then peer encryption/replay/storage, then WebRTC signaling, then quorum failover/owner recovery, then phases & votes. P2P may use volatile rendezvous/STUN/TURN but **not** a persistent backend DB or mandatory hosted archive. Initial room can originate from current/local-library/file WITT; resuming a room is a distinct operation.

## Human-approval checkpoints

Explicit owner approval required for: new scoring semantics/version, `.witt.json` migration, authentication/identity scheme, change to who can see individual reviews, data uploaded outside browsers, P2P quorum/governance decisions, turning on automatic external AI calls, licensing/branding, and any major UI redesign.
