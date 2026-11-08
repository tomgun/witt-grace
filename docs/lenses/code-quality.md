---
lens: code-quality
intent: the ten docs/principles/CODE_QUALITY.md principles as a dedicated diff reviewer, by pointer; plan-time: module boundaries and seams
generated: 2026-10-03
model: claude-fable-5-1
sources: ["docs/principles/CODE_QUALITY.md", "docs/principles/ARCHITECTURE_PRINCIPLES.md", "model knowledge only — claude-fable-5-1"]
---
# Code quality — lens

## Plan-time
- Which module gains a job it did not have before this plan? Name every file whose one-line job sentence changes after the change; above two, name the plan sentence that says why the job lands there instead of in a new module — if no such sentence exists, the boundary moved by accident.
- What must a caller know after the change that it did not need before (a new argument, an ordering rule, a flag, a state to check first)? List each item; one the plan does not push below the interface is a finding, not a remark.
- Where is each volatile dependency (clock, filesystem, subprocess, network, environment) isolated? Name the one function that touches it and the pure function that decides without it; a plan in which the decision and the I/O share a function names no seam.
- Which fact gains a second home — a constant restated in a doc, a list mirrored in a test, a format string repeated in two modules? Name the single owner or the derivation that replaces the copy; "none" is valid only with the files checked beside it.
- Which seam will a test use to run each new decision without I/O? Name the function and its input shape; when the only way to exercise a branch is the real CLI, disk or git, the module boundary sits in the wrong place.
Depth: docs/principles/CODE_QUALITY.md (ten code-time principles), docs/principles/ARCHITECTURE_PRINCIPLES.md
Self-report: the count of files whose one-line job changes, and the one fact that now has two homes (or "none", naming the files checked).

## Code-time
- Read each changed function's inputs under Explicit dependencies and its I/O under Functional core, imperative shell; cite the hunk and the principle together, never the principle alone (docs/lenses/code-quality.md)
- For every constant, list or format string the diff adds, apply One source of truth and Duplication over wrong abstraction: name the existing home it should derive from, or the real occurrences that justify the extraction (docs/lenses/code-quality.md)
- For every new branch or null check, apply Illegal states unrepresentable and Define errors out of existence before Fail fast and loud judges what remains (docs/lenses/code-quality.md)
- Judge each new name under Naming as compression and each new parameter or layer under Pull complexity downward; propose the replacement name or the inlining, not a remark (docs/lenses/code-quality.md)
- Before the verdict, state under Module size vs. context window whether each touched module was reviewed whole or from fragments; a fragment review says so and never claims the hunk verified (docs/lenses/code-quality.md)
