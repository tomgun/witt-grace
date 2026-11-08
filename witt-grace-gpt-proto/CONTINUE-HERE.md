# Next-session handoff: WITT / GRACE

**Version:** 0.11.0-dev.32, schema v8, `evidence-v3-links`.
**State:** offline prototype is working, 368 original Node tests pass, standalone build reproduced; no live network P2P, no backend, no GitHub repository created by this handoff.

**Do not resume outdated dev16–dev31 plans as if they were current.** Use [the active handoff index](docs/HANDOFF_START_HERE.md), [current method/data](docs/specifications/CURRENT_GRACE_AND_DATA.md), [current UX](docs/specifications/UX_AND_WORKFLOWS.md), and [PR roadmap](docs/REFACTOR_PR_ROADMAP.md).

## Owner's immediate workflow

1. Owner creates a GitHub repo and imports this ZIP contents (without nested old source archives as root).
2. Owner confirms Pages source = GitHub Actions and deploys `main`.
3. Claude verifies deployed static app and PR checks; **no scoring/UI changes in first PR**.
4. Claude adds golden/characterization and browser CI, extracts modules safely, and proposes a technology ADR before migrating frameworks.
5. P2P collaboration is a separate future milestone; no database. See `docs/P2P_NO_DATABASE_RFC_R1.md`.

## Quality command

`npm run check && npm run build && node tools/verify-pages-build.cjs`

## Important note about previous history

Old dev32 root docs and prior release-specific handoffs are in the **separate optional historical ZIP**, not the active repository. They are **not the active contract**. Do not revert to the obsolete `heuristic-v1` or 50-centered visible score.
