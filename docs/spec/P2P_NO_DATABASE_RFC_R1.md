# WITT / GRACE: Database-free P2P Collaboration RFC R1

> **Living specification.** Copied 2026-11-08 from the dev32 prototype handoff (`witt-grace-gpt-proto/docs/P2P_NO_DATABASE_RFC_R1.md`). Backticked source, test and tool paths (`src/…`, `tests/…`, `tools/…`) refer to the frozen prototype under `witt-grace-gpt-proto/` until the new implementation supplies its own evidence. Edit this file only through the change policy in `docs/spec/README.md`.

Status: **design RFC, not implemented**. Only the no-database boundary and explicit user workflow goals are agreed; **specific quorum, key, election, identity, and signaling protocols below remain proposals requiring review/ADR**.  
Baseline: WITT v0.11.0-dev32; native document schema v8; `evidence-v3-links` scoring.  
Date: 2026-11-08  
Decision: **The P2P mode MUST work without any persistent backend database or mandatory cloud backup.**

## 1. Decision and product boundary

P2P is a first-class, local-first WITT collaboration mode. It is not an incomplete implementation of a future hosted product. A separate server/database product may later implement the **same collaboration contracts** using different transport and persistence adapters.

**Allowed for P2P:** a static HTTPS website, WebRTC DataChannels, STUN, a small **volatile, in-memory signaling/rendezvous service** for human room codes and invitation links, and an optional TURN relay for networks that cannot establish direct connections. No service in that list is allowed to store WITT documents, assessments, ballots, snapshots, or history. TURN relays encrypted transport packets, not application storage. Manual signaling (copy/paste offer/answer) is an escape hatch if the rendezvous server is unavailable, but cannot solve all NAT/firewall constraints.

**Not allowed as an implicit dependency:** persistent backend accounts, backend DB, encrypted cloud archive, central document repository, always-on WITT application server, or SaaS identity. Short codes such as `EXDI9AW` require **some live rendezvous directory**; they are not feasible as reliable worldwide lookups with static hosting alone. That directory may be memory-only and lose all room registrations on restart; active WebRTC connections need not depend on it.

## 2. Two distinct kinds of authority

- **Room owner:** a durable public-key identity controlling room governance and recovery. Ownership is not a browser tab, nickname, or current network connection.
- **Administrator:** a participant explicitly authorized to admit/revoke seats, change policies and voting weights, start assessment stages, and open/close ballots according to the agreed room policy.
- **Active sequencer (technical host):** a currently elected peer assigning sequence numbers and proposing accepted events. It does NOT automatically obtain owner/admin privileges.
- **Replica voter:** a designated participant device with persistent local copy of the approved log, eligible to acknowledge events and elect the sequencer. Replica membership is distinct from argument-edit and ballot permissions.
- **Other peers:** authorized participants with synchronized read views, their own identity/assessments, and optional local read replicas.

The owner may disconnect or lose a browser without relinquishing ownership. The sequencer may fail over if an authorized quorum survives.

## 3. Canonical source of truth

There is no central master database. The **canonical room history** is the cryptographically linked, monotonically numbered, quorum-committed event log plus validated snapshots referencing a committed log hash. Every participating replica converges by replaying the same approved commands through the same pure WITT domain model.

Example envelope (illustrative, names to be fixed by ADR):

```json
{
  "roomId": "room-random-uuid",
  "epoch": 12,
  "sequence": 145,
  "prevHash": "sha256-of-commit-144",
  "commandId": "actor-unique-id",
  "actorId": "stable-public-key-identity",
  "expectedRevision": 144,
  "type": "claim.add",
  "payload": {"parentId": "node-x", "title": "Claim text"},
  "actorSignature": "...",
  "sequencerSignature": "..."
}
```

Committed events must be deduplicated by `commandId`. Their order, payload, result and durable quorum certificate are validated before publication. Snapshots carry `roomId`, `epoch`, last committed `sequence`, `lastHash`, document schema/scoring version and a digest of the validated project and room governance state. Never use wall-clock timestamps as a source of ordering.

