---
lens: api-compat
intent: contracts, versioning, backward compatibility, deprecation paths
generated: 2026-10-10
model: claude-fable-5-1
sources: ["RFC 8594 Sunset header and RFC 9745 Deprecation header — a deprecated HTTP surface signals when it stopped being supported and when it stops responding, with a Link to the migration (WebSearch 2026-10-10; content from the search summary and model knowledge, no page fetched)", "Published API versioning and deprecation policies (Atlassian, HPE GreenLake, Hack Club) — additive vs breaking change lists, 90-day to 12-month notice periods (WebSearch 2026-10-10)", "Hyrum's law — every observable behaviour of a surface becomes a dependency for some consumer (model knowledge)", "docs/lenses/data.md (read; a stored schema's expand → migrate → contract is its lens, not restated here)", "model knowledge — claude-fable-5-1"]
---
# API compatibility — lens

## Plan-time
- Which contracts does the plan change — anything a consumer in `## Project specifics` reads: an HTTP or RPC surface, a library's public signature, a CLI's flags, exit codes and stdout format, a file or config schema, an event or message shape? List each with its consumers; count the changed contracts with no named consumer (Hyrum's law: a consumer may depend on any observable behaviour, so "nobody uses that" needs evidence).
- Per change, is it additive (a new endpoint, an optional field or flag, a new variant a consumer may ignore) or breaking (a removal, a rename, a change of type or meaning, an optional input made required, a narrowed or reordered output, a new error on an input that used to succeed)? Count the breaking ones and name the path each takes under the `## Project specifics` policy — a new major, or a deprecation window; a breaking change shipped as a patch is the finding.
- For each deprecation: from which date is the old contract marked where its consumer meets it (`Deprecation` and `Sunset` headers for HTTP, a warning on first use for a library or CLI, a version field for a file or message), what notice period does the policy give, where is the migration written, and which release removes it? Count the deprecations missing one of the four.
- During the window, does the code accept both input shapes and emit the old output until the sunset, and which test feeds the OLDEST supported consumer shape to the new code and asserts the promised output literally? A compatibility promise no test exercises is prose; count the promises without one.
- Which observable behaviours the plan touches are NOT contract — timing, ordering, log and error wording, undocumented fields — and does the plan say so where the consumer reads (a stability section, the changelog), so the contract has a written edge? Count the behaviours a consumer plausibly relies on that the plan neither promises nor disclaims.
Self-report: the count of contract changes classified additive and breaking, and the one breaking change with no deprecation path (or "none", naming the path per breaking change).

## Code-time
- Classify every change to a public surface the diff touches (signature, flag, exit code, output format, schema, message shape) as additive or breaking in the commit message, and ship a breaking one only on the path the policy names — a new major, or a deprecation with its sunset (docs/lenses/api-compat.md)
- Add beside, never repurpose: a new optional field, flag or variant next to the old one; a change of type or meaning under an existing name is a rename in disguise (docs/lenses/api-compat.md)
- Mark a deprecated surface where its consumer meets it — `Deprecation`/`Sunset` headers for HTTP, a warning on first use for a library or CLI, a schema version field for a file or message — and point at the migration (docs/lenses/api-compat.md)
- Keep a test that feeds the oldest supported consumer shape (request, input, config, file) to the new code and asserts the promised output literally; delete it only in the commit that removes the support (docs/lenses/api-compat.md)
- Version every file, config or message format with a field the reader checks first, and refuse an unknown newer version with a named message rather than parsing it as the old one (docs/lenses/api-compat.md)

## Project specifics
- consumers: `.witt.json` v8 files written by the prototype and by people's earlier exports; contribution bundles (`witt-contribution-bundle-v1`) and AI drafts (`ai-draft.v2`) exchanged between people and external AI tools; the AI task text and JSON schema the app hands to an external model (`docs/spec/IDENTITY_AI_AND_VOTING.md`)
- versioning policy: `schemaVersion` is an integer; within a version changes are additive only; a bump is an ADR plus a migration function plus a golden round-trip test; the scoring semantics are named by `settings.scoring` and a changed formula gets a new identifier, never a silent reuse of `evidence-v3-links`
