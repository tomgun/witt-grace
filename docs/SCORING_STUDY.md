# Why the default calculation method is `anchored-reasons-v1`

Owner decisions of 2026-11-18 (WG-029). This note records what was asked, what was tried, what was measured and what was simply chosen, so the choice can be checked or re-opened later. The formulas themselves are in `docs/spec/GRACE_AND_DATA_MODEL.md`; the user-facing explanation is in the user guides under *Miten tulos lasketaan* / *How the result is computed*.

## The question

The owner asked whether the computed figures at the root and on the options can be trusted when they are derived from every credence and influence rating in the tree, or whether ratings should only be read locally. The requirements that came out of the discussion:

- the figures are computed automatically from the ratings; nobody adjusts them by hand;
- several people rate each claim, and the pooled rating of a claim is the method's own kind of evidence: it also stands for reasons nobody wrote into the tree;
- both axes count: the credence of a reason and its influence on its parent;
- a credence is shown on 0–100 %, a net of reasons on −100…+100;
- a claim nobody rated, with one weak supporting reason, must read on the plus side;
- an unrated claim whose reasons speak against it must not turn into an argument against its parent.

## What was wrong with the earlier default

Under `evidence-v4-reasons` a claim that gets its first reason drops its own rating and starts from a neutral 50. A claim rated 90 % that receives one further supporting reason therefore becomes *weaker* as a reason for its parent. The reproducible study below measures this: a fully credible supporting reason added under a rated leaf moves the thesis the wrong way in about 35 % of random trees, and a reason nobody believes (0 %) changes the thesis in about 95 %. `logodds-reasons-v1` shares the base rule and the fault. `signed-reasons-v1` and `chain-logodds-v1` reduce it but do not remove it, and `chain-logodds-v1` lets input noise through several times over: one point on one leaf moved the thesis by up to 6.4 points.

`evidence-v3-links` (the prototype) does not have the fault, because the rating stays the base. Its weakness is the other one the owner named: reasons are added to the rating without limit and the result is cut at ±100, so two strong reasons already saturate a result.

## What was tried

The first round on 2026-11-18 was exploratory and ran in scratch files that were not kept: hand-built three and four level trees with an expected ordering, and property checks over random trees, for the existing versions and for several candidates. The candidates were:

- the rating as a prior worth one ±5 reason for claims as well as targets (the same weighted mean with a heavier anchor);
- DF-QuAD, a gradual semantics from the argumentation literature, and two product ("noisy-OR") forms that combine reasons as independent pieces of evidence;
- the weighted mean with the lighter anchor that was kept, first with an unrated claim starting from 0 and then, after the owner's remark that one weak support must read on the plus side, starting neutral and passing its net.

Why each of the others was set aside was not written down at the time. What is on record, because tests pin it: a product form gives a different result when one reason is split into two halves (`tests/unit/scoring-anchored.test.ts`, "splitting a reason changes nothing"), so the same argument written on more or fewer cards would score differently; and with the heavier anchor one fully credible +1 reason moves a 90 % claim to 91.7 % instead of 93.3 %, which was judged too small to be seen on a card (a judgement, see the next section).

The form that was kept is a weighted mean: the rating (or the neutral prior) is one more weight beside the reasons, `I = 100 · (m · base + P) / (m + P + N)`. It is linear in the reasons, so splitting a reason changes nothing; it is bounded without a cut, so nothing saturates; and no input moves the result by more than its own change.

## What was chosen, not measured

Two constants and one rule are judgement calls. They were chosen from how the example trees and a handful of small cases read, not fitted to data:

- **A claim's rating weighs as one fully credible ±2 reason (`m = 2`).** With it, a 90 % rating and one fully credible +1 reason give 93 %, and a strong objection (−5, fully credible) takes the same claim to 26 %. A larger weight makes written reasons nearly invisible; a smaller one lets a single card overturn a group's rating.
- **An option and the thesis start neutral with the weight of one fully credible ±5 reason (`m = 5`).** One such reason gives +50, two +66.7, three +75, ten +90.9: a single maximal reason does not decide alone and further reasons always show.
- **A claim nobody rated passes its net upward only when the net is positive** (`max(0, net)`). The influence of a reason was rated for the reason being true, so a refuted reason stops supporting; it does not start opposing. This is the owner's rule from `signed-reasons-v1`.

If real use shows that written reasons move rated claims too little or too much, `m = 2` is the number to revisit; it would be a new scoring version, not a change to this one.

## The reproducible study

`node scripts/scoring-study.ts` builds 1 500 random trees of each of three kinds (three or four levels, two to three reasons under the thesis and one to two under each claim, influences ±0.5…±4.5, credences 10–100 %, one assessor, fixed seed) and runs four checks under every scoring version with the real engine. All figures are on the thesis' balance scale, −100…+100. Output of 2026-11-18:

