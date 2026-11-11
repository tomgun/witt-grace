# witt-grace

**WITT** (Web Interactive Thinking Tool) is a local-first, browser-based tool for drawing argument trees and comparing decision options with the **GRACE** method (Günther's Reflective Argumentation & Collaborative Evaluation). Status truth: `docs/STATUS.md`.

A GRACE document is a tree of claims under a thesis (argument mode) or under decision options (decision mode). Each person rates every premise on two axes only: how credible it is in that context (0–100 %) and how strongly and in which direction it bears on its target (−5…+5). A bounded, recursive balance from −100 to +100 shows how the argument stands for each person, for the pooled human view and separately for any AI viewpoint. The balance is an explanatory diagnostic, not a probability or a vote. Feasibility gates, option groups, reusable reasons rated per context, local multi-person profiles, contribution bundles, manual AI round-trips and optional preference ballots complete the method. Everything runs offline in the browser with JSON files: no backend, no accounts.

## What exists (2026-11-08)
- `witt-grace-gpt-proto/`: the working prototype `0.11.0-dev.32` (schema v8, scoring `evidence-v3-links`), developed with ChatGPT, frozen here as the reference. 372 Node tests, a static build whose one-file standalone matches the released checksum, Chromium smoke tests. Runnable: see below.
- `docs/spec/`: the product and method contract lifted from the prototype handoff, locked by a hook and a CI check.
- The quality system from the owner's other projects: principles, review lenses, skills, hooks, the issue-sized workflow.

- `src/domain/`: the pure TypeScript domain (model, parser, `evidence-v3-links` engine, commands, serialization, feasibility, ballots, rankings), reproducing the prototype on 38 golden fixtures and 60 replayed edits.
- `src/app/`: the new React + Vite app — argument and decision modes, canvas, inspector with reviews, comments, keyboard, autosave, JSON export/open, four themes, nine languages — with Playwright walks.

Not there yet: ballots UI, the repeated-reason shelf, table view, exports, document library, AI flows (`docs/ISSUE-PLAN.md`).

## Quick start (Node 24, see `.nvmrc`)
```sh
npm ci
npm run dev            # the app on http://127.0.0.1:5173
npm run check          # docs, spec lock, lint, typecheck, format, unit and golden tests
npm run build && npm run e2e   # Playwright walks (npm run e2e:install once)
npm run golden         # regenerate tests/golden from the prototype engine (diff = drift)
npm run proto:check    # the prototype's 372 tests
npm run proto:build    # static site in witt-grace-gpt-proto/dist (and the one-file standalone)
npm run proto:dev      # serve the prototype locally; open the printed URL
node scripts/signal-relay.mjs   # the collaboration relay on ws://127.0.0.1:8787 (also what runs on a VPS behind wss://)
```
Or `/dev` in Claude Code. `witt-grace-gpt-proto/dist/witt-standalone.html` opens directly from disk.

## Layout
```
docs/spec/              the locked product and method contract (GRACE, UX, identity, requirements ledger, backlog, P2P RFC)
docs/                   README (read X when doing Y), STATUS, ARCHITECTURE, TESTING, ADRS, ISSUE-PLAN, PROTOTYPE_REFERENCE
docs/principles/        architecture-time, code-time and security principles · docs/lenses/ review lenses
witt-grace-gpt-proto/   the frozen prototype (its own package.json, src, tests, tools, docs)
scripts/                check-docs.mjs, check-spec-lock.mjs (Node, no dependencies)
.claude/                hooks (protect files, guard bash) and skills (dev, feature, verify, review)
src/domain/             pure domain · src/lib/ storage, files, i18n · src/app/ the React app · locales/ the table
tests/unit tests/golden tests/e2e
```

## Documentation
Start with `docs/README.md`. `CLAUDE.md` is the standing brief for Claude Code; `CONTRIBUTING.md` is the workflow; `CHANGELOG.md` records changes and review rounds; `docs/PROTOTYPE_REFERENCE.md` explains how the prototype serves as oracle and benchmark.

## Scope boundaries
- The computed balance is explanatory; the app never presents it as a probability that a decision is right.
- Browser storage is per origin and is not a backup; export `.witt.json` to keep work.
- Ballot anonymity is a display option, not a protection.
- Live collaboration v1 (WG-030) works browser to browser with a host who orders the changes; nothing is stored on a server. The full P2P room design (quorum, failover, recovery) in `docs/spec/P2P_NO_DATABASE_RFC_R1.md` is not built.

## Names and licensing
WITT and GRACE are the method's and tool's working names. No open-source license has been chosen (`witt-grace-gpt-proto/LICENSE-NOTICE.md`, WG-017); do not assume MIT or any redistribution grant.
