---
lens: data
intent: models, migrations, integrity, lineage, pipelines, backfills
generated: 2026-10-10
model: claude-fable-5-1
sources: ["Expand/contract (parallel change) — add nullable, dual-write or backfill, switch reads, drop; separate deploys per step (WebSearch 2026-10-10; content from the search summary and model knowledge, no page fetched)", "Zero-downtime migration practice — backfill in batches, lock timeouts on DDL, concurrent index builds, parity checks between old and new paths (WebSearch 2026-10-10)", "docs/principles/CODE_QUALITY.md § One source of truth (read; applied here at the storage layer to derived values)", "model knowledge — claude-fable-5-1"]
---
# Data — lens

## Plan-time
- Which of the stores in `## Project specifics` does the plan read or write, and for each field it adds or changes: the type, nullability, the ONE module that writes it, and the invariant that holds across rows (unique, referential, a total that balances)? Count the fields with no stated invariant.
- For each schema change, which step is it of expand → migrate → contract (add nullable, dual-write or backfill, switch reads, drop), and which deploy runs each step? Name the step at which old and new code must both work; a rename, a NOT NULL on a populated column, or a lock on a growing table with no timeout and no batching, done in one step, is the finding.
- For each backfill: is it idempotent (a re-run converges, a duplicate write is a no-op), batched with a stated size, resumable from the last completed batch after a kill, and verified by a parity count between the old and new paths before the contract step? Count the backfills missing one of the four.
- When a write to one store succeeds and a dependent write fails (a second table, a file, a queue, an index), what state is left and what repairs it — a transaction, an outbox, a reconciliation job, or a human? Name the mechanism per multi-store write; "it will not happen" is the finding.
- For every derived value the plan stores (a cache, an aggregate, a denormalised copy, a model output), name its source fields and the trigger that recomputes it when a source changes; a derived value with no trigger is a stale fact by design — read the source instead.
- For each new data the plan writes, what is its retention per `## Project specifics`, which path deletes it (a job, a TTL, a cascade), and what breaks when a row another store references is gone? Count the data with no deletion path (what counts as PII and who consented is privacy's lens, not asked again here).
- For each migration, what is the rollback — the contract step reversed, a restore from a named backup with its age, or none? Count the migrations with no rollback and no "accepted, because" sentence.
Self-report: the count of added fields with a stated invariant over the count added, and the one migration or backfill with no rollback (or "none", naming the rollback per migration).

## Code-time
- Ship every schema change as expand → migrate → contract across separate deploys; never a rename or a NOT NULL on a populated column in one step, and set a lock timeout on every DDL statement against a live table (docs/lenses/data.md)
- Write backfills idempotent, batched with a stated size, resumable from the last completed batch, and verified by a parity count before the contract step runs (docs/lenses/data.md)
- Put every invariant in the store itself (unique, foreign key, check, NOT NULL); a rule the store cannot express is enforced in the one module that owns the write, never in each caller (docs/lenses/data.md)
- Store a derived value only beside the trigger that recomputes it; where no trigger exists, read the source (docs/lenses/data.md)
- Make every multi-store write atomic or reconcilable — a transaction, an outbox, or a named reconciliation job; never a second write whose failure after the first goes unreported (docs/lenses/data.md)

## Project specifics
- stores: browser localStorage — the autosaved current project, the document library and the per-browser view preferences (`witt-view-v1`, never document state); IndexedDB arrives with P2P logs; `.witt.json` files (schema v8, `settings.scoring = 'evidence-v3-links'`) on the person's disk are the durable form
- retention: none automatic (see docs/lenses/privacy.md); replacing the current project needs the confirmation that names it (`docs/spec/UX_AND_WORKFLOWS.md` UX-E06)
- migrations: a `schemaVersion` bump is a reviewed contract change (`docs/spec/GRACE_AND_DATA_MODEL.md` G-06, docs/ADRS.md): one explicit, tested, pure migration function per step; a v8 file is never reinterpreted silently; older versions (v5–v7) are refused with a message naming the version, never guessed at
