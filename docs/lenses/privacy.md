---
lens: privacy
intent: PII inventory, retention, consent, regulatory constraints
generated: 2026-10-10
model: claude-fable-5-1
sources: ["GDPR Article 5(1) principles — purpose limitation (b), data minimisation (c), storage limitation (e); Article 30 records of processing with the retention schedule as a mandatory row (WebSearch 2026-10-10; content from the search summary and model knowledge, no page fetched)", "Irish DPC Guidance on the Principles of Data Protection, 2019 — the storage period or its criterion documented internally (WebSearch 2026-10-10)", "docs/principles/SECURITY_PRINCIPLES.md § Secrets handling (read; its surfaces apply to personal data too) and docs/lenses/data.md (read; the deletion mechanism per store is its lens)", "model knowledge — claude-fable-5-1"]
---
# Privacy — lens

## Plan-time
- Which personal data does the plan collect, derive, copy or expose — identifiers, contact details, content a person wrote, location, device ids, behavioural traces, and any row of the `## Project specifics` inventory — and per field: the purpose it serves, the lawful basis under each jurisdiction listed (consent, contract, legitimate interest, legal obligation), and the ONE store that holds it? Count the fields with no stated purpose; a field kept "in case it is useful" is the finding.
- Per new field, could the same purpose be served with less — a hash for the value, a bucket for the exact age or location, an aggregate for a row per person, nothing for a copy? Name the reduction weighed per field, or the reason it loses; a field with no reduction weighed is the finding.
- Where does personal data reach a new reader — a log record, a subagent's context, an analytics or training sink, a third party, a backup, another jurisdiction — and per flow, which instrument permits it (a processor agreement, a transfer mechanism, the notice or consent the person saw)? Count the flows with no instrument (security Q3 asks who CAN read; this asks whether the reader MAY).
- Per field, what is the retention period or criterion from the `## Project specifics` schedule, which path erases or anonymises it on expiry and on a person's request within the statutory window, and does that path reach every copy — backups, caches, logs, derived values? Count the fields with no schedule row, or a path that misses a copy (the mechanism per store is data Q6's).
- Where the basis is consent, what records it (timestamp, the text shown, its version, scope), what withdraws it, and what happens to processing already done on withdrawal? A consent with no withdrawal path is not consent; count the consents without one.
- Which constraint in `## Project specifics` does the plan trigger — a jurisdiction's rule, a sector rule, an age threshold, a high-risk assessment threshold — and which artefact does the plan produce for each: a records-of-processing row, an impact assessment, a notice update? Count the triggered constraints with no artefact.
- Which test proves the erasure path removes every copy and that the stored bytes are the minimised form (the hash, not the value)? A privacy promise no test checks against the stored bytes is prose.
Depth: docs/principles/SECURITY_PRINCIPLES.md (Secrets handling — the surfaces a value must never reach; Trust-boundary validation — where personal data is parsed once)
Self-report: the count of personal-data fields with a purpose, a lawful basis and a schedule row over the count added, and the one flow to a new reader with no permitting instrument (or "none", naming the instrument per flow).

## Code-time
- Store the minimum form that serves the purpose — a hash, a bucket, an aggregate, a reference — and never a second copy of personal data another module could read from the first (docs/lenses/privacy.md)
- Keep personal data out of logs, error messages, fixtures, subagent prompts and analytics events unless the inventory names that sink; redact at the format call, never downstream (docs/lenses/privacy.md)
- Land the retention row and the erasure path with every new personal-data field in the same change — the schedule entry, the TTL or job, and the test that every copy (cache, index, derived value) is gone (docs/lenses/privacy.md)
- Record consent as data (timestamp, text version, scope) with a withdrawal path that stops the processing, never a boolean with no provenance (docs/lenses/privacy.md)
- Use synthetic or anonymised records in tests and fixtures; a real person's record in a repository is a disclosure with no retention path (docs/lenses/privacy.md)

## Project specifics
- PII inventory: local profile display names (`users[].name`, editable, not authenticated); free-text claims and comments that may name people; each person's credence and influence reviews and ballot preferences (opinions, attributed by stable `userId`); timestamps. All of it lives only in the person's browser storage and in files they choose to export or share; the app stores nothing elsewhere, runs no analytics and logs no addresses
- jurisdictions: Finland / EU (GDPR). The app is a local tool: the owner processes nothing; GitHub Pages access logs belong to GitHub. "Anonymous" ballots are a display option, never a protection (`docs/spec/IDENTITY_AI_AND_VOTING.md`); the UI must never imply otherwise
- retention schedule: browser storage persists until the person clears it or the browser evicts it; exports live where the person puts them; there is no automatic backup and no cloud copy. Future P2P peers keep replicas by design (`docs/spec/P2P_NO_DATABASE_RFC_R1.md`); revocation never erases what a peer already holds
