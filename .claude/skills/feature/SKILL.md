---
name: feature
description: Plan and implement one issue at the project's quality bar — must/test/red-against pairs, the architecture self-report, lens reviewers for the lenses the change earns, then implementation under the code-time principles and a verify run.
---
Input: `$ARGUMENTS` — a WG id, an issue number, or a one-line task.

## 1. Plan (write it to the issue or PR description before coding)
Read `docs/STATUS.md`, the specs in `docs/spec/` the change touches (name the requirement IDs), and the parts of `docs/ARCHITECTURE.md` and `docs/TESTING.md` the change touches. Then write:
- `must:` lines, one behaviour each, each with `test:` (file and case) and `red-against:` (the realistic mistake the test catches: an inverted sign, a dropped clamp, a missing review read as zero, an author relabelled, a translation key left raw — never "delete the function"). Name the requirement ID where one exists.
- Spec check: does the plan change what a spec says? If yes, stop: the spec change is its own change with a `docs/spec/CHANGELOG.md` line and the owner's decision. If code and spec disagree, record the mismatch there and ask.
- The eight architecture self-report lines (`docs/principles/ARCHITECTURE_PRINCIPLES.md`): coupling (new dependencies each touched file gains; one-line job per file), feature-over-layer (files one idea touches and why), deep-module (what each new module hides; caller-visible items ≤ 5), isolate-the-volatile (the one function touching clock/ids/storage/DOM and the pure function that decides), deletion drill, tactical-vs-strategic (any shortcut, named), design-it-twice (a second boundary sketch and the sentence that picks one), general-vs-special (any special case pushed up).
- Which lenses the change earns, and spawn one reviewer per earned lens with the lens file and the plan: `architecture` at ≥ 2 structural facts (new module, store, process, dependency, reversed import); `security` when a trust boundary changes (a new parser, an import path, a rendered sink, an export format); `data` on any storage or schema change; `privacy` when people's names, reviews or ballots are stored or exported differently; `ux-usability` on any user-facing surface, compared against the prototype; `api-compat` when `.witt.json`, bundle or AI draft shapes move; `testing` and `simplicity` always. Each reviewer reads `docs/lenses/<lens>.md` (+ `docs/principles/*` for depth), answers its plan-time questions with evidence, and returns findings ranked with the plan amendment text and its self-report line. Fold the findings in before coding.

## 2. Implement
Keep these fifteen one-liners in view (depth: `docs/principles/CODE_QUALITY.md` and `SECURITY_PRINCIPLES.md`):
1. Explicit dependencies: `now`, `newId`, storage and locale are arguments; nothing in `src/domain` reads `Date`, `crypto`, `window` or `localStorage`.
2. Functional core, imperative shell: decisions in pure functions under `src/domain`; `src/lib` and `src/app` gather, call, carry out.
3. One source of truth: closed sets live in `src/domain/model.ts`; the schema is asserted equal to `schemas/`; the spec's numbers live in golden fixtures; derive, never restate.
4. Duplication over wrong abstraction: wait for the third real occurrence; a boolean flag added for a new caller is the abstraction failing.
5. Illegal states unrepresentable: tagged unions for missing/stale/locked/structural values, literal unions for kinds and stances, `assertNever` ends every switch.
6. Fail fast and loud: a refused import names the path and the reason; no swallowed errors; no `??` that turns a missing review into zero.
7. Naming as compression: no handle/process/manage/data/utils; positive booleans; the prototype's domain words (credence, influence, balance, use, concept, gate, ballot).
8. Module size vs context window: read a touched module whole before editing; say so if you worked from fragments.
9. Pull complexity downward: callers must not need the implementation to call correctly.
10. Define errors out of existence before handling what remains.
11. Trust-boundary validation: parse once at the edge (`parseProject`, `parseContributionBundle`, `parseAiDraft`) and pass typed values inward; never trust a document's authorship claims over stable IDs.
12. Secrets: none exist in this app; never commit a personal document or a real name as a fixture.
13. Injection: user text never meets `innerHTML`, unescaped SVG/HTML export or a URL without context-aware escaping.
14. Least privilege: the app asks for no permission it does not use; clipboard and file access only on the person's action.
15. Dependency risk: a new runtime dependency needs an ADR row in `docs/ADRS.md`; the lockfile diff is part of the review; `src/domain` stays at zero.

Rules of the repo: Finnish for users with ä/ö intact and the prototype's vocabulary; English for code and docs; every new UI string in all nine locales in the same commit; tests land in the same commit as the behaviour; `docs/spec/` untouched unless the change is a spec change.

## 3. Finish
Run the `verify` skill. Before the commit, run the new tests against the parent commit's `src/` to see them RED (`git stash push -- src && npm test; git stash pop`) and paste the RED summary into the PR body. Update `docs/STATUS.md` and `CHANGELOG.md`; the user guide where the behaviour is user-facing. Commit and push only when the owner says so.
