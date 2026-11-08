# WITT / GRACE product specification — index and change policy

These files are the **living product and method contract** for the new WITT implementation. They were lifted from the dev32 prototype handoff on 2026-11-08 and describe behavior the prototype already has and the owner has confirmed. The new implementation must satisfy them; it does not get to reinterpret them.

## Read in this order

| File | What it fixes | Status vocabulary |
| --- | --- | --- |
| `METHOD_INTENT.md` | Why GRACE has exactly two rating axes, what the balance means, cognitive-ease priorities, non-goals. | Owner-confirmed intent |
| `GRACE_AND_DATA_MODEL.md` | Ontology, exact `evidence-v3-links` formula with pinned numeric examples, human/AI aggregation, contextual reuse, groups, gates, values, persistence rules (G-01…G-06). | Contract |
| `UX_AND_WORKFLOWS.md` | The refined UI behavior to preserve: modes, menus, docking, repeated-reason shelf, reviews, ballots, AI flows, exports (UX-A…UX-E). | Contract |
| `IDENTITY_AI_AND_VOTING.md` | Stable author IDs, AI isolation, contribution bundles, ballot rounds. | Contract |
| `REQUIREMENTS.md` | Requirement ledger with IDs (G-xx, UX-xx, U-xx, V-xx, P2P-xx) and status Implemented / Partial / Planned. | Lock list |
| `SECURITY_AND_PRIVACY.md` | What the local-first app does and does not promise. | Contract + non-claims |
| `FUTURE_BACKLOG.md` | Agreed directions versus mere design proposals. | Not a work order |
| `P2P_NO_DATABASE_RFC_R1.md` | Database-free collaboration. Only the no-database boundary and user workflow are agreed; protocol details are proposals. | RFC |

`CHANGELOG.md` in this folder records every change to these files.

## Change policy (deliberately light)

1. **A spec change is its own change.** Never edit `docs/spec/**` as a side effect of a code change. Open a separate commit or PR whose only purpose is the spec change, and add one line to `CHANGELOG.md` saying what changed and why the owner decided it.
2. **Code and spec disagree → record, don't fix silently.** Write the mismatch down (which file, which requirement ID, observed behavior, expected behavior) in the PR or in `CHANGELOG.md` under "Open mismatches", then ask the owner which side wins.
3. **Numbers are pinned by tests.** The worked examples in `GRACE_AND_DATA_MODEL.md` G-02 and the requirement IDs in `REQUIREMENTS.md` are reproduced as golden unit tests in the new implementation. A test that has to change to pass is a spec change, and follows rule 1.
4. **A new formula needs a new name.** Any intentional change to scoring, missingness, weighting, eligibility or ballot semantics gets a new scoring-version identifier. `evidence-v3-links` is never silently redefined.
5. **Requirement IDs are permanent.** Add new IDs; never renumber or reuse old ones. A dropped requirement is marked `Withdrawn` with a date, not deleted.

Owner approval is always required for: new scoring semantics, `.witt.json` format changes, identity or authentication schemes, who can see individual reviews, any upload of data outside the browser, P2P governance decisions, automatic external AI calls, licensing, and major UI redesign.
