# Backlog and PR sequence — active

Do not implement all items in one PR. For full acceptance criteria see `docs/REFACTOR_PR_ROADMAP.md` and `docs/specifications/REQUIREMENTS_TRACEABILITY.md`.

- **G0 (owner):** create GitHub repo; push this verified source; enable Pages / protected `main`.
- **PR-01:** validate Pages deployment from this unchanged prototype and CI; no scoring/UX refactor.
- **PR-02:** expand golden mathematical, JSON round-trip, author/AI and browser characterization tests.
- **PR-03:** isolate data access, imports, persistence and user identity from `src/app.js`.
- **PR-04:** isolate state transitions/commands and UI rendering/controllers from `src/app.js`.
- **PR-05:** propose/approve ADR for TS/build/UI technology choice. Migrate incrementally with screenshot and golden parity.
- **P2P-01+ (future):** database-free room governance, encrypted browser replica storage, signed event log, explicit permissions/phases/voting, owner recoverability and host succession. No backend DB.

Open product decisions (not implementation bugs): generic criteria with inheritance, path-correlation diagnosis details, P2P failover/quorum UX, formal ballot methods and privacy, real identity authentication, mindmap/drawing as separate editors.
