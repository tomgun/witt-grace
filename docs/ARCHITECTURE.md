# Architecture

**Status: proposed target (ADR A003), no code yet.** The shape is the one the owner's other projects use and the one the prototype's audit recommended: a pure domain, thin infrastructure, and a UI that only renders and dispatches. The prototype's monolith (`witt-grace-gpt-proto/src/app.js`, 4 333 lines of DOM wiring) is what this replaces; its pure engine (`src/core.js`) is what the golden fixtures are generated from.

```text
   person ──► src/app      UI: tree, table, inspector, menus, docking, dialogs (framework per ADR A005)
                 │ dispatches commands, renders a view model
              src/lib      browser infrastructure: storage adapter, file open/save, clipboard,
                 │         i18n catalog loading, SVG/PNG/PDF renderers, id and clock providers
              src/domain   pure functions over the v8 document:
                           model (types, closed sets) · parse (the boundary) · scoring (evidence-v3-links)
                           aggregation · eligibility · reasons and concepts · ballots · commands · serialize
```

## Folders and the dependency rule
```
src/domain/     pure decisions; imports only Node builtins and other domain modules (ESLint + tests/unit/import-direction.test.ts)
  model.ts      the v8 document types and closed sets (kinds, stances, semantic types, weighting modes, scoring and schema versions)
  parse.ts      parseProject, parseContributionBundle, parseAiDraft — the only places unknown JSON becomes typed values
  scoring.ts    I(n), S(n), per viewpoint and weighting; missing stays null
  eligibility.ts gates: met / unmet / unknown per option
  reasons.ts    concepts, context-local uses, locked shared reasons, secondary links
  ballots.ts    rounds, frozen weights, results
  commands/     one file per command group: nodes, reviews, concepts, groups, users, ballots, comments
  serialize.ts  canonical JSON for .witt.json, diff/bundle export
src/lib/        storage (localStorage now, IndexedDB later), files, clipboard, i18n, export renderers, providers (now, newId)
src/app/        the UI; the only code that touches the DOM
locales/        one catalog, nine languages (fi first); a generated typed key list
schemas/        project.v8.schema.json (copied from the prototype; asserted equal until a deliberate bump)
tests/unit      pure · tests/golden fixtures from the prototype · tests/e2e Playwright
scripts/        Node scripts with exit codes 0/1/2, --help
```
Direction: app → lib + domain; lib → domain; domain → builtins. Relative imports carry the `.ts` extension where Node runs the code without a bundler (A002).

## Seams
Everything volatile is passed in: `now` (ISO timestamp), `newId` (UUID source), the storage adapter, the file and clipboard adapters, the locale. The domain never reads `Date`, `crypto`, `window`, `navigator` or `localStorage`. Tests fix `now` and `newId` per case; the browser build wires real providers in `src/app` startup only.

## Flows
- **Open**: file or storage → `parseProject` (refuses unknown versions, cycles, orphans, duplicate IDs, foreign authorship) → typed `Project` → render. A refused document never touches the current one.
- **Edit**: UI event → one command `(project, input, {now, newId}) → project` → autosave through the storage adapter → render. Undo/redo is a stack of projects (or inverse commands) in `src/lib`, never inside the domain.
- **Score**: `score(project, viewpoint, weighting)` is a pure read; the UI calls it per render and caches by project identity. View state (theme, pan, zoom, pane visibility, depth filter, dock position) lives in `src/lib` storage under its own key and never enters the document.
- **AI round-trip**: `buildAiTask(project, locale)` (domain, deterministic text + schema) → the person copies or downloads it → pastes the reply → `parseAiDraft` → `previewContributions(project, draft)` (domain diff) → the person accepts a subset → `applyContributions`. No network call anywhere.
- **Contribution bundle**: `diffProjects(original, modified, authorIds)` → bundle v1 → recipient previews and applies per author; author IDs survive untouched.
- **Export**: `src/lib` renderers take a layout view model from the domain and write SVG/PNG/PDF; exporting never mutates the document.

## Persistence
`localStorage` keys: the current project (autosave), the document library, the view preferences (`witt-view-v1`). Replacing the current project needs the confirmation that names its title, mode, node count and timestamps (UX-E06). Quota, private mode and corrupt JSON are surfaced, never swallowed. IndexedDB arrives with P2P logs.

## Errors people can see
Filled per surface at WG-007 in the same shape as the prototype's Finnish messages: what happened, why, the next action. A refused import names the version or the first invalid path; a storage failure names the key and the cause.

## Glossary (fi)
Argumentointi = argument mode · Päätös = decision mode · väite = claim · vaihtoehto = option · ryhmä = option group · uskottavuus = credence 0–100 % · vaikutus = signed influence −5…+5 · perustelusaldo = argument balance −100…+100 · Toistuvat perustelut = the repeated-reason shelf · Luo kirjastoon = create a concept card · Liitä myös muihin solmuihin… = attach this claim under other targets · Näkymäasetukset = view settings dock · Tallennettu selaimeen = browser-save status · AI-tehtävä = the AI task text · Tuo / vie muutoksia = contribution bundle import/export.

## Not built
P2P rooms, peer replication, WebRTC, signaling (RFC R1). A hosted product. Any backend.
