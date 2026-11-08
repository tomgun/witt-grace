# Documentation map — read X when doing Y

Always: `README.md` (quick start, layout) and `docs/STATUS.md` (what exists, what is verified, what is next). Everything else is read when the task touches it.

| Doing | Read |
| --- | --- |
| Anything that changes what the app does | `docs/spec/README.md`, then the spec it names: `METHOD_INTENT.md` (why), `GRACE_AND_DATA_MODEL.md` (the math and the document), `UX_AND_WORKFLOWS.md` (the interface), `IDENTITY_AI_AND_VOTING.md` (people, AI, ballots), `REQUIREMENTS.md` (the IDs) |
| Any change under `src/`, `locales/` or `schemas/` | `docs/ARCHITECTURE.md` |
| Writing or reviewing tests, generating golden fixtures | `docs/TESTING.md`, `docs/PROTOTYPE_REFERENCE.md` |
| Adding a dependency, changing a boundary, re-opening a decision | `docs/ADRS.md` (one row per decision) |
| Changing a spec, or finding code and spec disagree | `docs/spec/README.md` (change policy), `docs/spec/CHANGELOG.md` |
| Picking work | `docs/ISSUE-PLAN.md` (P0 first), later the GitHub milestone |
| Planning a feature or a review round | `docs/principles/*` and the lens docs in `docs/lenses/` the change earns (`/feature`, `/review`) |
| Running or comparing against the prototype | `docs/PROTOTYPE_REFERENCE.md`; the prototype's own docs under `witt-grace-gpt-proto/docs/` are history, not instructions |
| Privacy, storage and what the app must never claim | `docs/spec/SECURITY_AND_PRIVACY.md` |
| Future collaboration | `docs/spec/P2P_NO_DATABASE_RFC_R1.md` (agreed boundary; proposed protocol), `docs/spec/FUTURE_BACKLOG.md` |

Conventions: `STATUS.md` owns implemented/designed/verified; `CHANGELOG.md` owns what changed and review rounds; `ADRS.md` owns decisions; `docs/spec/` owns required behaviour and is locked; `ISSUE-PLAN.md` and GitHub issues own what is next. If code and a document disagree, the code wins and the document is fixed in the same PR, except for `docs/spec/`, where the mismatch is recorded and the owner decides.
