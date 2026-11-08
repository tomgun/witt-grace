---
name: verify
description: Run every quality gate (docs and spec-lock checks, lint, typecheck, format, unit and golden tests, the prototype's regression suite, requirement pairing, tree cleanliness) and report each one as passed, failed-with-output or not-run; print the STATUS/CHANGELOG block to paste. Use before every commit and PR.
---
Run the gates below in order. Report every gate with one of three words: **passed**, **failed** (quote the failing output), or **not-run** (say why: script absent yet, exit code 2, skipped). Never summarise a failed gate as passed. Never skip a gate silently.

1. `npm run check` — docs links, spec index, lens placeholders, spec lock (against the working tree; CI runs it against the PR base).
2. `npm run lint && npm run typecheck && npm run format:check && npm test` — **not-run** until WG-003 adds them; say so.
3. Golden fixtures: `npm test` covers `tests/golden` once WG-003 lands; until then **not-run**.
4. `npm run proto:check` — the prototype's 372 tests; run always (about 10 s). A failure here means the prototype was touched: that is a finding, not a fix.
5. Requirement pairing: every test file under `tests/` added or changed in this branch has a header with `must:`, `test:` and `red-against:` lines (`git diff --name-only main -- tests`).
6. Spec discipline: `git diff --name-only main -- docs/spec` lists only `CHANGELOG.md`, or the change is a declared spec change with its line.
7. `git status --short` — no stray files; `tmp-ref/`, `_archive/`, `witt-grace-gpt-proto/dist/` untracked.

Then print this block for the PR body and `docs/STATUS.md`:

```
Verified <YYYY-MM-DD> (<sandbox|mac>): check <passed|failed>, lint/typecheck/unit <passed|not-run: reason>, golden <passed|not-run: reason>, proto:check <passed|failed>, pairing <passed|failed>, spec <untouched|changed with changelog>
Not run: <list or "nothing">
RED before: <summary of the new tests failing on the parent commit, or "none">
```

If anything changed under `src/domain/**`, `schemas/**`, `locales/**` or `docs/spec/**`, remind: update `docs/STATUS.md`, `CHANGELOG.md` (Unreleased) and, for a spec change, `docs/spec/CHANGELOG.md`.
