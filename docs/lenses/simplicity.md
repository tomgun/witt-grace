---
lens: simplicity
intent: simplicity as a dedicated perspective: deletion, complexity pulled downward, one source of truth, illegal states, moving-part count; depth in the existing docs
generated: 2026-09-26
model: claude-fable-5-1
sources: ["docs/principles/CODE_QUALITY.md", "docs/principles/ARCHITECTURE_PRINCIPLES.md", "docs/spec/METHOD_INTENT.md (cognitive ease)", "model knowledge only — claude-fable-5-1"]
---
# Simplicity — lens

## Plan-time
- What does the plan delete or replace? Name the file, flag, check, rule line, or paragraph that goes away; a plan that only adds and names nothing is incomplete — record that as a finding, not a remark.
- Count the new moving parts the plan introduces (files, subagents, flags, hooks, checks, config keys, frontmatter fields, budgets) and write the number down; above three, name the design with fewer parts and the sentence in the plan that refuses it — if no such sentence exists, the refusal never happened.
- Which mechanism exists only because another mechanism, a subagent, or the model might misbehave (a check of a check, a retry wrapper, a safety copy, a reminder line repeating a gate)? Name it, then ask whether deleting the thing it compensates for costs less than the compensation.
- Does the plan quote a cheaper alternative it considered and the reason it was rejected? If the plan text has no such sentence, the simplicity of the chosen design cannot be judged — ask for the sentence before anything else.
- Deletion drill, one year out: if the whole feature were removed, how many other files would need editing to stay truthful (docs that point at it, checks that assume it, config keys that read it, templates that mention it)? List them; more than five means the feature is load-bearing for things it should not own.
Depth: docs/principles/CODE_QUALITY.md (ten code-time principles), docs/principles/ARCHITECTURE_PRINCIPLES.md (eight architecture lenses), docs/spec/METHOD_INTENT.md (cognitive ease and the non-goals; when values conflict, the simpler design that keeps the method invariants wins)
Self-report: state the count of new moving parts (files, subagents, flags, hooks, checks, config keys) and name the one thing the plan deletes or replaces — "nothing" is a valid answer only with the reason beside it.
