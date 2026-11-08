---
title: Code-Time Quality Principles
purpose: >
  Ten code-shape lenses applied while code is written and reviewed — by every
  implementer and fix subagent (ten standing lens lines in the implementing
  skill's spawn template) and by the verify step (`/verify`) as a per-requirement
  review input.
status: normative
audience: [implementer subagents, fix subagents, verifiers, humans]
---

# Code-Time Quality Principles

Distilled in our own words — never quoted — from an external AI-code-shipping
course (eight concepts) and John Ousterhout's *A Philosophy of Software
Design* (pull-complexity-downward and define-errors-out-of-existence).

<!-- framework note: this list is closed. A new concept is a deliberate decision: a dated CHANGELOG entry plus a row in
docs/ADRS.md, never a side effect of a review. Copied from the owner's agentic-af-for-claude harness via price-alert-platform; the
original byte cap is kept as a convention, not enforced here. -->

## Explicit dependencies

A function says what it depends on. Hidden inputs — globals, env reads,
singletons — make code impossible to test in isolation, reason about, or
call correctly.

- Pass config, clock, and database in as arguments; no globals, env reads,
  or singletons below the startup layer.
- Read config once at startup, validate it, fail hard, pass the result down.
- Take the clock as an argument wherever time affects a decision.
- No work at import time.
- Kill order dependencies with types, not comments: init() returns what
  process() needs, so it cannot be called wrong.
- Self-report habit: report any implicit dependency added.

## Functional core, imperative shell

Decision logic lives in pure functions taking inputs as arguments with no
I/O; the shell only gathers inputs, calls the decision, and carries out the
result — roughly fifteen lines.

- Name the decision as a noun-shaped function (canAccessLesson,
  calculateRefund).
- The first if appearing in the shell is where erosion starts.
- Test the core exhaustively and the shell only lightly. Test-quality
  litmus: could this test pass with a broken implementation? If yes, the
  test is too weak — and the answer is measured, not guessed: break the
  implementation on purpose (a mutation probe) and watch the test fail
  before trusting it; the verifier repeats the probe at `/verify`.
- Self-report habit: flag any conditional logic added to the shell.

## One source of truth

Duplicate knowledge, not duplicate lines, is the problem: one fact restated
in three places will one day be updated in two.

- Ask: if this fact changed tomorrow, how many places would I edit?
- Derive rather than restate — generate types from the schema, derive client
  validation from the server's definition.
- Search for an existing definition before adding any rule, price, limit,
  or status value.
- Never merge two values only coincidentally equal today.
- Code history has one home — git blame, commit messages, LOG.md, ADRs —
  never a comment: no 'used to be', 'previously we sent X', 'renamed from Y',
  'moved here in the refactor'. Write every comment as if the current code is
  the only code that ever existed. One exception, one line: load-bearing
  history — a trap someone will re-introduce, a constraint a human raised, an
  upstream bug being worked around.
- Say a fact once: not repeated across handler, use-case, and client — put it
  at the layer that owns it.

## Duplication over wrong abstraction

A wrong abstraction couples callers that never belonged together, and every
later change pays for it; duplication is cheaper to unwind.

- Wait for the third real occurrence before extracting.
- Distinguish essential similarity (same concept, changes together) from
  incidental (looks alike today, will diverge).
- The first boolean flag added to fit a new caller is the abstraction
  failing; two flags means inline it back into the callers and re-extract
  only what truly belongs.
- Self-report habit: when a shared abstraction would have fewer than three
  real call sites, report that instead of silently adding a flag.

## Illegal states unrepresentable

Model, do not validate: a state that cannot be constructed needs no check,
no defensive test, and no bug report.

- Use tagged unions instead of flag-plus-optional-value pairs, literal
  unions instead of bare strings.
- A bad state that cannot be constructed needs no check.
- Self-report habit: before adding a null check, say why the model could
  not prevent the state.

## Fail fast and loud

Applied after define-errors-out-of-existence has had its pass (its section
below): for the error cases that remain representable, the worst outcome is
not a crash but a plausible wrong answer produced later, far from the cause.

- Never swallow an exception.
- Ban truthy-default fallbacks: ?? or crash on missing config — a deploy
  that refuses to start is a good day.
- Never use optional chaining to hide a value that should exist.
- Every error names the operation, the record, and what was expected.

## Naming as compression

A name that will not come is a design problem announcing itself early.

- A name you cannot write without 'and' marks where to split.
- Ban filler words: handle, process, manage, data, info, item, utils.
- Name by intent, not implementation: getUser survives dropping the cache;
  getCachedUser lies or forces a rename.
- Booleans read as positive assertions, never negatives.
- Use the existing term for a concept, never a synonym.
- A name needing a comment to explain it has lost the plot — rename to what
  the comment says (displayName, not name plus a clarifying comment); a
  name must not omit part of what the function actually does.
- Comments earn their place by saying what the code cannot: explain why, not
  what — a comment restating the line below it is deleted; 1–2 lines is the
  norm, and a comment longer than the code it describes belongs in docs/.

## Module size vs. context window

A module small enough to load and reason about in full is the first
non-arbitrary size target the field has had: an agent (or a person) editing
from fragments cannot verify its own change.

- Keep each module small enough to load and reason about in full.
- Narrow honest interfaces let an agent work inside a module without
  loading its dependents.
- Self-report habit: when work was done from fragments of a file rather
  than the whole, say so instead of presenting the change as verified.

## Pull complexity downward

A module's callers outnumber its implementation; complexity a caller must
carry is paid at every call site.

- Push complexity into the implementation rather than leaking it to
  callers.
- Each new layer must add a genuinely different abstraction, not pass
  arguments through.

## Define errors out of existence

The pinned order: design the error out of existence first; fail fast and
loudly for whatever remains.

- Before writing error-handling code, ask whether the API or type design
  can make the error case impossible; apply fail-fast only to what remains.
- Fail-fast-and-loud (its section above) governs the residue; it is never a
  substitute for this pass.
