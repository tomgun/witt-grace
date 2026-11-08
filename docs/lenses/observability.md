---
lens: observability
intent: logs, metrics, traces, runbooks, deploy and rollback
generated: 2026-10-10
model: claude-fable-5-1
sources: ["Google SRE Book ch. 6 Monitoring Distributed Systems — the four golden signals (latency, traffic, errors, saturation); ch. 4 SLOs and error budgets (WebSearch 2026-10-10; content from the search summary and model knowledge, no page fetched)", "docs/lenses/resilience.md and docs/lenses/performance.md (read; failure modes and resource ceilings are theirs, this starter asks only how each is SEEN afterwards)", "model knowledge — claude-fable-5-1"]
---
# Observability — lens

## Plan-time
- For each operation the plan adds or changes, which of the four golden signals does it emit — latency, traffic (requests, invocations, frames, runs), errors, saturation — under which metric or log field NAME, from which line? For a CLI or library "traffic" is invocations and saturation is the held-resource ceiling performance Q5 names. Count the operations that emit none; "it will be in the logs" with no named field is the finding.
- For each failure mode the plan names (resilience Q1 enumerates them), what is the ONE record a reader uses afterwards to tell it from the others — its level, its message, and the identifiers it carries (run or request id, the input's name, the exit code)? Count the modes that share a record with another or carry no identifier.
- Which new record could carry a secret, a token, a whole payload or a person's data, and what redacts it at the format call? docs/principles/SECURITY_PRINCIPLES.md § Secrets handling and privacy's inventory say what must not appear; name each record the plan adds that formats a request, an environment or a row whole.
- When one operation crosses a process boundary (subprocess, hook, subagent, queue, remote call), which identifier is passed across it so one reader can join the records on both sides? Name it per boundary; count the boundaries that pass none.
- Which SLO in `## Project specifics` does the change bear on, which alert or check fires when it is breached, which reader from `## Project specifics` receives it, and which runbook step they run first? An alert with no reader, or a runbook step that says "investigate", is the finding; count the alerts with either.
- For each deploy-shaped step the plan implies (a release, a vendored copy, a config or hook change, a migration step), what is the health signal and the number that says "good" within N minutes afterwards, and what is the rollback command and how long it takes (the data step's reversibility is data Q7's)? Count the steps with no named signal or no rollback command.
- What is the emitted log and metric volume per operation at the input size performance Q2 names, and what bounds it — a level threshold, a sample rate, a rotation — with its number? Unbounded emission is the outage observability causes.
Self-report: the count of operations emitting a named signal over the count added or changed, and the one failure mode a reader could not tell apart afterwards (or "none", naming the record per mode).

## Code-time
- Log every error path where it is decided, with its cause, the identifiers a reader needs to find the input, and a level; never a secret, token or whole payload — redact at the format call (docs/lenses/observability.md)
- Emit the four golden signals per operation the diff adds — latency, count, errors, saturation — as named structured fields the plan committed to, never prose a reader must grep for (docs/lenses/observability.md)
- Pass one correlation identifier across every process boundary the diff adds (subprocess, hook, subagent, remote call) and put it on every record on both sides (docs/lenses/observability.md)
- Ship a deploy-shaped change with its health signal and its rollback command written where the operator reads them (runbook, commit or PR), never one without the other (docs/lenses/observability.md)
- Bound every new log or metric stream with a level threshold, a sample rate or a rotation, stated with its number (docs/lenses/observability.md)

## Project specifics
- SLOs: none — a static client application with no server. The health signals are `npm run check` green on main, the Pages deploy green, and no console error on first load of `/` and `/proto/` in a fresh profile
- dashboard readers: the owner, reading GitHub Actions and `docs/STATUS.md`
- runbooks: none yet; deploy is the Pages workflow on `main`, rollback is a revert on `main`
