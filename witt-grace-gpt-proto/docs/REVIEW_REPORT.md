# WITT / GRACE — independent, source-first handoff audit

**Date:** 2026-11-08. **Product baseline:** `0.11.0-dev.32`, native WITT schema **v8**, scoring **`evidence-v3-links`**. **Goal:** a trustworthy initial GitHub/Claude Code repository without altering the jointly refined prototype. This report is evidence of a local review, **not** a production certification.

## 1. Review verdict

**Suitable for initial GitHub import and a static GitHub Pages prototype; not yet suitable for an uncontrolled large AI rewrite or a production P2P release.** The functioning source code, not an assistant-authored historical Markdown file, defines currently implemented behavior. The user-approved method and UX intent remains important: when a written requirement differs from executable behavior, record a discrepancy for explicit review, not an automatic code alteration.

The repository now has *one active instruction path*: `CLAUDE.md` → `docs/HANDOFF_START_HERE.md` → `docs/specifications/*` → source+regression tests. It distinguishes **implemented**, **partial**, **planned**, and **proposed technical solution**. `docs/METHOD_INTENT.md` explains why the two GRACE review axes, contextual repetition and cognitive simplicity matter; `docs/FUTURE_BACKLOG.md` preserves the database-free P2P decision without claiming it is shipped.

## 2. Critical findings and disposition

| Finding in the previous handoff | Severity | Review action |
| --- | --- | --- |
| `agent-handoff/CLAUDE_FIRST_TASK.md` instructed Claude to resume **dev18**, v5 and old heuristic, with an obsolete test baseline | **Critical** | Removed from active repo. Preserved in **separate optional history ZIP** alongside obsolete `HANDOFF.md` and UI brief. Current first PR prompt explicitly pins dev32/v8 and publishing. |
| 100+ cumulative Markdown documents, many labelled **CURRENT** at different dates, could supersede code accidentally | **High** | Removed 197 legacy files (older docs, ADRs, handoff material, obsolete UI tests and legacy JSON samples) from active repo; optional history archive remains available. Replaced index with current source-anchored docs. |
| `examples/README.md` asserted the examples were **schema v5** | **High** | Rewrote to describe current v8 examples, AI-draft format exception and archived v1/v2/v4 fixtures. |
| `docs/SCORING.md`/`docs/GRACE_MATHEMATICAL_CONTRACT.md` included old `heuristic-v1` or v2 equations | **High** | Removed from active docs. Active scoring contract references actual `src/core.js` and golden tests. Current version is `evidence-v3-links`; historic formulas archived. |
| CI only checked Node and build, not actual browser actions | **High** | Added real **`browser-smoke`** GitHub Actions job with Python Playwright 1.57.0 and Chromium, testing five representative user flows at desktop/mobile widths. CI status checks should require **both `verify` and `browser-smoke`**. |
| Pages browser smoke referenced nonexistent `WittCore.createProject` | **Medium** | Corrected to actual `WittCore.createBlankProject` (and verified v8). All smoke runs passed locally afterward. |
| Old optional JavaScript Playwright runner required uninstalled `@playwright/test` | **Medium** | Removed that unused runner/config; curated, working Python browser smokes are the maintained path. |
| Whole-source SHA manifests and `handoff/VERIFICATION.md` would become stale after cleanup | **Medium** | Removed obsolete manifests; regenerated focused runtime SHA provenance and current verification notes in `handoff/`. |
| Finnish handoff guide was only embedded under a different filename | **Medium** | Included both `docs/KAYTTOONOTTO_FI.md` and the exact requested **`witt-grace-github-handoff-guide-fi.md`** at repo root, with working relative links; contract test guards content parity. |
| Previous P2P text mixed agreed constraints with suggested low-level quorum/security design | **Medium** | Explicitly marked no-database P2P + user workflow as agreed direction, majority quorum/event epochs/key algorithms as **RFC proposals pending ADR**. Separate hosted DB product is not an implied dependency. |

## 3. Runtime provenance: code wins over stale prose

Comparison against `witt-grace-0.11.0-dev32-agent-ready-source.zip`: **53/53 retained runtime/source/example paths byte-identical** (`src/`, `index.html`, `schemas/`, `locales/`, native `examples/*.witt.json`); see `handoff/RUNTIME_SOURCE_PROVENANCE.sha256`. The rebuilt `dist/witt-standalone.html` is **byte-identical** to the previously released dev32 standalone:

`SHA256 8867de17dee1f01f97341548d298a706260e4a26c5104fc728dd6af2bad98ec8`

The changes in this reviewed bundle are **documentation, tests/test tooling, CI, packaging and legacy isolation only**, not runtime UI/GRACE/P2P engine changes. Historical comments still present in a few source files may mention `heuristic-v1` or `evidence-v2`; these comments do **not** override actual score function bodies, version identifiers or tested outputs. Clean them in a separate comment-only PR, not while changing the math.

## 4. Actual verification and what it does not prove

- `npm run check`: **372/372** Node tests passed, including import validation, arithmetic, model semantics, identity, scoring/AI isolation and current handoff checks.
- `npm run build` and `node tools/verify-pages-build.cjs`: passed; static Pages artifact has **23 files** and **20 relative asset references**, with no raw test/fixture/docs content accidentally copied as files to the deploy folder. Built-in public example data remains bundled inside its JavaScript asset and must be reviewed before publication.
- `node tools/check-handoff-docs.cjs` and `node tools/verify-current-guidance.cjs`: passed, validating active links, no legacy agent handoff and current schema/score labels.
- Browser tests at **1440×900 and 390×844**: project-path Pages build smoke; dock and four visibility controls; multi-author proposal export/import preserving identities; repeated reasons with separate target-specific ratings; AI task copy/TXT identity and fallback. All passed locally. **Pages project-path test used static-asset verification plus inline-HTML fallback because the local container blocked HTTP loopback; live URL and real Pages hosting remain untested.** The new CI job is designed to perform real HTTP browser testing on GitHub Actions.
- CI YAML and installer commands were reviewed locally. **GitHub Actions has not yet run** and cannot be promised green until first hosted workflow execution. No GitHub repository, deployment or PR was created.
- Counts are regression evidence, not formal coverage percentages. No complete WCAG audit, Safari/Firefox parity, mobile-device farm, pen test, content security review or production-level persistence verification was performed.

## 5. Implemented now versus future intent

**Implemented/source-anchored:** argument/decision modes; GRACE per-premise credence (0–100) and per-relationship signed effect (-5..+5); recursive `evidence-v3-links` and explanatory signed balance; per-person and AI reviews; independent context-specific repeated reasons; intentional secondary path scoring; separate feasibility gates, option groups and ballot; local profiles, AI/manual proposal import/export; document library and browser save; configurable tree/table/visual workspace and selected PNG/SVG/PDF exports. See active specifications for exact boundaries, including missing reviews, vote weighting, and current privacy limitations.

**Not implemented:** a browser-to-browser P2P room or host failover; cryptographically authenticated room owner; transport/key distribution; server-backed database product; secret/anonymized ballot protection; automatic hosted AI calls. Database-free P2P with peer copies, invite codes, granular permissions, stages and voting methods is a **future approved direction**. Its consensus/recovery/security details remain proposed RFC work.

**Known architecture risk:** the `src/core.js` pure-ish domain module still combines model mutations and evaluation (~1,527 lines), and `src/app.js` is a large event/view orchestration layer (~4,333 lines). TypeScript/build framework and UI framework are **not decided**. An unreviewed big-bang rewrite would risk subtle numeric/UX drift. Phase refactoring through small PRs and exact numeric/visual characterization tests.

**Data-format boundary:** native v8 imports do not automatically migrate old v5/v6/v7 WITT projects. User-facing imports must explicitly report unsupported formats, not reinterpret them silently. Browser `localStorage` is origin-scoped and is not a cloud backup; `file://` drafts require explicit JSON export/import when moving to Pages.

## 6. Handoff acceptance / first PR instructions

1. Owner creates repository and pushes the contents of the reviewed `witt-grace/` folder. Do not import the legacy archive as active docs; do not put `dist/` or local WITT projects in Git.
2. Configure Pages via Actions, protect `main` and require **both** CI checks `verify` and `browser-smoke` after they first appear.
3. Verify actual Pages URL with an empty browser profile, new/edit/save/export/import and UI interactions. Test browser persistence behavior and review public embedded examples. Choose source license/copyright policy before publishing repo openly.
4. Let Claude Code first validate reproducibility and make a narrowly scoped PR, then expand tests/coverage, then refactor existing modules incrementally without changing numeric inputs or UX semantics.
5. If docs and implementation diverge, Claude must document: expected user intent, observed code/JSON, actual regression, missing tests and proposal. **Never alter GRACE math, data format, provenance or carefully refined UX only because a prose file seems authoritative.**
