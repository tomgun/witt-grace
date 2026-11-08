# WITT / GRACE requirements and traceability ledger (handoff)

> **Living specification.** Copied 2026-11-08 from the dev32 prototype handoff (`witt-grace-gpt-proto/docs/specifications/REQUIREMENTS_TRACEABILITY.md`). Backticked source, test and tool paths (`src/…`, `tests/…`, `tools/…`) refer to the frozen prototype under `witt-grace-gpt-proto/` until the new implementation supplies its own evidence. Edit this file only through the change policy in `docs/spec/README.md`.

This is the **current product/method ledger** for Claude Code PRs. `Implemented` means the dev32 baseline includes an implementation and meaningful tests; it does **not** certify production readiness. `Partial` means some working subset and known gap; `Planned` means no end-to-end implementation, even if experimental source exists. Test references are baselines, not proof that every corner case is covered. The full detailed contracts are in `GRACE_AND_DATA_MODEL.md`, `UX_AND_WORKFLOWS.md`, `IDENTITY_AI_AND_VOTING.md` and `P2P_NO_DATABASE_RFC_R1.md`.

## Domain and scoring

| ID | Status | Requirement (non-regressible) | Evidence |
| --- | --- | --- | --- |
| G-01 | Implemented | Argumentation and Decision are separate modes, one canonical v8 graph document. | `src/core.js`, `tests/core.test.cjs` |
| G-02 | Implemented | Credibility `p` 0–100%, signed relationship influence `w` -5…+5 with half steps; no extra value slider. | `tests/weighted-upward-dev20.test.cjs` |
| G-03 | Implemented | Public signed explanatory balance -100..+100; neutral 0; no calibrated truth probability. | `tests/signed-balance-dev21.test.cjs` |
| G-04 | Implemented | Recursive leaf → intermediate → root/option propagation; no automatic grandchild double count. | `tests/deep-argument-propagation-dev20.test.cjs` |
| G-05 | Implemented | One perfect +5 support = +50 display, two = +100; opposite -5 = -50. | `tests/evidence-v2-dev21.test.cjs`, `tests/handoff-contract.test.cjs` |
| G-06 | Implemented | Missing/incomplete/stale review is distinct from neutral numeric result. | `tests/weighted-upward-dev20.test.cjs` |
| G-07 | Implemented | Equal human review mean default; optional shares-weighted human mean; structural preview deliberate. | `tests/weighted-upward-dev20.test.cjs` |
| G-08 | Implemented | AI viewpoints isolated from human aggregate; active human editor does not change when viewing AI. | `tests/assessor-perspective-dev14.test.cjs`, `tests/ai-human-isolation.test.cjs` |
| G-09 | Implemented | A decision question and an option group get no truth/index/ballot; only concrete options. | `tests/group-context-dev19.test.cjs` |
| G-10 | Implemented | Deep hard conditions are evaluated separately from argument balance; unknown distinct from unmet. | `tests/deep-argument-propagation-dev20.test.cjs` |
| G-11 | Implemented | Values can be qualitatively weighted but do not automatically increase fact-derived numeric score. | `tests/secondary-scoring-dev26.test.cjs` |
| G-12 | Implemented | Same reason concept, separate target-use nodes, separate per-human `p` and `w`. | `tests/recurring-unified-dev29.test.cjs` |
| G-13 | Implemented | Advanced explicitly locked shared-reason values remain separate from contextual reuse. | `tests/shared-reasons.test.cjs` |
| G-14 | Implemented | Explicit secondary relationship influences target, participates in recursive sum, has independent signed edge rating. | `tests/secondary-scoring-dev26.test.cjs` |
| G-15 | Implemented | Converging routes are counted and shown as neutral information, never silently removed. | `tests/replacement-route-info-dev30.test.cjs` |
| G-16 | Implemented | Thesis in argument mode scores with no explicit root credence review, based on descendants. | `tests/compact-assessments-root-dev22.test.cjs` |
| G-17 | Planned | General criteria catalog with coherent inherited defaults and context overrides. | `FUTURE_BACKLOG.md` |
| G-18 | Planned | Group-wide prerequisite inheritance AND/OR with precisely scoped options. | `FUTURE_BACKLOG.md` |
| G-19 | Planned | Optional context-invariant human credence sharing without overriding per-target impacts. | `METHOD_INTENT.md` |

## UX and offline workflow

