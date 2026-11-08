# WITT / GRACE — GitHub & Claude Code handoff

**Verified prototype:** WITT `0.11.0-dev.32` | native WITT document **v8** | score engine **`evidence-v3-links`**.

WITT (Web Interactive Thinking Tool) implements the GRACE (Günther's Reflective Argumentation & Collaborative Evaluation) method for visual argumentation and decision support. This is a tested **local-first prototype**, not an authenticated multi-user service. The repo is prepared for an initial GitHub commit, GitHub Pages static hosting and small, reviewed Claude Code pull requests.

## Start here

1. [Handoff entrypoint and source-of-truth order](docs/HANDOFF_START_HERE.md) · [source-first review findings](docs/REVIEW_REPORT.md)
2. [GitHub repository and Pages setup](docs/GITHUB_SETUP.md)
3. [Current GRACE and document contracts](docs/specifications/CURRENT_GRACE_AND_DATA.md)
4. [Detailed UX regression contract](docs/specifications/UX_AND_WORKFLOWS.md)
5. [AI, profiles, contribution and voting semantics](docs/specifications/IDENTITY_AI_AND_VOTING.md)
6. [Architecture audit and refactor plan](docs/ARCHITECTURE_AUDIT_DEV32.md) · [ordered PR roadmap](docs/REFACTOR_PR_ROADMAP.md)
7. [Database-free P2P collaboration RFC](docs/P2P_NO_DATABASE_RFC_R1.md) — **design only**; browser-to-browser transport is NOT implemented.

Older release-specific notes, superseded agent instructions, outdated smoke scripts and ADRs are **not present in the active repository**. They are available in the separate optional historical ZIP, which must not be installed as the current Claude context. The executable dev32 runtime and its regression tests define implemented behavior; see `docs/REVIEW_REPORT.md`.

## Run locally

Requirements: Node.js 22 recommended (project declares >=20); Python 3 + Chromium + Playwright only for optional browser tests.

```bash
npm run check         # deterministic Node tests, schema and doc validation
npm run build         # static dist/index.html and standalone dist/witt-standalone.html
npm run dev           # tiny local static server, no database
```

Open the URL printed by `npm run dev`. To run one verified browser regression locally, `python3 tools/smoke-dock-header-dev32.py` after `npm run build` (requires Playwright and `/usr/bin/chromium`; Mac paths must be adapted). See [testing contract](docs/TESTING_AND_RELEASE.md).

## Publishing

The included `.github/workflows/ci.yml` runs `npm run check`, a static build, Pages asset validation **and real desktop/mobile Chromium browser smoke tests** for PRs. `.github/workflows/pages.yml` builds and publishes **`dist/` only** after a push to `main`, once the repository owner activates **Settings → Pages → Source: GitHub Actions**. No GitHub repository has been created or modified by this handoff. [Complete steps](docs/GITHUB_SETUP.md).

GitHub Pages is a public **static website** even if published from an eligible private repository. Use synthetic data for public demonstrations and review the bundled offline example text, since it is published as a JS asset. Local browser storage is per browser **origin**, not per project URL path; see [security and data limitations](docs/SECURITY_AND_PRIVACY_BASELINE.md).

## Non-negotiables while refactoring

- Do not change scoring, data semantics or UI behavior silently. Change them only through an explicit proposal, updated contracts, numeric tests, and a reviewed PR.
- Keep humans, AI viewpoints, authors and votes distinct; `—` for missing review is never a real zero.
- Preserve option-group vs option semantics, context-specific reason occurrences, signed per-edge influence and intentional multiple paths.
- Rebuild the static GitHub Pages artifact continuously; avoid dependencies on paid hosted AI APIs, a backend or a database for current offline behavior.
- Maintain the original prototype as a reproducible reference while refactoring piece by piece.

**Licensing:** no open-source license has been selected. See `LICENSE-NOTICE.md` before publishing code publicly. Do not assume the prototype is MIT-licensed.

**Suomenkielinen käyttöönotto:** [witt-grace-github-handoff-guide-fi.md](witt-grace-github-handoff-guide-fi.md) (same guide under [docs/KAYTTOONOTTO_FI.md](docs/KAYTTOONOTTO_FI.md)).
