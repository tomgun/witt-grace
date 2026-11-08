# GRACE method and WITT interaction intent — source-aligned dev32

**Nature:** user-driven rationale, with implementation references. The current tested `src/` is stronger evidence of what *works today* than this prose. The method's purpose and newer user decisions still matter: if source and user intent disagree, record the gap instead of silently modifying either.

## Purpose and cognitive ease

WITT is a **reasoning workbench**, not a form-heavy dashboard or a black-box decision oracle. GRACE is the method: claims, relations, epistemic uncertainty, other people's independent reviews, option comparison and optional ballots. The tree, table, dock, themes and files are WITT interaction choices. A cognitively approachable workflow lets a person first **write the reasoning**, then **assess what they choose**, and understand why a displayed result follows. Guided review is optional; direct editing is equally valid. Do not bury the main tasks under metadata dialogs or mandate a wizard.

## Method invariants already reflected in code

- **Exactly two ordinary quantitative judgement axes:** subjective fact/outcome **credence** 0..100%, and the **signed influence / significance of a specific relation** -5..+5 in half steps. There is **no third numerical rating** for value importance. A 0 influence is a personally neutral relation; conflicting positive and negative users are disagreement, not individually neutral assessments.
- For conditional/predicted premises, the **same written reason may have different credibility and impact in different target contexts**. Ordinary repeated-reason use is concept identity + separate per-target occurrence nodes and per-person reviews. Explicit old `sharedReasons[]` are intentionally **locked** shared masters: do not secretly make all repeated uses share one credence.
- Truth-bearing premises, **subjective values** and **hard feasibility gates** are distinct. A value is not a factual 100% claim; a failed hard prerequisite should not be outvoted by a sufficient sum of support. A decision question and an option group are not additional decision alternatives.
- The reason balance is a **bounded explanatory heuristic**, not Bayesian probability, expected utility, moral truth or a mandate to select an option. For actual formula and missingness behavior read `src/core.js` and `specifications/CURRENT_GRACE_AND_DATA.md`.
- An authored primary +/- direction is only the structural starting point. Each human (and separately each AI) can assess that exact relationship negative, positive or neutral. Personal ratings and missing values must never be fabricated by displaying/aggregating others.
- Vote/ballot weighting is independent of assessment aggregation. A user's decision-ballot shares may optionally weight the **per-input mean of human assessments** when explicitly selected. Default is equal humans, not weighted expertise. Ballot rounds are separate from reason indices, and do not imply secret votes.
- Explicit multi-route arguments participate in the current engine. **No automatic semantic deduplication** or forced weakening of deliberately authored routes. A neutral informational route note is appropriate; it must not sound like an error.

## Interaction priorities that are regression-sensitive

- Author a claim quickly; add support or objection with +/-; optionally refine numeric relation sign later. Editing and reviewing should be possible in the tree/inspector without excessive clicking.
- Tree and hierarchy stay readable, and a table can summarize direct relation, parent context and review. Hidden, collapsed or off-screen arguments are still part of the *same domain document* and score, unless explicitly deleted.
- Reusable reasons should become visible **as soon as** attached. Direct **"Liitä myös muihin solmuihin…"** avoids having to go through a hidden library. Copying concept text is not the same as copying ratings.
- Expose what each number means. Entered credence/impact are not the derived score; missing review `—` differs from neutral zero. Human aggregation is distinguished from a personal and AI viewpoint. AI reviews do not become votes or human ratings.
- Keep the carefully refined menus, mobile layout and workspace controls: Help for examples/tutorial, View for visual filters, Edit for structure, low-prominence browser save status, Bitberg theme, four panel toggles, mobile-friendly draggable view settings, keyboard camera and meaningful export views.
- AI-assisted *new project* is different from importing *proposed edits to an existing project*. Copying the task and downloading its TXT are two delivery methods for the same complete prompt/schema. Users must preview incoming JSON before choosing any changes.
- A local WITT document can include multiple named people; each identifiable author's changes and assessments retain their stable IDs through exports/imports. Display names may change without altering identity. Unknown legacy edit author is **unknown**, never retroactively assigned.
- Replacing a local project requires deliberate confirmation that identifies the current work; one automatic browser save is not a perpetual document-history service or backup.

## Selected non-goals and policy boundaries

No automatic merge of similar claims, no extra utility/priority slider, no silent scoring version changes, no automatic remote AI submission, no pretending local users are authenticated people, no promise of confidential/cryptographic ballots, no implicit data upload to a cloud backend. The optional future P2P mode must work **without a persistent backend database**.

### Important evidence hierarchy

1. Source code and reproducible tests characterize the *implemented* app; note untested/ambiguous behavior explicitly.
2. This document preserves product/method intent and approved high-level boundaries.
3. Detailed active specs are indexed in `HANDOFF_START_HERE.md`. Older rationale exists only in the separate optional legacy archive. Several historical notes mention `heuristic-v1`, v5/v6 or non-scoring crosslinks; **do not apply them to v8**.

For executable source/test anchors see `specifications/REQUIREMENTS_TRACEABILITY.md` and `REVIEW_REPORT.md`.