```text
scoring-study: 1500 trees per kind, seed 20261118, one assessor, thesis as the target

## all rated
| Method | Trees with a result | Support under a rated leaf moves the thesis the wrong way | A 0 % reason changes the thesis | Deepest leaf 0 % → 100 %, mean move of the thesis | One point on a leaf, largest move |
| --- | --- | --- | --- | --- | --- |
| `evidence-v3-links` | 1500 | 0.0 % | 0.0 % | 0.18 | 0.02 |
| `evidence-v4-reasons` | 1500 | 34.9 % | 94.6 % | 0.22 | 0.02 |
| `logodds-reasons-v1` | 1500 | 34.9 % | 94.6 % | 0.25 | 0.03 |
| `signed-reasons-v1` | 1500 | 7.2 % | 11.3 % | 0.22 | 0.18 |
| `chain-logodds-v1` | 1500 | 1.8 % | 11.3 % | 6.11 | 6.39 |
| `anchored-reasons-v1` | 1500 | 0.0 % | 0.0 % | 0.72 | 0.17 |
| `direct-reasons-v1` | 1500 | 0.0 % | 0.0 % | 0.00 | 0.00 |

## inner claims unrated
| Method | Trees with a result | Support under a rated leaf moves the thesis the wrong way | A 0 % reason changes the thesis | Deepest leaf 0 % → 100 %, mean move of the thesis | One point on a leaf, largest move |
| --- | --- | --- | --- | --- | --- |
| `evidence-v3-links` | 1500 | 0.0 % | 0.0 % | 0.00 | 0.00 |
| `evidence-v4-reasons` | 1500 | 36.9 % | 94.7 % | 0.22 | 0.02 |
| `logodds-reasons-v1` | 1500 | 36.9 % | 94.7 % | 0.24 | 0.03 |
| `signed-reasons-v1` | 1500 | 7.7 % | 10.9 % | 0.20 | 0.12 |
| `chain-logodds-v1` | 1500 | 1.9 % | 10.9 % | 5.37 | 5.50 |
| `anchored-reasons-v1` | 1500 | 0.0 % | 0.0 % | 1.81 | 0.83 |
| `direct-reasons-v1` | 1500 | 0.0 % | 0.0 % | 1.81 | 0.83 |

## mixed
| Method | Trees with a result | Support under a rated leaf moves the thesis the wrong way | A 0 % reason changes the thesis | Deepest leaf 0 % → 100 %, mean move of the thesis | One point on a leaf, largest move |
| --- | --- | --- | --- | --- | --- |
| `evidence-v3-links` | 1500 | 0.0 % | 0.0 % | 0.05 | 0.02 |
| `evidence-v4-reasons` | 1500 | 35.5 % | 94.3 % | 0.24 | 0.02 |
| `logodds-reasons-v1` | 1500 | 35.5 % | 94.3 % | 0.26 | 0.03 |
| `signed-reasons-v1` | 1500 | 6.3 % | 9.9 % | 0.22 | 0.14 |
| `chain-logodds-v1` | 1500 | 1.9 % | 9.9 % | 5.64 | 3.47 |
| `anchored-reasons-v1` | 1500 | 0.0 % | 0.0 % | 1.17 | 1.08 |
| `direct-reasons-v1` | 1500 | 0.0 % | 0.0 % | 0.34 | 1.08 |
```

Reading it:

- **Wrong way** and **0 % reason**: both are 0.0 % for `anchored-reasons-v1`, `direct-reasons-v1` and the prototype's version, and far from it for the two versions that drop the rating.
- **Deepest leaf**: how far a full swing of the deepest leaf reaches the thesis, averaged over random trees. It is small in every well-behaved version, because each level passes only part of a change on. Under `direct-reasons-v1` with every claim rated it is exactly 0: a rated claim passes its rating, which is that method's meaning.
- **One point on a leaf**: the largest move of the thesis. The balance scale is twice as wide as the credence scale, so 1.08 here is 0.54 points of the internal value per input point. `chain-logodds-v1` passes more than three times the input change.
- Under `evidence-v3-links` an unrated inner claim has no result, so nothing below it reaches the thesis in the second kind of tree.

The percentages quoted on 2026-11-18 from the scratch round (55 % and about 50 % for `evidence-v4-reasons`) came from a different tree generator and cannot be reproduced; the figures above replace them. The direction of the finding is the same.

## What the study does not show

- It checks directions and sizes, not truth: no method can say whether a tree's conclusion is right.
- Random trees are not real ones. The five example debates and the owner's own trees are the other half of the evidence, and the owner's trees were not part of any test.
- One assessor. Pooling (mean, shares, median) is unchanged and covered by the engine's own tests, not here.
- The constants above were not varied in this script.

## Known limits of the method

- The same reason written twice under one node counts twice. The person who builds the tree is responsible for its shape before rating (the guides' *Siisti puu ennen arviointia*).
- When every claim on the way is rated, a deep leaf moves the thesis by about a point or less: the ratings in between carry the information. Depth acts most through claims nobody rated.
- A rating given before reasons were added below a claim may no longer be what the person thinks; the app marks such ratings and the assessment round asks them again (WG-031).
- A low-rated claim still passes a small positive share of its influence; only an unrated claim's net is cut at 0.
