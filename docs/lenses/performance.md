---
lens: performance
intent: budgets, hot paths, measure before/after, resource ceilings
generated: 2026-10-03
model: claude-fable-5-1
sources: ["hyperfine(1) man page — --warmup, --runs, -N/--shell=none, multiple commands compared in one run (WebSearch 2026-10-03; fetch blocked by the sandbox firewall, content from the search summary and model knowledge)", "Python startup time notes (Victor Stinner) and -X importtime per-module import table (WebSearch 2026-10-03)", "model knowledge — claude-fable-5-1"]
---
# Performance — lens

## Plan-time
- For each operation the plan adds or changes, what is the budget as a number — wall time, memory, bytes written, calls made — and under which input size does it hold? A plan that says "fast" or "lightweight" with no number has no budget; count the operations that have one.
- Which of the plan's operations run once per process, and which run per item of an input that grows (per file, per record, per feature, per frame, per request)? For each per-item one, name its cost against that N and the N at which the budget breaks.
- What is the measured number BEFORE the change and which command produced it — `hyperfine --warmup 3` on the command line, `python -X importtime` for interpreter startup, or a profiler run on the named function — and does the plan commit to the same command after? A before/after claim with no command is unverifiable.
- Does the change add work to startup or first use (an import, a file read, a connection, an initialisation) that the common invocation never needs? Name each such item and its cost in milliseconds; "it is small" is not a number.
- What is the ceiling on each resource the plan HOLDS — memory, buffers, caches, open files, bytes written — and what happens at the ceiling: refuse, degrade or stream? A ceiling with no stated behaviour at the limit is unbounded (concurrency, pool and queue bounds are resilience Q7's, not asked again here).
- Which test or CI step turns red when the budget is exceeded by two times? Name it (a unit test asserts the counting seam of Code-time 5; a wall-time budget is a CI benchmark step); a budget no test watches is prose the next change will silently break.
Self-report: the count of operations with a numeric budget and a named before/after command, and the one per-item hot path with no bound (or "none").

## Code-time
- Measure before you optimise and cite the numbers in the commit: `hyperfine` for a command, `-X importtime` for startup, the profiler for a function; a speed-up stated without a before/after pair is a guess (docs/lenses/performance.md)
- Keep per-item work out of loops over the growing input: no file read, subprocess, pattern compile or network call inside a loop that one call before the loop could serve (docs/lenses/performance.md)
- Load lazily what only one path needs: nothing on the startup path imports, reads or connects for a feature the common invocation never reaches (docs/lenses/performance.md)
- Bound every collection, buffer, cache and open-file set the diff adds with a size and a behaviour at the limit; stream what need not be held whole — concurrency and queue depth are docs/lenses/resilience.md's (docs/lenses/performance.md)
- Where a budget exists, add a test that asserts the cost it bounds through a counting seam (calls, reads, subprocess spawns, bytes against N), never elapsed time; wall-clock numbers come from `hyperfine` or a benchmark step in CI outside the unit suite (testing Code-time 3 governs the suite) and are cited in the commit (docs/lenses/performance.md)
