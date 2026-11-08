# User experience and workflow contract — WITT dev32

**Goal:** Keep the specific, user-refined UI behavior stable while modernizing its implementation. This describes **implemented baseline behavior**, not a promise that every flow has already been audited for WCAG compliance or production security. Representative CSS selectors and existing test files provide traceability.

## UX-A. Information architecture and cognitive load

| ID | Baseline requirement | Regression anchors |
| --- | --- | --- |
| UX-A01 | Argumentointi / Päätös are the two explicit main modes; never show a redundant floating "Vedä solmuja ja avaa niiden haaroja" canvas banner or "KÄSITTELYN TYYPPI" caption. | `src/app.js` and `tests/reuse-ux-dev23.test.cjs` |
| UX-A02 | File menu contains new/open/save/export and offline AI/import flows; **Edit** menu contains tree editing/repeated reasons/undo-redo; **Help** contains examples and guided tutorial; **View** owns display highlighting. | `tests/navigation-direction-dev27.test.cjs`, `tests/navigation-direction-dev27.test.cjs` |
| UX-A03 | The tool prioritizes *drawing and understanding an argument tree* over dense forms. A guided assessment walkthrough is **optional** and direct edits in the tree/inspector remain fully supported. Use a focused question with clear target context; no fabricated AI questions from free text. | `tests/decision-guided-review-dev8.test.cjs` |
| UX-A04 | Keep users' own individual reviews separate from calculated outputs; "75%/+5" is an input summary, not a net balance. Aggregated human means are **italic** with tooltip; personal reviews are upright; AI perspective is explicitly named. | `tests/compact-assessments-root-dev22.test.cjs` |
| UX-A05 | Argument balance is shown signed (-100..+100, 0 neutral); unassessed/incomplete state is clearly distinguishable from scored 0, e.g. "—". Avoid calling credence "index". | `tests/signed-balance-dev21.test.cjs` |
| UX-A06 | A child's displayed primary relation direction reflects signed evaluated influence for selected perspective; original +/- node creation remains a template and never overwrites other people. E.g. negative -3.5 must show "Vastustaa" even if created as initial support. | `tests/navigation-direction-dev27.test.cjs` |
| UX-A07 | Group and branch navigation never modifies stored assessment or score; collapsing all option descendants, scrolling/depth slider and local per-branch overrides are reversible presentation. | `tests/depth-vote-png-dev18.test.cjs` |
| UX-A08 | Clear list/table reading alongside tree, showing logical order, direct relationship, immediate context, expandable review details. The table must not become a separate truth/score model. | `src/table-model.js` |

## UX-B. Canvas and docking

- **UX-B01**: Top header stays accessible even when the toolbar or other zones are hidden; four DAW-inspired buttons for left/top/right/bottom panel visibility are **immediately left of language and theme**. `Alt+1`..`Alt+4` toggle the zones.
- **UX-B02**: `Näkymäasetukset` is a true **toggle** (opens next to its own toolbar trigger, second press closes), `Alt+V` also works, `aria-pressed/expanded` match visibility. View menu opens it when needed. This is *not* a permanently occupying modal.
- **UX-B03**: View-settings dock uses viewport coordinates, not argument-canvas coordinates; drag on desktop/touch, preserve last position in local `witt-view-v1.dockScreenPosition`; double click handle to reset next to trigger. Keep trigger accessible even when dock overlaps other areas. Limit width/height on mobile; no horizontal overflow.
- **UX-B04**: Pan and zoom from keyboard and pointer; toolbar controls and navigator must work with focus in the canvas, not steal text inputs. Preserve centering on selected/added uses. View data do not change persisted argument geometry or scores.
- **UX-B05**: Node layout supports manual dragging, automatic reflow, collapsing, hierarchy depth slider (root-only to all leaves), and per-branch expansion. Compact decision-option view preserves underlying manual coordinates. Do not allow temporary projection positions to become persisted positions through accidental drag.
- **UX-B06**: Four-panel states and appearance themes are **per-browser preferences**, not author/GRACE document state. The **Bitberg** theme is dark graphite with colored argument lanes and tight control density; preserve existing Light/Dark/Paper and other visual worlds. Do not unintentionally rename Bitberg back to Studio DAW.
- **UX-B07**: `Rakenne` controls are not an always-open redundant box inside the end of every node inspector. Use the Edit menu/appropriate optional lower pane, consistent with current implementation and user intent.
- **UX-B08**: The workspace, side inspector and panel toggles are usable at 1440×900 and 390×844. Browser tests exist for exact dock behavior: `tools/smoke-dock-header-dev32.py`.

## UX-C. Repeated reasons, links and review

