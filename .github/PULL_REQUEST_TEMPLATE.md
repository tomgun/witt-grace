## Scope
<!-- Issue: WG-NNN / #n. One paragraph: what changes and why. Requirement IDs touched (G-xx, UX-xx, U-xx, V-xx). -->

## must → test → red-against
<!-- One line per behaviour. Example:
must: a missing review renders "—", never 0 · test: tests/unit/scoring.test.ts "missing review" · red-against: null coalesced to 0 -->

## Spec
<!-- "Untouched", or "Changed: <file> — line added to docs/spec/CHANGELOG.md, owner decision <date>". A mismatch found: recorded under Open mismatches. -->

## Risk
<!-- What could break, who notices, how it is rolled back. Golden fixtures changed? Then this is a spec change. -->

## Verification (paste the `verify` skill block)
```
Verified YYYY-MM-DD (sandbox|mac): check …, lint/typecheck/unit …, golden …, proto:check …, pairing …, spec …
Not run: …
RED before: …
```

## Checklist
- [ ] docs/STATUS.md updated (or n/a) · [ ] CHANGELOG.md Unreleased updated · [ ] docs/spec/CHANGELOG.md updated iff a spec changed
- [ ] Every new UI string in all nine locales; user guide updated where user-facing (or n/a)
- [ ] package-lock.json diff reviewed (or unchanged) · [ ] new runtime dependency has an ADR row (or none added)
- [ ] Fixtures synthetic; no personal document, no real third-party name; Finnish copy has ä/ö and uses the glossary
- [ ] Self-report: files touched and their one-line jobs; new dependencies gained; decisions that need an ADR
