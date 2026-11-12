# Architecture

**Status: implemented as described after WG-023 parts 1–2 (2026-11-09) and live collaboration WG-030 (2026-11-11); ADRs A002, A003, A005, A010.** A pure domain, thin browser infrastructure, and a React UI that renders a per-render frame and dispatches commands. The prototype's monolith (`witt-grace-gpt-proto/src/app.js`, 4 333 lines of DOM wiring) is what this replaces; its pure modules (`core.js`, `view-layout.js`, `keyboard-nav.js`, `table-model.js`, `review-lens.js`, `diagram-export.js`, `document-library.js`, the AI and import modules) are the oracle the parity tests and golden fixtures compare against. The visible UI contract is `docs/spec/UI_INVENTORY.md`; the app keeps the prototype's element ids, class names and stylesheet so the same selectors drive both.

```text
   person ──► src/app      React 19: store (document + ViewState + session state) → dispatch(Command) → applyCommand
                 │         projection.ts builds the Frame per render; components by region render it; ModalHost hosts dialogs
              src/lib      browser infrastructure: storage, files, providers (newId, nowIso), i18n, workspaceMeta,
                 │         library (IndexedDB), export/* (SVG, PNG, PDF, ZIP)
              src/domain   pure functions over the v8 document: model · parse · scoring · reviews · eligibility · ballots
                           ranking · views · layout · navigation · lens · table · commands · serialize · ai/*
```

## Folders and the dependency rule

```
src/domain/          pure decisions; imports only other domain modules (ESLint + tests/unit/import-direction.test.ts)
  index.ts           the public surface; app and lib import from here
  model.ts           v8 types and closed sets (modes, themes, kinds, stances, semantic types, gate statuses, roles,
                     weightings, profile kinds, audit actions), SCHEMA_VERSION 8, SCORING_VERSION 'evidence-v3-links'
  parse.ts           parseProject: the one place unknown JSON becomes a typed Project (prototype's Finnish refusals)
  graph.ts           children, root, descendants, lookups, cycle detection, shared reasons and concepts
  project.ts         blank documents, new nodes, tidy-tree positions (ids and clock passed in)
  scoring.ts         evaluate / evaluateAssessor: I(n), S = 2I − 100, equal / shares / structural; missing stays null;
                     marginal index and target effects (importance highlight)
  reviews.ts         which relation a review concerns, current vs stale, personal credence/influence, influence summaries
  eligibility.ts     option feasibility from gates: feasible / unresolved / blocked
  ballots.ts         preference per option and per archived round, weights frozen per round
  ranking.ts         options ordered by feasibility, completeness, balance; shared and per assessor
  views.ts           visible nodes, branch-focus projection, explicit collapse, assessment order, value profile, overlap
  layout.ts          three orientations, four-way projection and stable additions, compact and depth projections,
                     edge and secondary-link paths (port of view-layout.js)
  navigation.ts      keyboard tree navigation per orientation (port of keyboard-nav.js)
  lens.ts            review lens statistics, disagreements, assessor pairs, assessor summary (port of review-lens.js)
  table.ts           table rows in tree order and per-node assessment details (port of table-model.js)
  commands.ts        43 serializable Command types applied by applyCommand(project, command, { now, actorId })
  serialize.ts       .witt.json file form (byte-identical to the prototype), compact storage form, export filename
  ai/draft.ts        witt-ai-draft-v2/v3: task text, schema, parseAiDraft, preview summary, draftToProject
  ai/contribution.ts witt-contribution-v2 and witt-contribution-bundle-v1: request, prompt, parse, preview, apply, export
  ai/importReport.ts the import preflight: format detection, schema walk, graph checks, report text
  ai/starter.ts      legacy witt-ai-starter-v1 (unrated claim tree) → project
  ai/engine.ts       mutation primitives the AI imports call in the prototype's order (to reproduce its ids)
  ai/projectSchema.ts, ai/jsonSchema.ts   the v8 JSON Schema (diagnostic only; parseProject decides)
  session.ts         live collaboration rules (WG-030): invite link, wire messages and their parsers, per-command
                     authorization, the host's seats, invites and rates, document digest
src/lib/             browser infrastructure; imports domain only
  storage.ts         KeyValueStore over localStorage, in-memory fallback when blocked; witt-project-v3 load/save
  files.ts           download a text file, pick a text file
  providers.ts       newId (crypto.randomUUID) and nowIso — the only clock and id source
  i18n/              generated catalog.ts (keys, languages, Finnish), messages/<lang>.ts loaded on demand, translator
  workspaceMeta.ts   witt-workspace-meta-v1: active save, last opened/exported JSON, home card and replace-dialog texts
  library.ts         the IndexedDB document library with optimistic revisions, backup and all-or-nothing restore
  p2p/               network.ts (PeerNetwork interface, LoopbackHub for tests), keys.ts (tokens, room derivation, host
                     ECDSA key, password proof and suggestions), words-fi.ts (2048 words), session.ts (host and
                     participant controllers over a DocumentPort: admission, reconnect, host resume), hostStore.ts
                     (the host's session in IndexedDB), trystero.ts (the only WebRTC adapter, ADR A010; lazy chunks)
  export/            snapshot.ts (what to draw), svg.ts (the drawing), png.ts (single or tiles), pdf.ts (A4 pages),
                     zip.ts, raster.ts (browser-only canvas helpers), diagram.ts (dialog defaults, estimate, download)
src/app/             the UI; the only code that touches the DOM
  main.tsx, App.tsx  mount; body classes, zones, document-level keys, file open/save flows, home vs workspace
  store.ts           the one store: Project + undo/redo stacks, ViewState (from view.ts), session state, modal requests
  view.ts            ViewState and Zones in the prototype's witt-view-v1 / witt-zones-v1 shapes; per-document keys
  projection.ts      buildFrame / useFrame: visible projection, positions, directions, scores, lens, importance
  derive.ts          presentation helpers: balance text with †, `75%/+5` snapshot, shown influence, card chips
  actions.ts         workspace actions over the store (add, delete, collapse, arrange, focus, perspective, reuse…)
  collab.ts          live collaboration wiring: start as host, join from #join=, reload rejoin, connection choice
  shortcuts.ts       witt-keybindings-v1: eight rebindable actions, defaults + - * T F R ? Alt+A
  assessmentPass.ts, tableFormat.ts, format.ts   assessment-round progress, table cell texts, number formatting
  Home, TopBar, Toolbar, LeftPanel, Canvas, ContextMenu, ClaimPreview, ViewDock, Inspector, TableView, Tutorial
  dialogs.tsx        Modal, NoticeBar, ModalHost (confirm, text, notice, move, links, replace, import report, new work,
                     about, help, library, visual export, AI draft / review / results); larger dialogs mount from App
  *Dialog.tsx        Assessment, ReviewLens, Vote, People, Help, Examples, Library, VisualExport, Links, Replace,
                     ImportReport, AiDraft, AiReview, AiResults
  styles.css         the prototype's stylesheet (eight themes, 390 px layout), kept so the same classes render the same
  themes-added.css   the owner's added themes (Terminaali, ASCII, Sarjakuva) and the bundled Comic Neue font (fonts/, OFL)
locales/messages.psv one table, nine languages (fi first); npm run i18n regenerates src/lib/i18n
public/examples/     the five synthetic example documents, fetched only when chosen
tests/unit           pure and parity · tests/golden fixtures from the prototype · tests/e2e Playwright
scripts/             Node scripts with exit codes 0/1/2
```

