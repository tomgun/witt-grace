# Copy/paste this into Claude Code after you have created and pushed the GitHub repository

Read `CLAUDE.md`, `docs/HANDOFF_START_HERE.md`, `docs/specifications/CURRENT_GRACE_AND_DATA.md`, `docs/specifications/UX_AND_WORKFLOWS.md`, `docs/ARCHITECTURE_AUDIT_DEV32.md`, `docs/REFACTOR_PR_ROADMAP.md` and `docs/GITHUB_SETUP.md` **before changing code**.

We imported WITT / GRACE dev32 as a working prototype. Your FIRST objective is **PR-01: verify the unchanged static GitHub Pages deployment and baseline CI**, not a TypeScript/React rewrite. Inspect the current repository, report observed module boundaries and test results, check `npm run check`, `npm run build` and `node tools/verify-pages-build.cjs`, and propose the smallest necessary change list. Use a new feature branch and a pull request; do not directly push to `main`, disable tests or change scoring/schema/UI semantics. No `Co-authored-by` commit trailers.

After the first PR is reviewed and merged, propose PR-02 for expanded characterization/golden and broader automated browser tests (basic browser-smoke CI is already present). Subsequent refactors must preserve all current GRACE and UX contracts, including context-specific repeated reasons, human-vs-AI separation, signed -100..100 argument balance, per-person -5..+5 impact, multi-author export and the Bitberg / pane UI. Future P2P is **database-free by design** and is not part of the first PR.

Do not touch unrelated applications, accounts or external services. Explain blockers before taking actions outside the repo. Output the PR plan, exact commands/tests, observed results and any changed-file rationale.
