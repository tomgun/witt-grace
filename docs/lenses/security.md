---
lens: security
intent: plan-time threat questions: trust boundaries, authn/z, data exposure, abuse cases
generated: 2026-10-03
model: claude-fable-5-1
sources: ["OWASP Threat Modeling Cheat Sheet — the four questions, STRIDE per data flow (WebSearch 2026-10-03; fetch blocked by the sandbox firewall, content from the search summary and model knowledge)", "Threat Modeling Manifesto — what are we working on / what can go wrong / what are we going to do / did we do a good enough job (WebSearch 2026-10-03)", "docs/principles/SECURITY_PRINCIPLES.md (read in full; this starter adds only plan-time threat questions it does not carry)", "model knowledge — claude-fable-5-1"]
---
# Security — lens

## Plan-time
- Which assets from `## Project specifics` does the plan touch, and through which entry points does data cross a trust boundary to reach them (crossings as docs/principles/SECURITY_PRINCIPLES.md § Trust-boundary validation defines them)? Count the crossings the plan adds or changes; an asset reached through a crossing the plan does not list is the finding.
- Per crossing, which of spoofing, tampering, repudiation, information disclosure, denial of service and elevation of privilege applies, and for each applicable one does the plan name the control (the function, check or permission that stops it) or write "accepted" with a reason? Count the threats that have neither.
- Of those cells, three need more than a named control: elevation of privilege and spoofing need, per operation the plan adds, the one check that decides who may invoke it ("anyone who can reach it" is legal only stated as a decision with the reason it is safe); information disclosure needs, per destination data newly reaches (§ Secrets handling's surfaces plus a subagent's context), its sensitivity and its readers named; denial of service needs the trigger named — who can drive the cost without authorisation, and the rate bound with its NUMBER (the size/count ceiling and its behaviour at the limit are performance Q5's, the timeout resilience Q4's — not asked again here).
- Does `## Tests` run a hostile input against each named control, not only the legitimate path? Count the controls with none.
Depth: docs/principles/SECURITY_PRINCIPLES.md (the five security lenses)
Self-report: the count of trust-boundary crossings the plan adds or changes, and the one threat accepted without a control (or "none", naming the control per crossing).

## Project specifics
- assets: the person's argument documents — claims, comments, per-person credence and influence reviews, ballots, local profile names — in browser storage (localStorage, later IndexedDB) and in `.witt.json` files they export; the published static site on GitHub Pages; the GitHub push credential used by Claude sessions
- trust boundaries: a `.witt.json` project, a contribution bundle or an AI JSON reply opened from disk or pasted (`parseProject`, `parseContributionBundle`, `parseAiDraft` — the only parsers); user-typed text rendered into the tree, the table and the SVG/PNG/PDF exports; the same-origin storage shared by every project site under one `github.io` host; clipboard writes the user triggers; Claude hooks reading tool input; issue and PR text read by Claude skills
- threat actors: a crafted document that smuggles HTML, script or an external URL into rendered text or an SVG export; another site on the same Pages origin reading localStorage; a planted issue, doc or comment steering Claude (branch protection on main is the control); no server exists, so no remote actor reaches data at rest beyond the browser
