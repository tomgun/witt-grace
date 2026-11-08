# CLAUDE CODE: WITT / GRACE development policy

Read **in this order** before editing anything:

1. `docs/HANDOFF_START_HERE.md` — source-first truth hierarchy, baseline and first PR; compare any spec against actual code and tests before editing.
2. `docs/specifications/CURRENT_GRACE_AND_DATA.md` — mathematical and data invariants.
3. `docs/specifications/UX_AND_WORKFLOWS.md` — intentionally settled UI behavior.
4. `docs/specifications/IDENTITY_AI_AND_VOTING.md` — author identities, contribution flows and ballots.
5. `docs/ARCHITECTURE_AUDIT_DEV32.md` and `docs/REFACTOR_PR_ROADMAP.md` — facts and incremental plan.
6. `docs/TESTING_AND_RELEASE.md` — acceptance gates.
7. `docs/P2P_NO_DATABASE_RFC_R1.md` — proposed transport/consensus details; no persistent backend DB.
8. `docs/REVIEW_REPORT.md` — corrected historical drift, tested scope and remaining risks.

**Authoritative baseline:** WITT `0.11.0-dev.32`; schema v8; `settings.scoring = 'evidence-v3-links'`; `npm run check` originally 368/368, and `npm run build` reproduced the released standalone byte-for-byte. This handoff does not start a code refactor; the packaged `src/`, `index.html`, runtime schema, tools and original tests are the dev32 reference implementation.

## Mandatory engineering rules

- Work on feature branches and use small pull requests. Never bypass required checks, modify protected `main` directly, or auto-merge a failing branch. Do not add generated "Co-authored-by" trailers without user instruction.
- **No silent GRACE math changes.** Preserve the current two assessment axes (credence 0..100; signed relation impact -5..5 in 0.5 steps), evidence propagation, mode weighting, decision eligibility and ballot independence. A deliberate formula change must use a new scoring-version identifier, explicit product decision, numerical before/after fixtures, and all views/exports updated together.
- Missing, incomplete, stale, human, AI, locked, context-local and synthetic baseline values are distinct. Do not invent votes, copy a review to another context, or count hidden nodes differently.
- UI rewrite is **not** a license to change UX. Preserve behavior in `docs/specifications/UX_AND_WORKFLOWS.md`; compare desktop+mobile screenshots and retain keyboard interactions, local-only appearance state and offline file handling.
- Stable IDs are identity; display names can change. Never assign unknown legacy authorship to a convenient user; never relabel an imported author's edit with the importing reviewer.
- Untrusted JSON/AI contributions must validate before mutation, with preview and granular acceptance. Never auto-submit document contents to external services.
- P2P future: explicit rooms, peer-replicated durable log, owner separate from sequencer, quorum failover, accepted crash limitations. Do **not** add mandatory cloud databases, hosted document persistence or fake ballot anonymity.
- No big-bang replacement. Extract pure functions into modules without behavior changes; use tests/golden fixtures and review small diffs. Keep `npm run check`, build and GitHub Pages green after EVERY PR.

## Required commands

```sh
npm run check
npm run build
node tools/verify-pages-build.cjs
# optional with Playwright/Chromium installed:
python3 tools/smoke-dock-header-dev32.py
python3 tools/smoke-multi-author-dev31.py
python3 tools/smoke-unified-reuse-dev29.py
```

## First task for Claude Code

**PR #1 after import:** establish version-control baseline and GitHub Pages publication with NO GRACE/math/UX changes. Verify the build, paths, assets and public-safe artifacts on the Pages URL. Next PR: expand characterization/golden tests and strengthen the browser CI already present. Only then split the large `src/app.js`, and only after stable tests consider TypeScript/Vite or a UI-framework migration. See `docs/REFACTOR_PR_ROADMAP.md`.

Historical Claude instructions and devXX release notes are **excluded** from the main repository and stored only in the separate optional legacy-notes ZIP. They are not active tasks or requirements.

Product rationale and user-confirmed design principles are summarized in `docs/METHOD_INTENT.md`; unfinished decisions are in `docs/FUTURE_BACKLOG.md`. **No third** global value-importance or utility slider is authorized. Do not resurrect old-version arithmetic.
