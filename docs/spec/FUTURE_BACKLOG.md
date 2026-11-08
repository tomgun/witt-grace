# WITT future backlog — separated from implemented dev32

> **Living specification.** Copied 2026-11-08 from the dev32 prototype handoff (`witt-grace-gpt-proto/docs/FUTURE_BACKLOG.md`). Backticked source, test and tool paths (`src/…`, `tests/…`, `tools/…`) refer to the frozen prototype under `witt-grace-gpt-proto/` until the new implementation supplies its own evidence. Edit this file only through the change policy in `docs/spec/README.md`.

**Status vocabulary:** **Agreed direction** = explicit current user goal; **Design proposal** = a possible technical solution, NOT an instruction to implement; **Implemented** = evidence in code and tests, not claimed here. Claude must not turn a proposed requirement into working or agreed functionality without an owner decision.

## Next engineering tasks (agreed goal; implementation approach open)

1. Import dev32 unchanged to GitHub, publish to **GitHub Pages** with tests and no backend. Owner creates repo; do not perform GitHub actions from this handoff.
2. Improve test characterization and CI, including browser workflows at desktop/mobile widths, import/export, GRACE numeric golden cases, and attribution. Run before and after refactors.
3. Refactor oversized browser orchestration and core while preserving behavior. Establish boundaries for domain/scoring, serialization, storage, AI proposal processing, view state and DOM interaction; dependency-inject browser primitives where needed.
4. Choose TypeScript, build tooling, and any UI framework through a measured ADR **after** baseline and tests. A full rewrite is not an approved shortcut.
5. Measure accessible interactions, browser cross-engine support, XSS/privacy threats and storage durability; treat as production-hardening, not evidence that dev32 is already certified.

## P2P networking (user-confirmed product direction, NOT implemented)

- **Database-free P2P** must be useful without persistent server documents/accounts/cloud backups. A temporary in-memory rendezvous/signal service and STUN/TURN are permissible infrastructure choices; they are not a document database. If even signaling is offline, manual invitation/offer exchange can be a fallback with known network limits.
- **Explicit start online session**, from blank project, currently open work, browser library or imported WITT JSON, without overwriting the source. **Resume an existing room** is a distinct action. Room owner invites other people with readable short locator codes and stronger invitation links; the short code is not proof of authorized identity.
- Roles/capabilities: owner/admin, viewers, commenters, reviewers, editors and voters; default invites broadly capable, configurable per participant and optionally initial node quota (e.g. 5) to limit spam. Separate assessment participation, comment, edit and ballot rights; independently selected vote weights. The host/admin opens assessment stages and ballot rounds and chooses 0–100 slider, single-choice or K-of-N voting.
- **Host browser may crash or disappear**: room data replicated to peers and durable local browser stores; owner identity separate from active technical host; peers may continue when they have enough authority and durable copies. Owner can recover onto new device with external recovery proof and a surviving peer/snapshot. If every replica and backup vanishes, contents cannot be recovered. Handle 2-peer split/fork explicitly rather than falsely claiming an uninterrupted canonical history.
- Online changes, per-person assessments and scores must converge deterministically. Reuse same documented domain rules; do not introduce a second GRACE calculator in peers or a server.

**Proposed, not approved low-level design:** strict majority durable quorum, cryptographic hash-chain event log, exact key schemes, protocol envelopes, membership epochs, administrative action grammar, offline fork semantics, signaling implementation and cryptographic ballot anonymity. These are investigated in `P2P_NO_DATABASE_RFC_R1.md` and require explicit ADR/acceptance review.

## Future hosted product (separate product decision)

A server/database-backed collaboration mode could reuse the room command/event and permission contracts but requires separate SaaS-style hosting, auth/privacy, retention, costs, operations and licensing. **Do not make P2P depend on this product.**

## Other open design areas

- General reusable decision criteria with optional contextual defaults, without a third ordinary rating axis.
- Criteria/conditions inherited by option groups, including precise AND/OR and eligibility semantics; no implicit group-level score or ballot slot.
- Optional per-person **context-invariant** factual credence reuse across otherwise independent contextual occurrences; explicitly opted in rather than silently global.
- Richer, separately typed mindmap/freeform workspace as possible future editor, not scored as if it were a GRACE argument.
- Formal secret ballots, verified human identities and governance policies beyond display-only anonymity.

The optional history ZIP contains old experimental proposals, some mutually inconsistent. They are evidence of exploration, not a substitute for user approval.
