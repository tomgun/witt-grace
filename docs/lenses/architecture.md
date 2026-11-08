---
lens: architecture
intent: a dedicated reviewer for structurally heavy features, beyond the panel's always-on eight-lens input; depth in ARCHITECTURE_PRINCIPLES
generated: 2026-10-10
model: claude-fable-5-1
sources: ["A Philosophy of Software Design (Ousterhout) — deep modules, information hiding, the cost-versus-benefit of an interface (WebSearch 2026-10-10; content from the search summary and model knowledge, no page fetched)", "Building Evolutionary Architectures (Ford, Parsons, Kua) — fitness functions as the automated check of an architectural property; ADRs as its record (WebSearch 2026-10-10)", "docs/principles/ARCHITECTURE_PRINCIPLES.md (read in full; the eight lenses the planner already self-reports — this starter asks only what a dedicated reviewer adds)", "model knowledge — claude-fable-5-1"]
---
# Architecture — lens

## Plan-time
- Is this feature structurally heavy? Count the structural facts the plan changes: a new module or package, a new persistent store or schema, a new process, service or trust boundary, a new external dependency, an import direction reversed. Zero or one means the panel's always-on eight lenses already cover it — say so as the first finding and stop; the lens earns its spawn at two or more.
- Draw the dependencies the plan adds as `A → B` lines, one per import or call across a module boundary. Does any arrow point from shared infrastructure into a feature, from a lower layer into a higher one, or close a cycle? Count the arrows that reverse an existing direction; each one is a finding naming the pair.
- Does the plan quote a second module boundary that shares no module with the first, with both interfaces written out (what each caller must know), and the sentence that picks one? A second sketch that differs only in implementation is not a second design; a plan with no sketch names the chosen interface's caller-visible item count instead, and that count is the finding when it exceeds five.
- For each structural property the plan claims — no cycle, one boundary module per vendor, an import cap, "X never imports Y" — which test or check turns red when a later change breaks it? Name the test; a property no check watches is a wish, and the finding names the check to add.
- Which decision in the plan costs more than a day to reverse a year out (a stored schema, a public interface, a wire format, a process boundary)? Each such one is recorded in `docs/ADRS.md` (a row naming the alternative rejected) in the plan's own commit; count the expensive decisions with no record.
Depth: docs/principles/ARCHITECTURE_PRINCIPLES.md (eight architecture lenses)
Self-report: the count of structural facts the plan changes (the weight), and the one claimed property no check watches (or "none", naming the check per property).
