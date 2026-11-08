---
lens: type-safety
intent: typed boundaries, invariants in types, no `Any` leaks, exhaustive matching
generated: 2026-10-03
model: claude-fable-5-1
sources: ["Parse, don't validate — Alexis King, 2019, and its Python/Kotlin restatements (WebSearch 2026-10-03; fetch blocked by the sandbox firewall, content from the search summary and model knowledge)", "typing.python.org guide: Unreachable Code and Exhaustiveness Checking — assert_never, --warn-unreachable (WebSearch 2026-10-03)", "docs/principles/CODE_QUALITY.md (Illegal states unrepresentable) and docs/principles/SECURITY_PRINCIPLES.md (Trust-boundary validation), read; this starter adds the type-level mechanics only", "model knowledge — claude-fable-5-1"]
---
# Type safety — lens

## Plan-time
- For each trust-boundary crossing the plan adds or changes (docs/principles/SECURITY_PRINCIPLES.md § Trust-boundary validation; security Q1 enumerates them), name the ONE function whose return type is the inward value, and that type. Count the crossings whose inward value is still a string, a dict or a list of unknowns.
- Which invariants does the plan state in prose — "one of these statuses", "non-empty", "sorted", "a basename, not a path" — and which of them does a type carry under docs/principles/CODE_QUALITY.md § Illegal states unrepresentable, so the checker refuses the state before any runtime check runs? Count the prose-only invariants.
- Where does `Any`, `unknown`, `object`, an untyped dict or a bare string stand in a signature the plan adds or widens, and what narrows it before first use? Name each site; an unnarrowed one in a public signature is a finding.
- For each closed set the plan branches on (an enum, a status vocabulary, a union of variants), does every branch end in the checker's exhaustiveness guard — `assert_never`, a never-typed default, a sealed `match` — so that adding a member fails the checker rather than falling into a default arm at runtime? Count the branches with a guessing default.
- Which type checker runs on this code (the mypy / pyright / tsc / clippy class, or the compiler's own strict flags), in which strictness mode, and in which pre-commit, test or CI step by name? Errors must fail the step; a language with no checker is stated as such, with the runtime assertion that stands in.
Depth: docs/principles/CODE_QUALITY.md (Illegal states unrepresentable), docs/principles/SECURITY_PRINCIPLES.md (Trust-boundary validation)
Self-report: the count of entry points whose parser emits a typed value, and the one invariant that lives only in prose (or "none", naming the type that carries each).

## Code-time
- Annotate every new or changed public signature fully; no `Any`, `unknown` or untyped container crosses a module boundary without a narrowing at the receiving side (docs/lenses/type-safety.md)
- End every branch over a closed set with `assert_never` or the language's never-typed guard, never an `else` that assumes; the set itself is typed per docs/principles/CODE_QUALITY.md § Illegal states unrepresentable (docs/lenses/type-safety.md)
- Run the project's checker (mypy, pyright, tsc, clippy or the compiler's strict mode) on the changed files before proposing the commit; a new error is a bug in the diff, and a suppression comment needs a one-line reason beside it — or, where the project configures none, name the runtime assertion at the boundary that stands in (docs/lenses/type-safety.md)
