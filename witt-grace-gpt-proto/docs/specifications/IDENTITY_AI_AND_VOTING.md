# Current identity, AI, contribution and voting contract — dev32

## Identity and attribution

- Local profiles are persisted in document `users[]` with stable `id` and editable `name`, plus review/voting shares and local role flags. `"Minä"` is a default editable label, not a unique identity and not authentication.
- Node authorship (`createdBy`), last identifiable editor (`lastEditedBy`), comment authorship (`authorId` where present) and each assessment's `userId` must survive round-trips and imports. Renaming a user must not rename or replace user IDs. Provenance is best-effort for legacy edits; there is no full change-event log yet.
- An edit contributed by user B must NEVER be relabelled as user A simply because A was logged in locally at import. Unknown history is explicitly unattributed.
- A shared local document can have several **human** profiles. A multi-author contribution bundle (`witt-contribution-bundle-v1`) packages per-contributor v2 patches and lets recipients choose which to preview/accept. It is **not** the main `.witt.json` format.
- A diff export requires a user-selected original project JSON; it compares that with the modified project. Newly created nodes and reviews retain their authors; a historic edit with no `lastEditedBy` cannot be truthfully assigned to the currently selected user.
- AI profiles are separately typed: do not pass AI assessments into human means or claim that an AI result was authored by a human. A typed AI proposal is not automatically trusted.

## AI-assisted work: two independent workflows

**A. Create a whole new tree:** File/New/AI (also available on home). User supplies subject/context. UI constructs a **self-contained** text task containing instructions and JSON schema. Either **copy text** or **download exactly the same UTF-8 TXT**; no need to download a schema separately unless using an advanced tool. User sends task to an external AI in their chosen application, imports its JSON answer, sees preview, then accepts.

**B. Request input on current tree:** create an AI task based on the current document, or import contribution proposals from AI/another human. Proposals can suggest claims, edits, assessments, comments and links; preview and selection before applying. Import validation rejects malformed/unknown schema data, duplicates, invalid parent links and cycles. The assistant **never automatically calls a hosted model** from this prototype.

**Error handling:** clipboard blocked → show task visibly in selectable read-only text, not in an AI JSON reply field. AI review panel is read-only and does not change current human editing identity. Missing AI scores must be clearly missing; no fabricated results.

## Decisions, assessments and ballots

- Assessment of claims and impacts is **distinct from balloting**. Current options can be compared by scores/feasibility without a vote.
- For reviews, human aggregation can be `equal` (default), `shares`, or deliberately authored `structural`. With shares, every person's credibility and impact review is weighted separately. AI excluded by default. Unreviewed items are incomplete.
- In local decision voting, human participants have preference ballots on 0–100 sliders. Vote weights may be equal or share-based and are **snapshotted at round opening** with the eligible concrete option IDs. Prior rounds are kept as history; new round is a new decision record. Groups are not balloted.
- The local app is not an authenticated, legally binding or cryptographically secret election. "Anonymous" is currently a **presentation option**, not protection against inspecting document JSON or historical audit records. Never imply otherwise.
- A new user/session should not retroactively count or modify another person's ballot. Changing shares mid-round requires explicitly closing/canceling and opening a new round, not silent recalculation.

## Future P2P-specific decisions (design only)

- A conscious **Start online session** action, new blank/current/local library/file origin. Start-new-room is distinct from Resume-same-room; initial snapshot never overwrites source.
- Room owner distinct from technical sequencer; owner may nominate admins. Default invite privileges broadly allow editing/review/comment/vote, with optional per-person granular controls, initial node quotas (e.g. five new nodes), and viewer-only roles.
- High-entropy invitation link tokens may encode signed policy claims. A short code `EXDI9AW` locates a live session but is **not** proof of identity or authorization. A code without a rendezvous service requires manual exchange of WebRTC connection info.
- Admin starts assessment rounds and separately may open ballot, freezing options/eligibility/method. Future ballot methods can include 0–100 slider, select exactly one option, select up to K of N. Rules, quorum, rights, weighting and visibility require explicit session policy.
- Browser crash recovery and owner device replacement require peer replicas, durable signed event log, quorum/epoch handling and external recovery material. P2P has **no database** or mandatory backup service, and cannot promise survival if all replicas and exported data vanish.

These future requirements are specified fully in `docs/P2P_NO_DATABASE_RFC_R1.md`. The checked-in `src/p2p-host-engine.js` is an experimental authority module, **not** a working online room.