| ID | Status | Requirement | Evidence |
| --- | --- | --- | --- |
| UX-01 | Implemented | Clean `Argumentointi | Päätös` mode selector, no redundant canvas instruction. | `src/app.js` and `index.html` |
| UX-02 | Implemented | File/Edit/View/Help information architecture; examples and tutorial under Help; view highlights under View. | `tests/navigation-direction-dev27.test.cjs` |
| UX-03 | Implemented | Optional guided assessment plus direct free editing, fixed neutral review questions. | `src/app.js` and `tests/decision-guided-review-dev8.test.cjs` |
| UX-04 | Implemented | `75%/+5` personal vs italic pooled ratings; score displayed separately. | `tests/compact-assessments-root-dev22.test.cjs` |
| UX-05 | Implemented | Signed assessed effect overrides *displayed* +/- creation direction, without changing model relation. | `tests/navigation-direction-dev27.test.cjs` |
| UX-06 | Implemented | Node/tree/table with collapsible branches, adjustable depth and manual hierarchy layout. | `tests/depth-vote-png-dev18.test.cjs` |
| UX-07 | Implemented | Toistuvat perustelut shelf + drag/attach; selected contextual use is visible and individually rated. | `tests/recurring-unified-dev29.test.cjs` |
| UX-08 | Implemented | `Luo kirjastoon` creates visible selected card even if title field blank. | `tests/library-create-and-studio-dev25.test.cjs` |
| UX-09 | Implemented | Direct node action "Liitä myös muihin solmuihin…" promotes existing without losing children/reviews. | `tests/recurring-unified-dev29.test.cjs` |
| UX-10 | Implemented | Secondary edges can be inspected; standard creation of more uses uses contextual occurrences. | `tests/recurring-unified-dev29.test.cjs` |
| UX-11 | Implemented | Themed workspace incl. Bitberg, local-only theme, 9 languages. | `tests/i18n-coverage.test.cjs`, `tests/library-create-and-studio-dev25.test.cjs` |
| UX-12 | Implemented | DAW-style panel controls left of language/theme, `Alt+1..4`; View dock button toggles/anchors, draggable, `Alt+V`. | `tests/view-dock-header-dev32.test.cjs` |
| UX-13 | Implemented | Keyboard pan/zoom and view-only filters don't change saved arguments. | `tests/keyboard-orientation-v0101.test.cjs` |
| UX-14 | Implemented | New/open replacement prompt identifies title/mode/nodes and timestamps, no false auto-archive. | `tests/replacement-route-info-dev30.test.cjs` |
| UX-15 | Implemented | Low-prominence browser-save status; actual errors visible. | `tests/multi-author-contributions.test.cjs` |
| UX-16 | Implemented | PNG single first + tiling fallback; SVG/PDF multi-page and layer selections; exports are non-mutating. | `tests/visual-export-dev13.test.cjs`, `tests/pdf-pagination-dev17.test.cjs` |
| UX-17 | Implemented | Mobile 390px layout, modal scrolling and panel accessibility basics. | `tools/smoke-dock-header-dev32.py` |
| UX-18 | Planned | Separate mindmap and freeform visual canvas editor type, no silent mixing into GRACE scores. | `FUTURE_BACKLOG.md` |

## Users, proposals and decisions

| ID | Status | Requirement | Evidence |
| --- | --- | --- | --- |
| U-01 | Implemented | Multiple named local human profiles with stable IDs, mutable display name, local selector direct add. | `tests/multi-author-contributions.test.cjs` |
| U-02 | Implemented | Node creation/last editor/comment/review author IDs; never relabel imported authors; unknown legacy attribution disclosed. | `tests/multi-author-contributions.test.cjs` |
| U-03 | Implemented | Multi-human contribution bundle as diff against selected original, selectable import, separate author IDs. | `tests/multi-author-contributions.test.cjs` |
| U-04 | Implemented | AI-assisted NEW full-tree task separate from AI/HUMAN changes to an existing tree; manual AI roundtrip. | `tests/workspace-ai-starter.test.cjs` |
| U-05 | Implemented | Copy AI task and TXT download are byte-equal; schema already included; technical export optional. | `tests/ai-task-choices-dev28.test.cjs`, `tools/smoke-ai-task-choices-dev28.py` |
| U-06 | Implemented | AI proposal JSON validates and previews before mutation; AI/human profiles not conflated. | `tests/contributions-v2.test.cjs` |
| V-01 | Implemented | Decision preference slider optional; argument result/feasibility available before vote. | `tests/personal-decision-ranking.test.cjs` |
| V-02 | Implemented | Ballot round snapshots alternative IDs, weights and audit/history; group is not a ballot. | `tests/core.test.cjs`, `tests/group-context-dev19.test.cjs` |
| V-03 | Implemented | Voting shares can differ from assessment weighting. | `tests/weighted-upward-dev20.test.cjs` |
| V-04 | Implemented | Draft sliders don't reset other unsubmitted choices on each save. | `tests/depth-vote-png-dev18.test.cjs` |
| V-05 | Planned | Online ballot modes (slider, one-of-N, K-of-N), quorum, abstention, tie and permission rules. | `P2P_NO_DATABASE_RFC_R1.md` |

## Future network collaboration — NOT implemented end to end

| ID | Status | Requirement | Evidence / design |
| --- | --- | --- | --- |
| P2P-01 | Planned | Explicit "start online room" from blank/current/library/file; keep source unchanged, separate same-room resume. | `P2P_NO_DATABASE_RFC_R1.md` §13 |
| P2P-02 | Planned | Owner/admin, sequencer, peers, stable signed identity; room code locator and signed high-entropy invitations. | `P2P_NO_DATABASE_RFC_R1.md` |
| P2P-03 | Planned | User rights: edit, assess, comment, vote, viewer; adjustable node quotas; default broad access. | `P2P_NO_DATABASE_RFC_R1.md` |
| P2P-04 | Planned | Replicate validated signed events and snapshots in peers' IndexedDB; quorum before "committed". | `P2P_NO_DATABASE_RFC_R1.md` |
| P2P-05 | Planned | Browser crash host succession, owner recovery across devices with keys and peer data, explicit forks. | `P2P_NO_DATABASE_RFC_R1.md` |
| P2P-06 | Planned | Works without persistent backend DB; volatile rendezvous/STUN/TURN optional, manual signaling fallback. | `P2P_NO_DATABASE_RFC_R1.md` |
| P2P-07 | Planned | Host/admin-controlled assessment/ballot stage transitions and frozen round policy. | `P2P_NO_DATABASE_RFC_R1.md` |
| P2P-08 | Planned | Distinct future hosted database product may reuse protocol, but is not implicit P2P infrastructure. | `P2P_NO_DATABASE_RFC_R1.md` |

## Correctness notes for contributors

Some dev5/dev19/dev20 documentation describes **historical formulas**, not this v8 release. In a conflict, identify actual runtime behavior and write a new explicit decision/ADR before modifying tests or claiming a historical formula is authoritative. This ledger is intentionally not a demand to implement every planned row in the first refactoring PR.
