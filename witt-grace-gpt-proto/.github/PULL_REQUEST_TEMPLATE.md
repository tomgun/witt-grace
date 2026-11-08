## Purpose / user-visible change

- Requirement IDs (see `docs/specifications/REQUIREMENTS_TRACEABILITY.md`):
- Does this change GRACE scoring or stored JSON semantics? **No / YES (requires explicit approval + score-version review)**
- Does this change an established UI behavior? **No / YES (provide before/after screenshots)**

## Change boundaries

- Modules touched:
- Data/identity/AI/P2P/privacy implications:
- New assumptions or open decisions:

## Proof

- [ ] `npm run check` green
- [ ] `npm run build` green
- [ ] `node tools/verify-pages-build.cjs` green
- [ ] Affected desktop Chromium smoke(s) green
- [ ] Affected mobile-width Chromium smoke(s) green
- [ ] All necessary numeric/JSON/author or screenshot goldens updated intentionally
- [ ] README/contracts/ADR updated where behavior changed
- [ ] Pages static deployment remains correct, without private fixtures

## Rollback

Describe how to revert this PR if a regression is discovered.
