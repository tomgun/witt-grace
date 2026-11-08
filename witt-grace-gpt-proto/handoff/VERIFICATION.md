# Verified handoff reference — WITT dev32 source-first review

**Runtime:** `src/`, `schemas/`, `locales/`, `index.html`, and native example JSONs are byte-identical to original dev32 (see `handoff/RUNTIME_SOURCE_PROVENANCE.sha256`). The browser standalone rebuild SHA-256 is `8867de17dee1f01f97341548d298a706260e4a26c5104fc728dd6af2bad98ec8`.

**Tests:** 372/372 Node tests; `npm run build`; Pages static-artifact check; current Markdown link check; source/agent guidance guard. Desktop/mobile Chromium browser tests for Pages-build layout (fallback to inline because HTTP loopback restricted in container), pane position/toggle, group multi-author export/import, reusable contextual reasons and AI prompt/TXT parity.

**CI:** GitHub Actions CI workflows include `verify` and `browser-smoke` jobs. Workflow syntax/docs are examined locally; actual hosted GitHub execution and live Pages URL are not verified until the owner creates the repo.

**Scope:** docs/test tools/CI were edited for correctness and to separate historical materials, but no runtime JS, stylesheet, HTML, persisted schema or locales were changed. No live P2P or GitHub action.

See `docs/REVIEW_REPORT.md` for known limitations and findings.
