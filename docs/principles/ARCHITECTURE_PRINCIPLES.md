---
title: Architecture-Time Principles
purpose: >
  Eight architecture-shape lenses applied at plan time — by the planner while
  drafting (the planning skill's standing instructions) and by the
  critic/advocate plan-review panel. These properties are cheapest to get
  right before code exists and expensive to unwind after.
status: normative
audience: [planners, plan-review critics, plan-review advocates, humans]
---

# Architecture-Time Principles

Distilled in our own words — never quoted — from John Ousterhout's *A
Philosophy of Software Design* (deep modules, tactical-vs-strategic,
design-it-twice, general-purpose-vs-special-purpose) and an external
AI-code-shipping course (the rest).

<!-- framework note: this list is closed. A new concept is a deliberate decision: a dated CHANGELOG entry plus a row in
docs/ADRS.md, never a side effect of a review. Copied from the owner's agentic-af-for-claude harness via price-alert-platform; the
original byte cap is kept as a convention, not enforced here. -->

## Coupling and cohesion

A module has one clear job and can change its internals without other modules
being touched. Coupling is born the moment convenience picks a dependency —
the moment an agent reaches for an already-imported module because the data
happens to be there.

- Before approving any diff, ask the blast-radius question: if this module's
  internals were rewritten completely, what else would break? "I'd have to
  check" already means trouble.
- More than ~10 imports in a business-logic file is a red flag.
- Give every file one job, written as one line at its top, with no "and".
- Review diffs by asking what the change now depends on that it did not
  depend on before.
- Self-report habit: after each change, name any new dependency the touched
  files gained and the single one-line job of each file touched.

## Feature over layer

Organize directories by feature, not by kind: things that change together live
together. Genuinely cross-cutting infrastructure (logging, auth middleware,
db client) stays shared — the test: does it change when a feature changes?

- One idea touching four-plus files earns a thirty-second why.
- Co-locate the scattered pieces of one feature rather than reorganizing
  heroically; migrate a layered legacy one feature at a time.
- Self-report habit: report how many files one idea touched, and why.

## Deep modules, narrow interfaces

The best module is a small interface hiding real complexity. A big file is not
automatically a problem; a big interface almost always is.

- Write the interface first, before the implementation.
- Count what the caller must know: if calling it correctly requires reading
  its source, the interface is not real.
- Delete pass-through methods whose body is one call with the same arguments.
- One 400-line module with a five-function interface beats four 100-line
  modules with twenty.
- Self-report habit: after a refactor, state what each new module now hides.

## Isolate the volatile

Volatile dependencies — vendors, external APIs, anything that changes on
someone else's schedule — are contained so their churn never spreads.

- Exactly one boundary module per vendor, speaking our domain language.
- Nothing else imports the vendor, and no vendor types leak out of the
  boundary.

## Optimize for deletion

A feature that can be deleted cleanly was built with honest boundaries;
deletability is the cheapest observable proxy for low coupling.

- Before building, run the deletion drill: name exactly the directories,
  routes, tables, columns, config, and cron jobs removing the feature would
  touch.
- Features depend on shared infrastructure, never on each other;
  cross-feature data goes through a defined interface, never into another
  feature's tables.
- Delete dead code for real — never commented out, never behind a dead flag.

## Tactical vs. strategic

Complexity arrives incrementally and no alarm ever fires. Working code is not
the goal; working code that stays understandable and changeable is.

- Any shortcut trading future understandability for today's speed is a named,
  logged tradeoff — never a silent default.
- The remedy is incremental too: leave each touched area slightly better than
  found.

## Design it twice

The first design that comes to mind is rarely the best available, and a
second sketch is cheapest exactly now, at plan time.

- Sketch at least two genuinely different module boundaries before
  committing.
- Compare their interfaces, not their implementations.

## General-purpose vs. special-purpose

Somewhat general-purpose modules stay simpler and deeper than modules bent
around their first caller.

- A module mixing general logic with one caller's special case is a red flag.
- Push the special case up into the caller.