Direction: app → lib + domain; lib → domain; domain → other domain modules. Relative imports carry the `.ts` extension because Node runs domain, lib and tests without a bundler (A002).

## Seams

Everything volatile is passed in: `now` (ISO timestamp), `newId` (UUID source), the key-value store, the file and clipboard adapters, the loaded message map. The domain never reads `Date`, `crypto`, `window`, `navigator` or `localStorage`; AI conversions take a `Clock` (`{ now, newId }`). Tests fix `now` and use counting ids; the browser wires `src/lib/providers.ts` in `src/app` only.

## Data flow

- **Edit**: UI event → an action in `actions.ts` or a component → `store.dispatch(command)` → `applyCommand(project, command, { now, actorId })` → on success the previous project goes on the undo stack (60 deep), the new one replaces it, `persist` writes `witt-project-v3` and `witt-workspace-meta-v1` (`recordActive`), subscribers re-render. A refusal throws in the domain and becomes a notice; the document stays as it was. Ids are minted by the UI and carried inside the command.
- **Render**: `useFrame(state)` memoises `buildFrame(project, view, session)`: the focus projection (branch focus, table reveal, depth limit or explicit collapses, hidden repeated reasons), `evaluate` for the shared viewpoint and `evaluateAssessor` for the personal one and for the actor, the review lens, the importance effects, leading options, card height and positions (compact, four-way with offsets, or the document positions in the orientation). Components read only the frame and the store; `derive.ts` turns frame values into text (`—` never 0, `†` for incomplete).
- **View state** (`ViewState`: presentation, orientation, workflow, layers, focus, dock, index mode, viewed assessor, highlights, depth) persists in `witt-view-v1` and never enters the document; zones in `witt-zones-v1`. Session-only state (home screen, tree-only mode, left tab, selected library card, depth overrides, explicitly closed branches, table reveal, inline edit, camera, selection) is never stored. Per document: `witt-assessor-v1:<id>`, `witt-review-view-v1:<id>`, `witt-assessment-pass-v2:<id>:<actor>`. The base theme is document data; special skins are `witt-appearance-v1`.
- **Open**: `pickTextFile` → size limit → `inspectImport` (preflight report; a failing report opens the import-report dialog) → route by format: project or starter → `store.prepareReplacement` (replace dialog: discard, save to library first, or stay) → `store.load`; AI draft → the AI draft preview; contribution → the proposal preview; library backup → restore. A refused document never touches the current one.
- **AI round-trip**: the domain builds the task text and schema deterministically → the person copies or downloads it → pastes the reply → `parseAiDraft` / `parseContribution` → preview → the person accepts a subset → `draftToProject` / `applyContribution`. AI profiles stay separate users; no network call anywhere.
- **Library**: explicit saves only, `put` with the revision this tab last saw; a stale tab cannot overwrite. Never written by autosave.
- **Collaborate** (WG-030): the host's `store.dispatch` applies as usual and hands the command to the host session, which sends a numbered commit (command, host `now`, actor, digest) to every participant; a participant's `dispatch` only proposes, the host authorizes (`authorizeCommand`) and applies it with the seat as actor, and the participant applies commits in order through `store.collabPort()` (no undo history in a session). A gap or digest mismatch fetches a snapshot. `store.load` refuses for a participant and, for the host, sends the same document as a snapshot or ends the session for another one. Follow-ups to a participant's own new node (select, inline edit) wait in `store.afterNode` for its commit.
- **Export**: `VisualExportDialog` builds a `SnapshotInput` from the frame (layers, projection, shown scores, labels, chips) → `src/lib/export` renders SVG and derives PNG/PDF from it; exporting never mutates the document or the view.

