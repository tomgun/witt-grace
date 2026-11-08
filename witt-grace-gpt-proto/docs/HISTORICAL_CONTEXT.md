# Historical materials: consciously outside the active repository

The reviewed GitHub-ready source package intentionally omits old Claude handoffs, release-specific Markdown variants, outdated design proposals, old smoke programs, obsolete demo import versions and earlier build-container examples. They are preserved in a **separate optional** `witt-grace-historical-notes-optional.zip` with original relative paths under `witt-legacy/`.

The primary repository MUST NOT contain active `agent-handoff/CLAUDE_FIRST_TASK.md` from dev18, `agent-handoff/HANDOFF.md`, old `docs/SCORING.md`, the dev16–dev31 "CURRENT" checkpoints, or earlier v5/v6 numerical contracts. These can misleadingly override the actual v8 application if loaded into Claude's working context.

The separate archive is **not needed** to run the app, ship to GitHub Pages or perform the planned refactor. Consult it only for historical rationale when specifically researching a design decision; never copy a historical instruction back as a current requirement without comparison to `src/` and explicit approval.

All current source modules, schema v8, localization sources and their generators, default v8 examples, Node tests, and selected browser smokes remain in the main package. Test filenames containing devXX describe when a regression was introduced, **not** which schema/engine to run.
