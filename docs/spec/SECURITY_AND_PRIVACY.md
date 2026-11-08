# Security / privacy baseline and non-claims

> **Living specification.** Copied 2026-11-08 from the dev32 prototype handoff (`witt-grace-gpt-proto/docs/SECURITY_AND_PRIVACY_BASELINE.md`). Backticked source, test and tool paths (`src/…`, `tests/…`, `tools/…`) refer to the frozen prototype under `witt-grace-gpt-proto/` until the new implementation supplies its own evidence. Edit this file only through the change policy in `docs/spec/README.md`.

**Prototype disclaimer:** WITT dev32 is not an independently audited, authenticated collaboration service or regulated election system.

## Current static app

- App runs in browser; no bundled runtime backend database, required server API, or embedded hosted AI call. Import/export works with local files and browser storage.
- Files imported from other people or models are **untrusted**; validation and preview are part of the product safety boundary. Continue checking schema, graph cycles, user/author mapping, IDs, malformed fields, and prohibit JSON content from being treated as executable instructions.
- Local users are **profiles**, not verified real persons. A nickname change must not change stable IDs. Names in human/AI proposal bundles are metadata, not proof of ownership.
- Decision ballot anonymity is UI-only. Raw local documents and exported files can contain individual opinions, votes, names and comments. No guarantee of secret ballots.
- Browser localStorage can be cleared/evicted, may be unavailable in incognito modes, and is **per origin**. It does not sync devices. Existing offline WITT file work does not appear automatically at the Pages origin.

## GitHub Pages

GitHub Pages serves public static assets. Even with private code repositories, published Pages sites may be public. Deploy `dist/` only; do not include repository docs, raw test fixtures, backups, secrets, screenshots with private discussions, private `.witt.json` documents or `.env` files in `dist/`. The generated browser file **`src/examples.js` embeds offline demonstration example content**, which is public in the Pages build; inspect those examples for privacy before publication. `tools/verify-pages-build.cjs` is a guardrail, not a substitute for reviewing what is published.

Multiple project sites under `https://OWNER.github.io/REPO_A` and `/REPO_B` share the same host origin. Browsers isolate `localStorage` and IndexedDB by origin, **not by URL path**. Treat all apps on the same owner Pages origin as mutually exposed to those stores. Prefer a dedicated custom domain before processing private decision data; security-review this usage. GitHub Pages is not access control.

Authoritative sources:
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API
- https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## Future P2P

- No mandatory backend document database, permanent signaling directory, or cloud snapshot. Peer replicas and optional **volatile** rendezvous are distinct from a hosted storage product.
- A short room code is a locator, not secret access; invite URLs need high entropy and room permission checks. Recovering owner rights across devices must use cryptographic key proof, not an editable nickname.
- The current `src/p2p-host-engine.js` is experimental and not connected to WebRTC. Do not claim live end-to-end encryption, reliable 2-peer failover, or fully anonymous ballots today.
- Quorum-committed changes vs local unconfirmed drafts must be distinguished; all peers losing their storage without exported backup means irrecoverable data. Snapshot+log recovery and revocation are future implementer obligations.

## Before wider release

Risk-review DOM XSS and injection from imported text/SVG/HTML, cross-window and clipboard behavior, CSP, download filenames, data retention, backup UX, static public exposure and P2P identity/keys. Validate that errors do not log confidential document content. Run dependency/SCA, JS lint, browser cross-engine and accessibility audits after establishing automated CI.