## Persistence

`localStorage` keys are the prototype's (UI_INVENTORY S-12), so a document autosaved by the prototype on the same origin is found. When storage is blocked, an in-memory store takes over and the UI says the work lives only in this session. Quota and corrupt JSON are surfaced, never swallowed: an unreadable autosave is left untouched and reported on the home screen. The library lives in IndexedDB (`witt-document-library`). P2P logs would arrive later on IndexedDB too.

## Security boundary

Untrusted input is parsed once at the boundary (`parseProject`, `parseAiDraft`, `parseContribution` / `parseContributionBundle`, preceded by the `inspectImport` preflight), previewed, and applied only by the person's explicit, granular acceptance. User text is rendered through React's escaping and the export's own SVG escaping; nothing reaches `innerHTML`-class sinks. `index.html` carries a Content-Security-Policy: scripts from the page's own origin only, connections to it and to `wss:` (collaboration signaling; the dev server adds `ws://` to this machine), no inline script, no framing. The app never calls a hosted AI service; nothing leaves the browser except files the person saves, clipboard writes the person triggers and, during a collaboration, the document to its participants. Collaboration messages are parsed once (`parseToHost`, `parseToPeer`) and every proposal is authorized by the host per command type.

## Errors people can see

A refused command or import surfaces as a notice bar (`role="alert"`) or the notice dialog with the domain's Finnish message (the prototype's texts: "Tiedoston formaattiversiota ei tueta…", "Uusi vanhempi on virheellinen…"); the document stays as it was. A failing import shows the import report with path, message and fix per issue. A storage failure sets the save status to "Selaintallennus epäonnistui – vie JSON-tiedosto". Replacing the open work asks first and names the title, mode, node count and times.

## Testing strategy

- **Golden fixtures** (`tests/golden/`, `npm run golden`): the prototype engine is run over every example and hand-built cases; `golden.test.ts` asserts the domain reproduces every number.
- **Parity tests** (`tests/unit/*-parity.test.ts`, `commands.test.ts`, `serialize.test.ts`, `lib-export.test.ts`, `lib-library.test.ts`, `lib-workspace-meta.test.ts`, `ai-*.test.ts` through `ai-oracle.ts`): `createRequire` loads the frozen prototype's CommonJS/UMD modules directly and the same inputs (every example, orientation, card height, key, filter, export option) go through both; outputs must be equal, often byte for byte (SVG, PDF, ZIP, prompts, `.witt.json`).
- **Browser walks** (`tests/e2e/`, Playwright, Chromium, 1440×900 and 390×844) drive the app by the prototype's element ids; `parity-walk.spec.ts` drives the frozen prototype (served on 4174) and the app (4173) through the same steps and compares the visible texts.

## P2P note

Live collaboration v1 (WG-030, RFC R1 §15) uses exactly this: the host is the sequencer, peers replay its commits. What remains of the RFC (durable log, replicas, quorum, failover, recovery) builds on the same commands. Earlier note: Every document change is a serializable command with caller-supplied ids and a clock passed in, so the same command log replays identically on another peer: the command log is the future P2P event log (`docs/spec/P2P_NO_DATABASE_RFC_R1.md`), no second engine needed. Not started.

## Glossary (fi)

Argumentointi = argument mode · Päätös = decision mode · Kartoita / Punnitse / Päätösäänestys = map / weigh / ballot stages · väite = claim · vaihtoehto = option · ryhmä = option group · uskottavuus = credence 0–100 % · vaikutus = signed influence −5…+5 · Perustelutulos = argument balance −100…+100 · Yhteydet ja perustelut / Toistuvat perustelut = the repeated-reason library · Luo kirjastoon = create a library reason · Liitä myös muihin solmuihin… = attach this claim under other targets · Näkymäasetukset = view settings dock · Käyttäjien arvioiden näkyminen = review lens · Arviointikierros = assessment round · Asiakirjakirjasto = document library · Tallennettu selaimeen = browser-save status · AI-tehtävä = the AI task text · Tuo tai vie muutoksia = contribution import/export.

## Not built

The RFC's full P2P rooms: durable logs, peer replication, quorum, failover, owner recovery, TURN, manual signaling. A hosted product. Any backend.
