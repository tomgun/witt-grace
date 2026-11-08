---
title: Security Principles
purpose: >
  Five security lenses applied while code is written, reviewed, and
  re-scanned on demand — by every implementer and fix subagent (five
  standing lens lines in the implementing skill's spawn template), by the
  verifier at `/verify` as a per-requirement review input, and by any
  security scan fired by hand.
status: normative
audience: [implementer subagents, fix subagents, verifiers, security scans, humans]
---

# Security Principles

Written fresh for this framework: the old repo's universal security knowledge
file played this role — the role is backported, the content is not.

<!-- framework note: this list is closed. A new concept is a deliberate decision: a dated CHANGELOG entry plus a row in
docs/ADRS.md, never a side effect of a review. Copied from the owner's agentic-af-for-claude harness via price-alert-platform; the
original byte cap is kept as a convention, not enforced here. -->

Platform-specific security concerns (keychain rules for mobile, injection
surface for web, and the like) live in the platform docs under `docs/domain/`,
which state the platform-specific rules on top of this universal baseline;
where a domain doc repeats a universal rule, the wording here governs.

## Trust-boundary validation

Untrusted data is defined by where it entered, not by what it looks like:
anything crossing into the system — user input, network responses, files,
environment — stays untrusted until the boundary has judged it.

- Trace every external input from entry point to use; know the full path
  before trusting any step of it.
- Validate and normalize at the boundary, once, and pass typed values
  inward — inner code consumes proven values, never raw input.
- A validation check repeated deep in the core is a smell: the boundary is
  leaky or the type it emits is too loose.

## Secrets handling

A secret that touches the wrong surface is already leaked; the goal is to
make the wrong surfaces unreachable, not to be careful near them.

- Secrets never appear in code, logs, error messages, or version control.
- Platform secure storage or injected configuration only — never a
  hardcoded value, never a committed fallback.
- A leaked secret is rotated, never quietly re-hidden: deleting the line
  does not delete the history that carried it.

## Injection and OWASP awareness

Every place untrusted data meets an interpreter — SQL, shell, HTML, file
paths — is an injection surface, and string concatenation is how it opens.

- Use parameterized queries for SQL, and argument arrays — never
  interpolated strings — for shell commands.
- Apply context-aware escaping wherever untrusted data is rendered or
  embedded: HTML bodies, attributes, URLs, file paths.
- Review changes against the OWASP top ten by name — a named checklist
  beats recall every time.

## Least privilege

Broad access is a standing liability: the blast radius of any compromise is
exactly what the credential could touch, not what it was meant for.

- Tokens, scopes, file permissions, and service accounts get the minimum
  that works — start narrow, widen only on proof of need.
- Broadening any grant is a logged decision, never a silent convenience.

## Dependency risk

Every dependency is code you ship without writing it; its transitive tree
and its maintainers are part of your attack surface.

- Always pin versions — a floating ref is an unreviewed future change.
- Review what a new dependency pulls in before adopting it; prefer
  maintained libraries over convenient ones.
- Treat the lockfile diff as part of the review — that is where the real
  change lives.