- **UX-C01**: `Toistuvat perustelut` is a **card-based shelf** beside the tree, reminiscent of DAW modulation/routing lists. It lists reusable concepts and claims with multiple targets; there must not be confusing parallel beginner-level "Lisäyhteys" and "Kontekstisidonnainen yhteinen peruste" workflows.
- **UX-C02**: Creating a reason in the shelf and **attaching** to the tree are two visibly distinct actions. `Luo kirjastoon` must always visibly create/select a card, including a placeholder "Uusi perustelu" when invoked with blank title. Do not silently fail native form validation or put new cards out of sight.
- **UX-C03**: Cards can be selected to inspect their uses; dragging onto a target or explicit attach creates a single new contextual occurrence with its own ID, never a duplicate secondary link. Clicking a listed connection opens that **specific use's** reviews.
- **UX-C04**: Any ordinary claim may be made reusable **from its node inspector** via "Liitä myös muihin solmuihin…"; promote without losing old children, votes or review IDs. Creating a new use reveals it immediately in the tree even if repeating branches were hidden (and opens path + centers viewport). Manual view-hide is still permitted thereafter.
- **UX-C05**: Repeated use in two option contexts has independently assessed *credence and signed influence* per person (for example 70%/+4 vs 90%/-3). Locked globally shared p/w is explicitly opt-in and tucked in advanced settings, not assumed from same text.
- **UX-C06**: Explicit multiple route effects are counted; a potentially converging argument is described as an **information note**, not an error badge or blocking warning. Show the actual source → target route names when expanded. Old links remain inspectable for v8 compatibility with code; new users attach through repeated-reason flow.
- **UX-C07**: No accidental self-use or cycle, no doubled direct use for same target, and no fake cloned ratings. Changing a concept's title marks relevant stale influences for review.

## UX-D. Review, decisions and ballots

- **UX-D01**: Credibility/probability UI 0–100%; signed relation UI **-5 opposes, 0 neutral, +5 supports**, 0.5 steps. Show clear axis labels, do not split relation type and a separate unsigned "strength 1..5" in ordinary UI.
- **UX-D02**: New claim's editable template credence 100%, but no saved human vote until reviewed. The main **argumentation thesis** gets a computed net from reviewed descendants even with no thesis credibility vote. A decision-question root is not itself rated.
- **UX-D03**: Person choice and aggregation visibility: when no AI review exists, avoid needless "only humans" captions. The current individual may have an editable human display name. Selecting another human/AI viewpoint must not switch or overwrite active editor identity unless explicitly requested.
- **UX-D04**: Decision option scores and feasibility are visible *before* optional vote. Voting is not required for computationally assisted decision comparison. In vote dialog, show prior calculated option background appropriately.
- **UX-D05**: Once decision ballots are open, unsaved slider values for other options survive each individual save/re-render; they do not reset to "not assessed". Freeze round options and declared weights.
- **UX-D06**: Current local ballot preference slider is 0–100; online future may add 1-of-N and up-to-K-of-N, but not silently reinterpret old saved 0–100 ballots or retroactively change results.
- **UX-D07**: Users can have distinct decision voting shares and optionally explicitly choose to apply those shares in **human assessment aggregation**. These are independent settings. Show what weighting/viewpoint produced a result.
- **UX-D08**: `Korosta painavimmat`, strongest options and related visual emphases belong to **View**, not to a place where changing them appears to change scores.

## UX-E. AI, import/export, files and local authors

- **UX-E01**: New tree with AI is behind **File → New → AI-assisted** (and home). Two clear steps: (1) build a single AI task, (2) open AI's JSON reply and preview it. `Kopioi AI-tehtävä` vs `Lataa sama tehtävä (TXT)` are identical *content*; choose either. Separate JSON schema is optional advanced tech; task already contains schema.
- **UX-E02**: The current-tree AI/human **proposals** flow is separate from new-tree creation. Never treat external text/JSON as an instruction to bypass preview. Clipboard errors reveal a selectable prompt (not inserted into JSON-response field). Dialogs remain readable at 1440/390 widths.
- **UX-E03**: Multiple local users may create nodes, comment, assess and export a single contribution bundle. Each identifiable contribution retains its own immutable author ID and mutable display name; incomplete historical authorship is disclosed rather than guessed. AI contributions have their own provenance.
- **UX-E04**: Human selection dropdown allows direct "Lisää paikallinen käyttäjä" and switching previously added users. User names can be edited without changing stable IDs.
- **UX-E05**: `Tuo / vie muutoksia` explains that export is a **diff against chosen original project JSON**, not a full project, and that the recipient previews before applying. A full project export is separately accessible. Offer contributor selection and clear unknown-authorship counts.
- **UX-E06**: Replacement confirmation for New/Open/imported project/example/AI project identifies current project name, argument/decision mode, node count, last edited and browser-autosaved timestamps if known; distinguish local browser saving from externally downloaded/shared document. Never claim automatic history/archive that does not exist.
- **UX-E07**: `Tallennettu selaimeen` status is low prominence (in File area), with errors made visible. No fake server sync, document-cloud save or authenticated identity.
- **UX-E08**: SVG/PNG/PDF exports include active viewpoint, optionally selected layers/entire tree, signed score and appropriate human/AI labels. Single large PNG preferred when browser/memory allows; ZIP tiles as fallback. Multi-page PDF renders bounded pages; avoid giant canvas decode. Exports must not alter source project/position/ratings.

## What is NOT done

Not yet implemented: live P2P rooms, cryptographically verified user identity, backend persistence, mindmap/free-drawing editor, authenticated multi-device team sessions, production-accessibility certification or browser cross-engine parity tests. See `docs/P2P_NO_DATABASE_RFC_R1.md` and `docs/FUTURE_BACKLOG.md`.

## Primary regression suite

`npm run check && npm run build`, then targeted `tools/smoke-dock-header-dev32.py`, `smoke-multi-author-dev31.py`, `smoke-navigation-dev27.py`, `smoke-unified-reuse-dev29.py`, `smoke-replacement-routes-dev30.py`, `smoke-ai-task-choices-dev28.py`, `smoke-signed-balance-dev21.py`, `smoke-visual-export-dev13.py` on Chromium. Visual QA and exploratory human testing still required for significant layout changes.
