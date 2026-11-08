---
lens: testing
intent: test quality end to end: which essentials (happy path, every error path, boundaries, concurrency) the plan's `## Tests` covers and which `must:` has only a smoke test; tests seen red before green; oracle quality, determinism, flake risk, seams; in diff mode "what change to this code would these tests miss?" — recommended for every feature that owns tests
generated: 2026-09-26
model: claude-fable-5-1
sources: ["Google Testing Blog: Flaky Tests at Google and How We Mitigate Them (WebSearch 2026-09-26)", "Seams — Working Effectively with Legacy Code, Feathers, InformIT excerpt (WebSearch 2026-09-26)", "A Comprehensive Study of Pseudo-tested Methods, arXiv 1807.05030 (WebSearch 2026-09-26)", "model knowledge — claude-fable-5-1"]
---
# Testing — lens

## Plan-time
- Per `must:` line, which of {happy path, each error path, boundary (empty/zero/max/off-by-one), concurrency where two writers exist} does its `test:` cover — and how many `must:` lines are covered only by a smoke test (exit 0, file exists, "ran without exception")?
- Does every node in `## Tests` name the broken implementation it will be seen RED against, and is that break one a real mistake would produce (inverted condition, dropped branch) rather than "delete the function"? Count the nodes that name none.
- Oracle: does each assertion compare the real outcome (exit code AND the specific stdout/stderr text, file content, or returned value) to an expected literal, or only that something ran / a substring exists / a mock was called? Name any test that would still pass if its output were swapped with another `must:`'s output.
- Determinism: does any test read the wall clock, network, env vars, cwd, `$HOME`, dict/set/directory ordering, or use a sleep/retry? For each, name the injection point the plan uses (fixed clock, tmp_path, fake transport); "none" is the answer that fails.
- Seams: which seam does the plan add or reuse so the decision logic runs without real I/O (subprocess, git, disk, prompts)? If a test must spawn the real CLI, is it at most one per `must:` and does a pure-function test cover the same branch?
- Diff-mode: name one plausible change to the owned code (inverted condition, dropped error branch, off-by-one, swapped argument) under which every listed test still passes — and the test the plan adds to catch it.
- Is every error path the spec names (each refusal, `blocked:` route, fail-closed branch) asserted by a test that checks the specific message or exit code, not merely non-zero?
Self-report: the number of `must:` lines whose test covers only the happy path, and the one named error path or boundary with no test (or "none", naming the test that covers each).

## Code-time
- Assert the outcome, not the call: compare returned value, file content, or exit code plus message to an expected literal; a mock-was-called assertion alone is not a test (docs/lenses/testing.md)
- One behaviour per test, named as the spec line it proves (`test_status_refuses_when_owns_file_missing`), never `test_status_2` (docs/lenses/testing.md)
- No sleeps, wall clock, network, or real cwd/HOME in tests — inject clock, transport and paths, use tmp_path, sort order-dependent results before asserting (docs/lenses/testing.md)
- Write boundary and error-path cases (empty, zero, max, missing file, bad input) before the happy path; each asserts the specific message or code, not merely non-zero (docs/lenses/testing.md)
- A test that cannot fail (asserts True, asserts on its own fixture, still passes with the function body replaced by `pass`) is deleted, not kept for coverage (docs/lenses/testing.md)