Document data (claims, contextual reasons, comments, each person's separate credence and influence ratings), governance events, discussion stages and ballot state use versioned commands. The tree/card layout, zoom, open inspectors and personal filters remain **local view state**, not room-wide data by default.

## 4. Replica, acknowledgment, and persistence contract

The browser uses IndexedDB for event log, snapshots, pending commands, seat keys and room metadata. Request persistent storage with `navigator.storage.persist()` when available, report whether it was granted and offer ordinary `.witt.json` and room-recovery exports. IndexedDB is still not a hardware-guaranteed backup; users can delete the site data, private/incognito storage may vanish, and storage may be evicted by browser policy.

For **strict shared commits**:

1. Actor signs a command and submits it to current sequencer.
2. Sequencer authorizes the actor and command against the committed governance policy and current state.
3. Sequencer proposes an ordered event extending the previous committed hash.
4. A **majority of the fixed configured replica-voter set** verifies and persists the proposed event in IndexedDB and returns a signed acknowledgment.
5. A commit certificate (event hash + quorum acknowledgments) is distributed. Only then may UI display `Confirmed in room`.
6. Other peers catch up from the log, or request a verified snapshot plus subsequent events.

A command that has only been saved locally is `Pending locally`, never `Committed to room`. On crash between proposal and commit, re-elect, reconcile certificates, and retry idempotently; do not invent a committed event from an unconfirmed proposal. Pruning a log segment requires a verified, replicated snapshot and a retention policy preserving valid recovery.

**Replica quorum is calculated from the configured membership**, not from whoever happens to be online. Otherwise two isolated halves could both falsely claim to be the master. Changing replica voters requires a safe membership-transition protocol (joint authorization across old and new configurations or another proved protocol), not an arbitrary UI checkbox change.

### Availability by room size

| Replica voters | Crash outcome | Strict continuation |
| --- | --- | --- |
| 1 | Only the original local store or its exported backup can restore data | No automatic failover |
| 2 | If one disappears, the survivor can read/export its committed copy | No majority for new authoritative writes; offer **Fork into a new room** |
| 3 | If one disappears, the remaining two can establish a majority | Elect authorized sequencer and continue |
| 5 | If up to two disappear, three can continue | Elect and continue |

A room may have more attendees than replica voters. Warn gently when a session has only one replica. If people are temporarily split by a network partition, **only a partition with the configured majority** may commit. The minority is read-only for shared state but can collect local drafts for later explicit merge/review. Do not promise instant seamless continuity for 1- or 2-replica rooms.

## 5. Recovery without backend storage

### A. Original owner's browser crashes

If browser storage remains, restore local key and last snapshot, verify the elected peer's epoch/log, and replay missing commits. If other replica voters retain a majority, they can continue accepting changes while the owner is away.

### B. Owner changes browser/device

Owner imports an **offline, encrypted owner-recovery bundle** or obtains a signed transfer from an existing authorized owner device. The bundle contains proof of the owner's key and necessary room-key material, **not a promise of having the latest document**. The new device discovers an online peer, authenticates with a challenge, downloads and validates the latest committed snapshot/events, and then resumes its governance rights. The room code and display name alone never establish ownership.

If no peer is online, the owner can restore the **last exported room snapshot** as a local project; it may be stale. A separate export of room recovery keys without state cannot restore deleted content.

### C. Every peer closes their browser

Closing every browser is **not the same as losing every stored copy**. If IndexedDB records survive, a returning peer can reopen the most recent locally held snapshot and events. Once enough configured replica voters come back online they can re-establish the same committed room history and elect a sequencer; the temporary join code may need to be re-registered. Until then, the returning peer may inspect/export its copy but cannot unilaterally claim new shared commits without a quorum.

If **all stored replicas are deleted/corrupted** and no full snapshot/room archive has been exported, the room content is unrecoverable. Recovery identity keys alone do not replace document data. State both outcomes plainly in UI and product documentation.

### D. Two peers, host disappears, peer wants to continue

Surviving peer may keep the committed data and explicitly `Continue as a new room (fork)`, generating new `roomId`/epoch and displaying the origin and revision. It must not silently masquerade as a continuation of the original authoritative history; later merging the two room histories requires an explicit conflict-review process.

## 6. Invitations, identity, privacy, and membership

- Room ID: high entropy, not the short human code.
- Human code: temporary **locator** (e.g. `EXDI9AW`), never an access secret; joins via code require host/administrator approval unless an explicit safe policy says otherwise.
- Invite links: random high-entropy seat token (128 bits or greater), optional scoped/expiring permissions, signed by authorized inviter and validated by room peers. Avoid logging seat token in the signaling service; URL fragment can avoid sending it as an HTTP path/query. Forwardable links do not prove a real-world person.
- Each participant has stable public-key identity independent of nickname or local display name. Assign separate `seatId`, `actorId` and `deviceId`; one real participant may have multiple devices, subject to policy.
- Revocation prevents **future accepted commands** by revoked seats. It cannot erase data previously seen or exported by peers. Rotating encryption keys is required if future content confidentiality from a removed peer is promised.
- WebRTC protects transport, but an admitted participant with read permission can still copy visible room content. Do not claim DRM-style confidentiality.
- No login or back-end identity verification. Optionally offer an encrypted recovery export to participants for later device changes.

## 7. Permissions are independent capabilities

Suggested per-seat capability model (each can be enabled separately):

- `tree.read` (default for an admitted seat)
- `tree.add` with optional quota (e.g. 5 accepted nodes during first stage)
- `tree.editOwn`, `tree.editAll`, `tree.delete`
- `comment.add`
- `assessment.credence`, `assessment.influence`
- `ballot.cast`
- `invite.create`, `seat.admit`, `seat.manage`, `role.manage`
- `phase.manage`, `ballot.manage`, `room.export`
- `replica.vote`, `sequencer.eligible` (technical, distinct from editor/admin)

Default invitation: **can discuss, edit, assess, comment and vote**, subject to room policy. Viewer preset: `tree.read` only. Presets such as commenter, assessor, voter, editor, moderator and co-admin modify capabilities rather than hard-coding authority from one role string. Admin can change quotas and weights during ordinary collaboration via signed governance event, never by mutable client-side state. A disabled `ballot.cast` and a ballot voting weight of 0 are separate concepts. Assessment aggregation shares and ballot shares are independently configured and explicit; changes to shares must be committed and frozen for any active round where appropriate.

Changes on a replica or sequencer are **always enforced by the event validator**, never only by hiding UI controls. Limit payload sizes, rates, node counts and denial-of-service attempts.

## 8. Collaboration lifecycle and voting

Room stages are visible, explicit, and managed by an owner/admin: `Open discussion` -> `Assessing` -> optional `Voting` -> `Results` -> optional subsequent revision/round. Unlike the ballot snapshot, entering assessment need not force everyone to stop drafting: the host can set allowed actions separately. Each participant's assessments stay personal (with optional transparent equal/weighted aggregate projections). The GRACE argument balance is not the same as optional ballots.

An admin opens a voting round with an **immutable revision/digest of the alternatives, membership eligibility, ballot weights, and chosen method**. During voting, changes that would alter the frozen proposal are rejected or queued as draft until round closure/cancellation. Voting modes (pure independent strategy functions):

1. `rating`: preference/approval slider per option, 0..100, with explicit aggregation and abstention treatment.
2. `single`: exactly one alternative from N (or abstain).
3. `approval-k`: select at most K alternatives (e.g. 3 out of 10); specify whether 0 selections means abstention.

At round open freeze whether weights are one-per-person or governance shares, quorum rules, tie handling, result visibility, and whether ballots can be changed until closure. Ballots signed by stable seat identities; one effective ballot per seat per round, revisioned if changed. Initial technical host model **can see individual ballots**; hiding running totals from ordinary participants is not end-to-end secret voting. Never market ballot secrecy unless separately designed and verified.

After host failover, new sequencer loads the same committed ballot state and can continue according to identical room rules. No ballot result should depend on which device held the host role. Exports must distinguish the tree's evidence balance from ballot outcomes.

## 9. Shared code boundaries and project reality

Current dev32 has `src/core.js` pure domain logic, standalone import/validation and contribution modules, and `src/p2p-host-engine.js`. The latter is an **experimental local signed-command host authority**, not connected WebRTC, replicated durable storage, leader election, recovery, or multi-method voting. It currently supports a subset of commands/roles and single-option host-managed voting. An obsolete `docs/P2P_ROOMS.md` in the separate history archive said the room may end with the host. **This RFC supersedes that outdated assumption**; the old file is not an active spec.

Recommended boundaries for incremental PR work:

```text
src/domain/            # preserve and extract pure GRACE scoring, document commands
src/collab/protocol.js  # canonical envelopes, versioned schemas, hash/signatures
src/collab/room.js      # pure reducer of room governance and phase events
src/collab/permissions.js
src/collab/ballots.js   # pure strategies: rating, single, approval-k
src/collab/replication.js # ordered log, commit certificates, failover logic
src/collab/recovery.js # snapshot verification + identity restoration
src/storage/indexeddb.js
src/storage/room-export.js
src/transports/webrtc.js
src/transports/signaling.js # ephemeral memory service and manual negotiation
src/ui/room/            # UI adapters and informative state, not scoring
```

These paths describe **future modules**, not files that already exist. Avoid a premature React/TypeScript rewrite. Refactor existing code in small, behavior-preserving PRs with a pinned scoring contract and controlled fixture output.

## 10. PR roadmap / test gates

1. **ADR & contract**: lock database-free P2P requirements, explicit loss conditions, UX vocabulary, room phases, event and transport contracts. Assert in tests that networking cannot mutate scoring behavior.
2. **Pure collaboration model**: signed actor events; validated permissions and quotas; consistent identifiers; immutable revision/digest; replay/idempotency; golden numeric GRACE regression fixtures.
3. **Local persistence & manual recovery**: IndexedDB event log and snapshots, quota/persistence visibility, import/export of verified room archive and encrypted key bundle; crash-restart tests.
4. **Live transport & joining**: static HTTPS site, memory-only signaling service, random room/seat secrets, short lookup codes, STUN-only first if accepted, optional manual signaling; two real browsers.
5. **Replication and failover**: configured replica voters, majority acknowledgments, signed commit certificates, immutable committed log, sequencer election epochs, partition tests, no split-brain, two-peer explicit fork.
6. **Collaboration UX and roles**: invitation management, presets, granular capabilities, node quotas, comments, assessments, moderator controls, visible replica safety and connection status.
7. **Meeting phases & voting**: host/admin stage controls, freeze snapshot, rating/single/approval-k strategies, weighted/unweighted ballots, authenticated cast, reconnect during active round.
8. **Security and resilience**: malformed/replay commands, revoked identity, rejoin with restored keys, manipulated snapshots, corrupt storage, signal server restart, browser crashes, offline partitions, mobile browser suspension, cross-browser testing.

Minimum mandatory end-to-end scenarios:

- Three clients, replicated commits, kill sequencer, majority elects successor, all converge on exact event hashes and GRACE results.
- Two clients, kill sequencer, survivor can read/export, cannot commit to original without majority, explicit new-room fork works.
- Same owner returns in a new browser using recovery bundle and an online replica; name alone cannot impersonate owner.
- All browsers closed with IndexedDB intact: a peer can reopen its last confirmed copy and later reconnect to the quorum. All stored replicas lost with no full archive: UI honestly reports unrecoverable content. If a backed-up snapshot exists, import it with its last known revision and warning.
- Unauthorized viewer cannot send accepted edits or ballots, even if they edit browser JS directly.
- Multiple local users retain distinct node/relation reviews and provenance after synchronization and user rename.
- Active vote, host crashes, authorized successor continues same frozen round; ballots are not duplicated, weights not silently changed.
- Network partition: only the configured majority may commit; minority can keep local drafts but cannot claim authoritative success.
- Static server and memory-only signaling never receive or persist document content.

## 11. Non-negotiable user-facing limitations

1. **No database, no cloud recovery guarantee.** Browser closure alone does not destroy IndexedDB; but if all stored replicas and backups disappear, room history is lost.
2. **Two replicas do not provide both automatic write failover and strong single-history safety.** Recover/export/fork is supported; unconditional continuation is not promised.
3. **A short join code needs a live rendezvous mechanism.** With no signaling service, exchange WebRTC signaling manually. Network connection may still fail behind restrictive NAT without TURN.
4. **Browser storage is not an infallible backup.** Provide explicit downloadable recovery archive; distinguish local, replicated and exported states.
5. **Admitted viewers can copy what they can read.** Revoking permission blocks future access/commands but cannot claw back previous exports.
6. **Display names are not identities.** Authenticated participant keys/seat IDs are needed; losing recovery keys may mean losing identity.
7. **Strong secret ballots are not included by default.** The sequencer/host may see live ballot contents until a separately audited secret ballot protocol exists.
8. **No silent conflict resolution.** Concurrent incompatible edits need a review or documented deterministic policy; no overwriting another author's assessments.

## 12. User-facing status vocabulary

Provide consistently translated UI states:

- `Saved on this device` -- local IndexedDB write successful.
- `Waiting for peers` -- command proposed but not room-committed.
- `Confirmed by room replicas` -- majority commit certificate validated.
- `Another host is taking over` -- failover in progress; read-only shared state.
- `Cannot continue this room safely` -- lost quorum, export or start an explicit copy.
- `Backup downloaded` -- verified room archive exported by user, including stated revision.
- `Recovery key saved separately` -- grants identity proof, **not** restoration of document without replicas or data archive.

Always distinguish *participation/technical host status*, *room ownership*, *local data durability*, and *agreed current room revision*.

## 13. Future hosted product

A separate server/database adapter may later become the sequencer, persistent log and recovery service while retaining the same versioned commands, immutable score engine, participant IDs, role/phase policies and ballot strategies. That is a **different product/deployment** with operating costs and security obligations. It is not required for database-free P2P and must not become a hidden dependency.

---

**Acceptance of this RFC is an architecture decision only.** No networked P2P feature, durable majority replication, or host recovery is claimed to be implemented in dev32.


## 14. Starting from existing work (user decision, 2026-11-08)

Room creation MUST offer: (1) a new blank WITT tree, (2) the currently open local project, (3) another document from the local document library, (4) an imported `.witt.json` file. This **creates a new room** and copies a validated initial document snapshot; it must not overwrite or mutate the source. The operator sees a readable summary (document name, mode, last edit timestamp if known, number of claims and participants) before publishing to invited peers. Existing individual reviews, comments and attribution records retain stable original author IDs; pre-existing local users do NOT become authenticated room members automatically. A new vote round is separate from earlier ballot history. Explicitly inform the owner how later room edits can be exported or saved to a local project.

A fifth, clearly separate path — **Resume previous P2P room** — requires that room's identity, committed log/certificates, peer replicas and authentic recovery credentials. Importing a plain `.witt.json` does not magically recreate a previous room's governance history or prove its owner. The room code alone is merely a locator.

**Acceptance:** new room from each source keeps the source checksum unchanged; a room can be initialized from a document having multiple humans and distinct context reviews; a fork and a resume must have distinguishable room identities and UI labels. No backend database, no mandatory cloud archive, no hidden server-side document persistence.

## 15. Live collaboration v1 (owner decision 2026-11-11, WG-030)

The owner asked for a first, smaller step before the full room design above: invite others into the open document (or a new blank one) and edit and assess it together, with nothing stored in a cloud. It is a deliberate subset of this RFC, not a replacement.

**What v1 is.**
- One **host** (the person who starts) is the active sequencer of §2 for the whole session: its document is authoritative, it applies its own commands and every participant's proposal through the same pure `applyCommand`, and sends each accepted command as a numbered commit (`seq`, the command, the host's `now`, the acting seat's id, a digest of the resulting document). Participants apply only commits, in order; a gap, a refused replay or a digest mismatch fetches a snapshot from the host. There is no quorum, no replica voter set, no signed log and no failover to another peer. The host's browser keeps the session (secret, non-extractable signing key, seats, invites) in IndexedDB, so a reload of the host continues the same session with the same links; participants wait up to two minutes (`reconnecting`), then rejoin by their seat. When the host ends the session, or does not come back, everyone keeps their copy as ordinary local work (§5D).
- **Identity**: each participant is a stable user id in the document. Every link names its own door with its own 128-bit token: the **general** link admits a new person under the name they type (made unique), never an existing profile; a **personal** link carries a name the host fixed (an existing profile or a new name) and is held by the first browser that opens it, which can always come back with the same link; a **password** link carries a fixed name too and admits any browser whose PBKDF2 proof of the password (600 000 rounds, salted with the host key fingerprint and the invite token) matches, one connection at a time (a newer browser takes the seat over), five wrong tries lock it until the host opens it again. A new link for a person revokes their earlier links and seats without touching their profile. The host hands each seat a 128-bit token that the browser keeps per room for seven days, so the same person returns after closing the tab. Display names stay labels (§6).
- **Rights** (§7, reduced): participants may edit the tree, links, reusable reasons, the title and the base theme, and only their own assessments, abstentions, ballots and comments; governance (people, shares, weighting, scoring method, mode, author visibility default, ballot rounds) stays with the host. The host enforces this per command type, deny by default; hiding a control is never the enforcement.
- **Invitations** (§6): the link fragment carries a 128-bit room secret, the host key fingerprint and optionally a personal token; it never reaches a web server and the app removes it from the address bar on arrival. The signaling relay sees only SHA-256 derivations of the secret (room id, password) and offers encrypted with that password. The host proves itself with an ECDSA P-256 signature over the participant's nonce, so another link holder cannot pose as the host. The host can stop admitting by general link and remove anyone.
- **Transport** (§1): WebRTC data channels; signaling through public Nostr relays (default during development) or relays the host names (`wss:`; plain `ws:` only on the same machine), so the owner's own relay can replace the public ones without code changes; Google and Cloudflare STUN; no TURN yet. The relay stores nothing and never sees document content.
- **Limits**: 20 seats; a participant message ≤ 64 kB, a snapshot ≤ 5 MB; 10 proposals a second per seat (burst 50).
- **Undo** is off while a session is open and the history is cleared at its start and end (undo replaces whole documents, which peers cannot replay). Opening another document leaves the session (a participant is told to leave first; the host's session ends); the host replacing the same document (an AI or proposal merge) sends it to everyone as a snapshot.

**Not in v1** (still this RFC): durable logs and snapshots in IndexedDB, replica quorum, failover and election, owner recovery keys, room phases, ballots managed by the room, fine-grained capability presets, TURN, manual signaling.

