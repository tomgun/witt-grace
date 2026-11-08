# WITT / GRACE — authoritative handoff entrypoint (dev32)

**Purpose:** Start a new GitHub repository, publish an unchanged working prototype to Pages, then continue with Claude Code using small PRs, much stronger module boundaries and regression protection. This file is **not** a claim that planned capabilities have been implemented.

## Source-of-truth precedence

1. **Existing executable behavior (primary evidence of what is implemented):** current dev32 source code + reproducible tests + actual browser behavior + synthetic fixtures. If new prose and running behavior disagree, STOP and record a mismatch before modifying either.
2. **User-approved product/method decisions (may expose an implementation gap; do not silently edit code):** `specifications/CURRENT_GRACE_AND_DATA.md`, `specifications/UX_AND_WORKFLOWS.md`, `specifications/IDENTITY_AI_AND_VOTING.md`, `specifications/REQUIREMENTS_TRACEABILITY.md`.
3. **Future collaboration design (only database-free constraint and user goals approved; lower-level algorithm is proposed):** `P2P_NO_DATABASE_RFC_R1.md` (approved no-database constraint; remaining protocol choices proposed, not delivered).
4. **Migration/repo contract:** `ARCHITECTURE_AUDIT_DEV32.md`, `REFACTOR_PR_ROADMAP.md`, `TESTING_AND_RELEASE.md`, `GITHUB_SETUP.md`.
5. **Historical rationale:** available ONLY in the optional separate `witt-grace-historical-notes-optional.zip`. It is not an instruction source and is not in the GitHub-ready repository.

No work in this package has changed the running GRACE engine, project schema, UI layout, or functionality. The repository packaging and documentation/tests/CI have been revised; the active runtime remains byte-identical to dev32. The handoff adds repo automation, source-of-truth documents, test gates, and initial characterization where needed.

## Locked current baseline

| Item | Value | Evidence / scope |
| --- | --- | --- |
| App release | `0.11.0-dev.32` | `package.json`, `RELEASE.md` and original dev32 release in optional historical archive |
| Document format | `schemaVersion: 8` | `src/core.js`, `schemas/project.v8.schema.json` |
| Scoring engine | `evidence-v3-links` | `src/core.js`; `tests/secondary-scoring-dev26.test.cjs` |
| Numeric API (internal) | 0–100 evidence score | `src/core.js` |
| Visible argument balance | `2*internal - 100`, from -100 to +100 | `tests/signed-balance-dev21.test.cjs` |
| Individual inputs | credibility 0–100%; influence -5..+5 in 0.5 increments | `tests/weighted-upward-dev20.test.cjs` |
| User aggregation | equal (default), shares, structural preview | `src/core.js`, weighted tests |
| Ballot | separate optional preference voting | `src/core.js` |
| Offline runtime | works on static hosting; no backend | `tools/build.cjs` |
| Browser P2P transport | NOT implemented | `src/p2p-host-engine.js` is experimental only |
| Original test baseline | 368 Node tests | `npm run check` at handoff |
| Preview UX | previously verified Chromium desktop/mobile | `tools/smoke-dock-header-dev32.py`, others |

## Golden rules for Claude and reviewers

- Preserve **per-assessor and per-use** truth and relational-impact judgements. Shared wording is not shared truth; per-context `p` and `w` require separate assessment records.
- The core formula is an **explanatory diagnostic** (not objective truth probability or utility maximization). Never silently swap it for a new score.
- Missing, stale or incomplete assessments stay explicit. `—` is not zero. Individual AI scores never enter human aggregates by default.
- All explicitly approved independent source→target effects, including legacy secondary links, participate once per edge. Do not auto-deduplicate intentional routes; informational path notes are permissible.
- A decision option can have a signed argument balance and independent feasibility. An option group is structural, not an extra option or vote.
- Ballot methods/voting rights and assessment-share weighting are separate choices. Vote rounds freeze the eligible alternatives and weights; never mutate a live ballot invisibly.
- UI state (theme, pan/zoom, panel placement, depth filter) never changes stored scores or source attributions.
- Keep current Finnish UX language and translations intentional; redesign user flows only with explicit acceptance and screenshots.

## Required review checklist

Before any PR: open `CLAUDE.md`, list affected requirement IDs, make a small test that fails for a bug or characterizes existing behavior, then implement. After: `npm run check`, `npm run build`, `node tools/verify-pages-build.cjs`, impacted Playwright scripts, and inspect visual screenshots. For a score/model PR, add hand-calculated golden cases and a clearly named new scoring version if semantics change.

## First PRs

1. **Owner establishes remote repository, then PR-01 verifies Pages publishing** — no code modernization yet.
2. PR-02 expand characterization and **existing** browser CI coverage; pin golden fixtures and quantify coverage. No UX changes.
3. PR-03/04 modularization behind unchanged public APIs and persistence contracts.
4. PR-05 technical ADR for TypeScript, Vite, React/other UI if justified; no automatic big-bang rewrite.

See `REFACTOR_PR_ROADMAP.md` for dependency order and exit criteria.

## Current open questions

- Final choice of model for generic reusable evaluation criteria and conditional group-level hard constraints (AND/OR); **do not invent semantics**.
- Full account-grade authorization, hidden/secret ballots, deterministic no-database P2P failover protocol and remote identity, all **future**.
- Mindmap and freeform canvas are future, possibly separate editor types; they are not GRACE-scored argument projects.
- Long-term product ownership/license, domain, data-protection posture and production performance budgets remain owner decisions.
