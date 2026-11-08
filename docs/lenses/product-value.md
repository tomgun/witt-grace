---
lens: product-value
intent: why a user/player chooses this over alternatives; must-have vs. nice; what makes them leave
generated: 2026-10-10
model: claude-fable-5-1
sources: ["Kano model — must-haves (absence is outrage, presence unnoticed), performance attributes, delighters (WebSearch 2026-10-10; content from the search summary and model knowledge, no page fetched)", "Marty Cagan, SVPG — the four big risks: value, usability, feasibility, business viability (WebSearch 2026-10-10)", "Jobs-to-be-done — a role hires a product for a job in a situation, judged by the outcome (model knowledge)", "docs/spec/METHOD_INTENT.md (purpose, interaction priorities and non-goals; this lens asks only what the plan must add)", "model knowledge — claude-fable-5-1"]
---
# Product value — lens

## Plan-time
- Which named role from the vision's Who section does this feature serve, and what job do they hire it for — written as the situation they are in and the outcome they judge it by? A beneficiary of "users", or the team itself where the vision names no such role, is no value claim: name the role or record the absence as the finding.
- What does that role do today without this feature — a manual workaround, a competing tool, nothing — and what does switching cost them (time, data, habit)? "Nothing" is either a must-have gap or a feature nobody asked for; the plan must say which and cite the evidence (a request, a support thread, a measured drop-off), and a plan citing none names the riskiest value assumption instead.
- Classify every requirement: must-have (its absence makes the role leave), performance (more is better — name the number), or delighter (unexpected, forgiven when absent). Count the must-haves; a plan whose requirements are all delighters is the scope the next cut removes, and a must-have with no "they leave when" sentence is unclassified.
- What makes the role stop using this — the one failure, delay or confusion after which they return to the alternative? Name the trigger and the requirement that guards it; a leave trigger no requirement guards is the finding, with the requirement to add.
- Which observable after shipping shows the value landed — a repeat use, a switch from the alternative, a number read in a named release, a quoted reaction — and who reads it? "They will like it" is not an observable; count the requirements with none.
- Does the vision's Not now or out-of-scope list forbid any part of the plan, and where it does, which value item in the plan justifies crossing it? Count the collisions; one with no justifying sentence is the finding.
Depth: docs/spec/METHOD_INTENT.md and docs/spec/FUTURE_BACKLOG.md (purpose, priorities and non-goals)
Self-report: the named role and job, the count of must-have requirements, and the one leave trigger no requirement guards (or "none", naming the guarding requirement per trigger).
