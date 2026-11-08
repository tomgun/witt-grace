# Agent rules: WITT / GRACE

`CLAUDE.md` contains the primary autonomous-development policy. Start at `docs/HANDOFF_START_HERE.md` and treat `docs/specifications/` as the active, implementation-verified behavior contract. Historical documents live only in a separate optional archive and never override dev32 behavior.

- One small, reviewed PR per behavioral boundary. Baseline v8 / `evidence-v3-links` tests, desktop/mobile Chromium smoke, static build and Pages artifact validation are mandatory. No co-author trailers unless requested.
- Never silently change GRACE score version, formula, per-target/per-user assessments, voting weighting, identity attribution, or persisted schema.
- Keep current app static/offline-capable. Future P2P is database-free by explicit user decision; the signaling service may be in-memory only.
- Preserve UI contracts for Bitberg, panels, assessment notation, AI task flow, multi-author exports, and repeated reasons; design changes require screenshot comparison.
- No actual GitHub, production deployment, data sharing, or external API operation until the user asks.

See `docs/TESTING_AND_RELEASE.md`, `docs/ARCHITECTURE_AUDIT_DEV32.md`, `docs/REFACTOR_PR_ROADMAP.md`.
