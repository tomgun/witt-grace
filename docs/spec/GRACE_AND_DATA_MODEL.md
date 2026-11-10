# Current GRACE method and data contract — verified dev32

> **Living specification.** Copied 2026-11-08 from the dev32 prototype handoff (`witt-grace-gpt-proto/docs/specifications/CURRENT_GRACE_AND_DATA.md`). Backticked source, test and tool paths (`src/…`, `tests/…`, `tools/…`) refer to the frozen prototype under `witt-grace-gpt-proto/` until the new implementation supplies its own evidence. Edit this file only through the change policy in `docs/spec/README.md`.

**Status:** active baseline, compiled against v8 code and existing tests. This is a characterization of the working prototype, not an attempt to assert philosophical correctness for the numeric heuristic.

## G-01: ontology and units

- `decision`: a question/root, NOT a factual claim with a truth rating. Decision alternatives are `option` nodes; a `group` contains alternatives but does NOT become an additional rated/votable option. `argument` mode has a main claim/root with a computed explanatory balance.
- A `claim` may be a fact, assumption, value, constraint or prerequisite; semantic type affects whether probability scoring and feasibility rules apply. A value judgement is not automatically a factual truth vote.
- A premise has subjective **credibility/credence** `p` in 0..100% *where it is used*. A directed claim→target relationship has **signed impact** `w` in -5..+5 in 0.1 steps (owner 2026-11-10; the prototype's half steps are a subset and the UI moves in half steps unless a relation sets `fineInfluence`). This is **one** signed scale: negative = opposes; zero = neutral; positive = supports. The +/- add buttons create initial relationships; subsequently the visible direction follows the current assessor's actual signed rating, without rewriting other people's ratings.
- A node may carry `typeLabel` (1–40 characters, added 2026-11-09): the person's own name for its type ("Kriteeri", "Tavoite"), shown instead of the built-in tag. Display only; no scoring rule reads it. A new option, group or value on the same level copies its sibling's label.
- A reason may be `unrated` (owner 2026-11-10): a note or a plain fact. It has no credence or influence input, is never a contribution of its parent (like gates and values, it is skipped: no 0, no missing, no incomplete) and its parent does not count it among its reasons. Reviews given before it was switched off are kept and count again when it is switched back; reasons below it may still be rated but reach nothing above it. The app starts a new neutral reason unrated.
- A relation may carry `fineInfluence` (owner 2026-11-10): display only, its slider moves in 0.1 steps.
- The **only two numeric input axes** for ordinary reasons are credibility and influence. Do not introduce a third global priority/utility slider or infer one from text.
- A newly created premise has an editable 100% **template default** but no invented human assessment; unassessed inputs remain unassessed in human modes.
- Structurally asserted support/oppose/neutral is distinct from each assessor's personally evaluated signed influence. Displaying another person's view must not mutate authored relations.

## G-02: exact `evidence-v3-links` scoring (implementation baseline)

**Internal** recursive `I(n)` is 0..100; public **argument balance** `S(n) = 2*I(n)-100` is -100..+100 with neutral zero. These are **not probabilities** that the decision is right. A node without enough data can show `—` and an incomplete indicator; never replace missing data with a fake zero.

For a truth-assessable reason, its base is its own contextual, current `p` (individual or human mean), an explicit shared locked reason value, or its structural preview value, as appropriate. For a concrete option or an argument-mode main claim without its own credence vote, neutral internal base is 50. For every eligible incoming primary/secondary relationship `e`:

```text
strength(e) = clamp(I(source(e)) / 100, 0, 1)
contribution(e) = w(e) * strength(e)
I(target) = clamp(base(target) + 5 * SUM(contribution(e)), 0, 100)
S(target) = 2*I(target) - 100
```

The source's `I` has already incorporated its own **recursively scored descendants**: grandchildren and deeper reasons propagate upward via each explicit intermediate edge. Don't add a grandchild directly to the grandparent unless there is a separately modeled direct relationship. Positive and negative contributions cancel algebraically before clamping. Clamp can conceal additional magnitude at ±100; UI diagnostic may report saturation.

Examples pinned by existing tests:

| Inputs | Internal `I` | Visible `S` |
| --- | ---: | ---: |
| No scored pro/con from neutral base | 50 | 0 (or `—` when unassessed/incomplete in UI) |
| One assessed 100% / +5 premise at option | 75 | +50 |
| Two independent 100% / +5 premises | 100 | +100 |
| One assessed 100% / -5 objection | 25 | -50 |
| 20% / +5 premise | 55 | +10 |
| Premise at 50 with a 100%/+5 supporting grandchild, then +5 to root | 68.75 | +37.5 |

### `evidence-v4-reasons` (owner decision 2026-11-09, the default for new documents)

One rule differs from `evidence-v3-links`: a claim that has reasons (a primary child that is not an option, group, gate or value, or a secondary link from such a claim) takes its result from them alone. Its base is the neutral 50 as soon as one of those relations scores; with none of them scored it has no result (`—`, incomplete), never its own credence. The claim's own credence is then a felt sense: it is saved and shown for comparison but never enters a score. Leaves, options (50), locked shared reasons and every other formula above are unchanged. The version is stored per document in `settings.scoring` and switched in Arviointi → Laskentatapa; the prototype's files stay `evidence-v3-links`, which the golden fixtures pin.

| Tree | `evidence-v3-links` | `evidence-v4-reasons` |
| --- | ---: | ---: |
| Claim with own 80 %, one 100 % / −3.5 reason | +25 | −35 |
| Claim with own 80 %, its only reason unassessed | +60 | — |

*No effect* (owner 2026-11-10, v4 and `logodds-reasons-v1`, not v3): a relation whose influence is 0 — one person's own 0 in their viewpoint, or a pooled mean of 0 — is a complete contribution of magnitude 0 even when the reason's credence is missing, so the parent is neither incomplete nor without a result because of it. The app saves such a review with `review.personal` without a credence (“Ei vaikutusta”). Example: a claim whose only reason has influence 0 and no credence gets the neutral base, balance 0, not `—`. Twenty fully credible reasons give +100 at 0.5 each under v4 (the cap is reached) and +20 at 0.1 each; under log-odds +80 and +21.6.

### `logodds-reasons-v1` (owner request 2026-11-09, selectable)

The v4 rule (a claim with reasons starts neutral and ignores its own credence) with one more change: contributions combine on the log-odds scale instead of the capped sum. With `k = ln 3 / 5` and the same `strength`, `positive`, `negative` as above:

```text
I(target) = 100 · σ( logit(base/100) + k · (positive − negative) )      base kept within 0.5…99.5; no net evidence → I = base
```

A fully credible +5 reason multiplies the odds by 3. From a neutral base: one such reason +50 (as in v3/v4), two +80, three +92.9, one +5 and one −5 cancel to 0. There is no clamp, so the ±100 saturation notes are not shown. Δ uses the same formula (two +5 reasons: Δ of each is +30).

### Marginal effect Δ (“Korosta painavimmat”)

A diagnostic, never an input to any score. For every scored relation `e` from child `c` into parent `t` (missing, zero-impact and unassessed contributions are skipped):

```text
local:  I_without(t) = clamp(base(t) + 5 * (SUM(contribution) - contribution(e)), 0, 100)
        localΔ(c)    = 2 * (I(t) - I_without(t))                      // in visible points
target: walk from t up to the thesis or the nearest option, recomputing each ancestor's one changed contribution
        w(edge) * clamp(I_without(child) / 100, 0, 1) with the other contributions as they are, clamps included;
        Δ(c) = 2 * (I(target) - I_without(target))
```

The walk stops without a result at a gate, a value, a group, an unassessed or zero-impact link on the way. Δ answers “how much would the main claim's / option's balance change if only this relation were removed, everything else as assessed”; deltas of different reasons do not add up (clamps and the shared base make them interact). The card chip `Δ +4.0 p` and the highlighted border appear only on the strongest fifth per target (`ceil(0.2 × n)`, so at least one, ties by child id) while View → *Korosta painavimmat* is on; the tooltip gives the target's current balance, its balance without the relation, and the same for the direct parent. It follows the shown viewpoint (shared or one assessor) and is hidden when the shared balance is hidden by a reviewer filter.

| Tree (argument mode) | Balances | Δ shown |
| --- | --- | --- |
| Thesis ← A 100 % / +5 | thesis +50 | A: +50.0 p (without A the thesis is at its neutral base, 0) |
| Thesis ← A 80 % / +4 ← B 100 % / −2 | A +40, thesis +28 | A: +28.0 p; B: −4.0 p (local −20 on A: A would be +60) |

The old `heuristic-v1` formula and v5/v6 scoring docs are **historical**, not a numerical contract for new work. Use tests such as `evidence-v2-dev21.test.cjs`, `weighted-upward-dev20.test.cjs`, `deep-argument-propagation-dev20.test.cjs`, `secondary-scoring-dev26.test.cjs`, `signed-balance-dev21.test.cjs`.

## G-03: human aggregation and independent viewpoints

- Default `assessmentWeighting = equal`: pool human credence and signed relationship reviews with equal **per-user** weights, not text authored impact values.
- Optional `shares`: weight participating human reviews by each local user's document-level positive `shares` value. A five-share reviewer counts five units in averaging each input axis, not 5× a final score. A zero-share user has zero weighting in this mode. Different assessments may be absent/stale and stay incomplete; never substitute another person's assessment.
- `structural` is a deliberate **author-provided preview**, not a collective human vote.
- Individual human views use that human's own reviews. AI viewpoints are named, isolated, explicitly selected and excluded from human pooled results by default. AI responses are reviewable proposals, not automatic truth.
- Voting-share weighting of **decision ballots** is a distinct field and frozen snapshot. It must not silently alter the argument-score setting.
- For aggregated `75%/+5` UI notation, show individual entries normally and aggregate mean entries in italics with a readable tooltip/source indication; locked shared ratings are not falsely called averages.

## G-04: structural and contextual reuse

- All persisted node IDs are stable. `reasonConcepts[]` supply shared **text/semantic identity** without supplying global credibility. Each `reasonConceptId` **use node** is a distinct node under an explicit target with its **own** per-assessor credence vote and signed primary-impact assessment.
- Example: "Saamme perheen yhteistä aikaa" under *Uimahalli* can be 70%/+4; under *Luontoretki* 90%/+3 or 90%/-3. Never transfer these ratings automatically, even when text matches. Renaming concept may invalidate stale impact fingerprints and requires reassessment.
- The ordinary UX for new repeated reasons is one concept and independent primary-use nodes (dev29). Legacy secondary `links[]` are still validated/scored/readable; they use the source claim's one computed credibility and a separate per-edge signed influence. They are **not** silently converted or doubled. `sharedReasons[]` is an advanced, deliberately *locked* fixed master `p/w` reused by opted-in uses. It is not the default contextual model.
- All explicitly modeled relationships contribute. If a premise reaches a thesis through more than one route, show a neutral informative note; don't delete or automatically attenuate intentionally assessed effects. The note must not falsely imply an error.
- A reason can have multiple uses under different options; new use is immediately visible in tree (even if recurring branches were hidden); selection opens that use's reviews. Concept cards and the direct "Liitä myös muihin solmuihin…" action are part of the baseline.
- Tree hiding, depth slider, group collapse, diagram visual links and layout never change the domain document or its scoring inputs.

## G-05: option groups, gates, values and decision result

- Hierarchical `group` nodes organize concrete options only; they receive **no** own rating, index or ballot slot. Moving an option between groups preserves ID, reviews, ballots and subtree.
- Mandatory conditions and prerequisites (`constraint`, `prerequisite`) create **separate eligibility/feasibility** (met/unmet/unknown), not a numeric plus/minus that can be offset by enough positive reasons. Conditions deep in an option subtree apply to that option per current scope.
- Do not propagate a condition on one **optional** alternative to all sibling alternatives without an explicitly approved AND/OR model; group-level semantics are future work.
- Subjective `value` reasons can have qualitative signed influence and value profile but do not automatically contribute to the current factual evidence numeric score. Do not fabricate a probability for a value.
- The computed option argument balance and the **optional decision ballot** answer different questions. A good numerical argument balance is not a legal/organizational vote result and does not override eligibility.

## G-06: validity, persistence and change control

- Native file format v8 is validated with `src/import-validation.js`, generated `src/project-import-schema.js` from `schemas/project.v8.schema.json`, and core domain validation. Invalid/cyclic/orphan/foreign-version imports must not partially mutate the active document.
- Saved project includes human/AI profiles, node/link identities, contextual reviews, comments, ballot history, shared reasons and settings, where applicable. View-only preferences and local theme do **not** rewrite project content.
- Changes to the numerical formula, missingness, weighting, context linking, eligibility, voting, serialization or AI isolation require a **new reviewed contract and golden tests**; scoring semantic changes need a new version identifier, not a silent reuse of `evidence-v3-links`.
- In a multi-user future, every accepted command must pass authorization and be replayable deterministically through the same domain functions.

## Explicit non-goals / future method decisions

Generic criteria entity with inherited defaults, optional truly context-invariant *personal* probability reuse, group-level gate AND/OR, calibrated probability of a decision, automatic statistical deduplication of correlated argument routes, formal vote secrecy, live P2P sessions, and online authenticated ownership are **not** completed in dev32. Do not fill these gaps during a refactor without a separate product decision.
