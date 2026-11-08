---
name: review
description: Periodic quality review — run the plan-time questions of the chosen lenses (default: architecture, code-quality, security, ux-usability, testing, simplicity, privacy, api-compat) against the whole system, file findings as GitHub issues and record the round in CHANGELOG.md. Use at milestones, before a public deploy of the new app, and when the owner asks.
disable-model-invocation: true
---
Input: `$ARGUMENTS` — lens names separated by spaces, or empty for the default set. Available lenses: the files in `docs/lenses/`.

1. For each lens, spawn one reviewer agent with: the lens file `docs/lenses/<lens>.md`, the three files in `docs/principles/`, `docs/STATUS.md`, `docs/ARCHITECTURE.md`, the spec the lens touches most (`docs/spec/GRACE_AND_DATA_MODEL.md` for architecture/testing/api-compat, `docs/spec/UX_AND_WORKFLOWS.md` for ux-usability, `docs/spec/SECURITY_AND_PRIVACY.md` for security/privacy), and read access to the repo. Ask it to answer every plan-time question of its lens against the system as it is today (not a diff), with file:line evidence, to rank findings by severity, to propose the concrete change for each, and to end with the lens's self-report line.
2. Collect the findings. Deduplicate across lenses. For each finding that is real and actionable: `gh issue create --title "<lens>: <finding>" --label P1 --body "<evidence, proposed change, lens, self-report>"` (use P0 only for data-loss, scoring-drift or security findings). If `gh` is unavailable, append them to `docs/ISSUE-PLAN.md` under "Review findings" and say so.
3. Append to `CHANGELOG.md` under Unreleased: `Reviewed: <YYYY-MM-DD> <lens list> → #<issue numbers> (self-reports: <one line per lens>)`.
4. Print the ranked findings with their issue numbers.

Cadence (in CONTRIBUTING.md): testing + simplicity with every feature via `/feature`; ux-usability after each user-facing milestone against the prototype; security + privacy before the first public deploy of the new app and when a trust boundary changes; architecture at WG-003, WG-007 and before P2P.
