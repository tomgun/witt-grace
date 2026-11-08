---
lens: resilience
intent: error handling, failure modes, degradation, retries, idempotency, recovery
generated: 2026-09-26
model: claude-fable-5-1
sources: ["AWS Builders' Library: Timeouts, retries, and backoff with jitter (WebSearch 2026-09-26)", "Google SRE Book ch. 22: Addressing Cascading Failures (WebSearch 2026-09-26)", "Release It! (Nygard) stability patterns: timeouts, circuit breaker, bulkhead, fail fast (WebSearch 2026-09-26)", "Crash-Only Software, Candea & Fox, HotOS IX 2003 (WebSearch 2026-09-26)", "model knowledge — claude-fable-5-1"]
---
# Resilience — lens

## Plan-time
- For each external dependency the plan touches (network, disk/filesystem, subprocess, clock, third-party service), does the plan name it and list its failure modes (unreachable, slow, partial or corrupt result, wrong answer) with the exact message, exit code or field the user sees for each — how many dependencies, how many modes?
- When a named dependency is down, which listed operations still work and which stop, and is every partial failure surfaced (non-zero exit, error line, marked field) rather than returned as an empty or default result that looks like success?
- For each operation the plan retries: what is the max attempt count, the backoff base and cap, is jitter applied, and is the operation idempotent — or is a non-idempotent write (create, send, commit, push) retried without an idempotency key?
- Does every blocking call (socket, HTTP request, subprocess wait, file lock, prompt for input) carry an explicit timeout value written in the plan, and what happens on expiry: fail, fallback, or retry?
- If the process is killed after step N of M, what state is left on disk, in git, or at the remote, and does re-running the same command complete without manual cleanup (crash-only: stop by crashing, recover by restarting)?
- For each error path inside an enforcement or gate path (hook, check, verifier), does the plan state fail-closed (block) or fail-open (allow) explicitly, and is every fail-open choice justified in writing?
- Is resource use per dependency bounded (max concurrent calls, pool size, queue depth, retry budget) so one slow dependency cannot exhaust the whole process — or does the plan say why a bulkhead is unnecessary here?
Self-report: the count of dependencies and failure modes enumerated, the max retry count and the one non-idempotent operation retried (or "none"), and the number of error paths that fail open (or "0").

## Code-time
- Put an explicit timeout on every blocking call (subprocess, socket, HTTP, lock, input); an unbounded wait is a bug, not a default (docs/lenses/resilience.md)
- Retry only idempotent operations, with a max attempt count, capped exponential backoff and jitter; never retry a write that lacks an idempotency key (docs/lenses/resilience.md)
- Make partial failure visible: a skipped or degraded step exits non-zero or prints a named warning; never return an empty result as if it were success (docs/lenses/resilience.md)
- Write state so a kill at any line is recoverable: temp file plus atomic rename, one state transition per step, and a re-run completes without manual repair (docs/lenses/resilience.md)
- In enforcement paths default to blocking on any unexpected error: a gate that cannot evaluate must refuse, never pass (docs/lenses/resilience.md)
