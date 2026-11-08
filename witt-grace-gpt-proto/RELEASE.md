# WITT / GRACE — reviewed GitHub + Claude Code source handoff

**Application baseline:** WITT `0.11.0-dev.32` (8 November 2026), native project schema `8`, scoring `evidence-v3-links`. This is **not** a new application feature release.

- Runtime `src/`, `index.html`, v8 schemas, locale and example sources are held identical to the original dev32 full-source ZIP. The current scoring engine and UI have **not been refactored or changed** in this handoff.
- Active specs were audited against code and regression tests. Older devXX agent tasks, historical docs and obsolete browser scripts have been moved to a **separate optional** history ZIP; no dev18 first task remains in the primary repo.
- `docs/REVIEW_REPORT.md` reports evidence, discovered drift, remaining design uncertainties, and the difference between source-level tests and CI/browser coverage.
- Both `docs/KAYTTOONOTTO_FI.md` and the **exact requested filename** `witt-grace-github-handoff-guide-fi.md` are present in the repo. They are the same current Finnish setup guide.
- `npm run check`, `npm run build`, Pages artifact verification, `tools/smoke-pages-handoff.py`, and representative multi-user/UX browser regressions are required gates as documented. CI includes real Chromium browser smoke checks.
- The reference standalone dev32 is reproducible through `npm run build`; `dist/` remains excluded from Git and is created locally/CI.

**No GitHub repository, commit, remote branch, Pages site, external service, or online P2P room has been created by this handoff.** Use `docs/HANDOFF_START_HERE.md` and `CLAUDE.md` for current instructions.
