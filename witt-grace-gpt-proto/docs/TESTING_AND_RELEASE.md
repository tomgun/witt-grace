# Testing, release and regression-gate contract

## Green baseline at handoff

```sh
node --version                         # Node >=20; Node 22 for CI
npm run check                          # 368 original tests; new contract tests may add to this
npm run build                          # dist/index.html and dist/witt-standalone.html
node tools/verify-pages-build.cjs      # guards published static assets and excludes source fixtures
```

`npm run check` regenerates locale/schema artifacts, performs syntax and documentation link validation, then runs `node --test tests/*.test.cjs`. The source has no runtime npm dependencies. `npm run build` also regenerates offline example assets. CI **must not** require network AI calls.

## Browser smoke (separate gate)

The maintained Python Playwright scripts can use system Chromium (`/usr/bin/chromium`) or the Playwright-managed Chromium when available. CI installs pinned Playwright 1.57.0 and Chromium for real browser smoke testing; on macOS install Playwright and its managed browser or set `WITT_CHROMIUM_EXECUTABLE`. The smoke scripts load `dist/witt-standalone.html` directly in a test page (no public host required).

Representative test matrix:

| Concern | Script / Node regression |
| --- | --- |
| Header zones, draggable view settings, mobile layout | `tools/smoke-dock-header-dev32.py` |
| Human identities, per-author contribution export/import, pane toggles | `tools/smoke-multi-author-dev31.py` |
| Repeated reasons, two contextual targets, reviews | `tools/smoke-unified-reuse-dev29.py` |
| AI task equality, schema advanced, copy fallback | `tools/smoke-ai-task-choices-dev28.py` |
| Actual signed relationship direction vs creation +/- | `tools/smoke-directed-relations-dev27.py` |
| Named current work before replacement, neutral routes | `tools/smoke-replacement-routes-dev30.py` |
| Signed explanatory result across tree and exports | `tools/smoke-signed-balance-dev21.py`, `tests/signed-balance-dev21.test.cjs` |
| PNG/SVG/PDF whole tree, large tiles, height paging | `tools/smoke-visual-export-dev13.py` (larger PDF stress work is not part of the curated smoke set) |
| Named primary and secondary link scoring | `tests/secondary-scoring-dev26.test.cjs` |
| 5+1+1+1 shares and deep propagation | `tests/weighted-upward-dev20.test.cjs`, `tests/deep-argument-propagation-dev20.test.cjs` |
| Invalid AI/native document import and author mapping | `tests/import-validation-dev15.test.cjs`, `tests/multi-author-contributions.test.cjs` |

Only **Chromium** desktop 1440×900 and mobile-like 390×844 were verified in the recent prototype iterations. Do not claim automatic Safari/Firefox or real-phone parity. CI now runs a pinned Python Playwright 1.57.0 + Chromium smoke job on every PR. Require `verify` **and** `browser-smoke` as branch-protection status checks once both first execute. Local Chromium checks and human visual inspection are still needed; the pinned Playwright package does not, by itself, pin every future CI browser binary build or certify Firefox/Safari.

## Characterization & change-control gates

For every scored semantic change, preserve a reproducible **baseline vs proposed** result table for: leaf, middle, root, options, context variants, crosslinks, multiple people, absent/stale values, gates and AI exclusion. A new scoring version identifier is required for **intended** mathematical changes.

For JSON changes, validate a fixture through exported/imported bytes, identities and current schema. If dropping pre-release compatibility intentionally, document it explicitly; never reinterpret a v8 file silently.

For UI changes, screenshots at both widths, keyboard and ARIA controls, modal completion/cancel/error behavior, create/attach repeated reason visibility and result accuracy in tree/table/exports. Test that view-only changes never mutate WITT project JSON.

## Release steps

1. Check `npm run check` (all tests), `npm run build`, Pages asset preflight and affected browser tests.
2. Review `git diff` for unintended generated data, secrets or fixture rewrites. No auto release from PR branches.
3. Record test counts and SHA256s in release notes and, where needed, a signed Git tag created by the repo owner.
4. Merge through reviewed PR. Pages only deploys from `main` by workflow. Validate live URL and static assets after deploy.
5. Store no personal WITT documents in public fixtures or workflow logs. A browser localStorage save is not a GitHub/cloud backup.
