# Prototype UI inventory — the screen-level contract (dev32)

> **Contract.** The owner decided on 2026-11-08 that everything visible in the frozen prototype (`witt-grace-gpt-proto/`, 0.11.0-dev.32) is the UI specification for the new implementation, and that the functionality behind each visible thing is to be investigated in the prototype's code, not guessed. This file is that inventory: every region, control, dialog, layer, stage, persisted key and file format, in the prototype's own vocabulary. `UX_AND_WORKFLOWS.md` keeps the rationale (UX-A…E); this file is the checklist. Element ids are the prototype's DOM ids from `witt-grace-gpt-proto/index.html` and `src/app.js`; the new implementation keeps them as `data-testid` values so the same Playwright walk can drive both apps.
>
> Status vocabulary per row in `REQUIREMENTS.md`: Implemented / Partial / Planned. A row here that the new app does not yet have is Planned, not optional. A deliberate deviation needs a `CHANGELOG.md` line in this folder and the owner's decision.

## How to read

- **Key** = i18n key in `locales/messages.psv` (Finnish shown). The new app must render the same key, so the nine languages come for free.
- **Shown when** = the exact predicate in the prototype. "always" means always within that screen.
- **Does** = the behaviour behind the control, with the prototype function it maps to when it matters for parity.
- Numbers in the inventory are pinned by golden fixtures (`tests/golden/`) and browser walks (`tests/e2e/`), not by this prose.

## S-00 Shell and global state

| Item | Prototype | Notes |
| --- | --- | --- |
| Root element | `<body data-theme="light" class="home-active">` | `home-active` shows the home screen and hides the app shell; removed when a document is opened. |
| Hidden file inputs | `#fileInput` (accepts `.json,.witt.json,.peruste.json,application/json`), `#aiDraftInput`, `#aiReviewInput`, `#wittOriginalInput`, `#libraryBackupInput` | One input per flow; every open flow goes through these. |
| Themes | `light`, `dark`, `paper`, `cosmos` (Star map), `hologram`, `manuscript-book` (Manuscript / Book), `manuscript-pen` (Manuscript / Quill), `bitberg` (shown as “◆ Yövärit” / “◆ Night colours” since 2026-11-09; the prototype labels it “Bitberg”); added 2026-11-09: `terminal` (▮ Terminaali), `ascii` (# ASCII), `comic` (✎ Sarjakuva) | Eight prototype themes plus three added ones (S-15), same list on the home screen and in the top bar. `<meta name="theme-color">` follows the theme. |
| Languages | `fi` Suomi, `de` Deutsch, `en` English, `es` Español, `fr` Français, `ru` Русский, `zh-Hans` 简体中文, `ja` 日本語, `ko` 한국어 | Same list on the home screen and in the top bar; persisted in `witt-locale-v1`. |
| Version | Footer `WITT 0.11.0-dev.32` | The new app shows its own version in the same place. |

## S-01 Home screen (`#homeScreen`)

Shown instead of the workspace on load and via the ⌂ button. Layout: nav row, hero (copy left, static illustration right), three feature cards, bottom line.

| Element | Id | Key / Finnish | Shown when | Does |
| --- | --- | --- | --- | --- |
| Brand button | `#btnHomeLogo` | `acronymDetails` (aria) | always | Opens the About dialog (S-11.15). Title attribute spells out WITT and GRACE. |
| Language select | `#homeLocaleSelect` | `language` Kieli | always | Same as top-bar select, persisted. |
| Theme select | `#homeThemeSelect` | `theme` | always | Same as top-bar select, persisted. |
| About button | `#btnHomeAbout` | `homeAbout` Tietoa menetelmästä | always | Opens About dialog. |
| Eyebrow | — | `homeEyebrow` SELKEÄMPÄÄ AJATTELUA · GRACE-MENETELMÄ | always | — |
| Title | `#homeTitle` | `homeHeroFirst` Ajattele selkeästi. / `homeHeroSecond` Päätä viisaasti. (accent) | always | — |
| Lead | — | `homeLead` Kartoita väitteet, vaihtoehdot ja oletukset. Punnitse perustelut ja tee harkittuja päätöksiä. | always | — |
| Continue | `#btnHomeContinue` | `homeContinue` Jatka edellistä työtä | a readable browser save exists (`hidden` otherwise) | Opens the saved document in the workspace. Rendered as the primary-looking button when visible. |
| New | `#btnHomeNew` | `homeNew` + Aloita uusi puu | always | Opens the New work dialog (S-11.12). |
| Open file | `#btnHomeOpen` | `homeOpen` Avaa tiedosto | always | Triggers `#fileInput`; see S-13 open flow (validation report, replacement dialog). |
| Try example | `#btnHomeDemo` | `homeDemo` Kokeile esimerkkiä | always | Opens the Examples dialog (S-11.5). |
| Tutorial | `#btnHomeTutorial` | `tutorialStart` Opastettu harjoitus | always | Starts the guided tutorial (S-11.7) on a fresh document. |
| More actions | `details.home-extra-menu` | `homeMore` Muut toiminnot | always (collapsed) | Reveals: `#btnHomeLibrary` `documentLibrary` Asiakirjakirjasto; `#btnHomeAI` `newWithAI` Luo uusi puu AI:n avulla; `#btnHomeAIReview` `aiProposalMenu` AI:n tai toisen käyttäjän muutosehdotus. |
| Current work card | `#homeCurrentWork` | `homeSavedHeading` Jatka edellistä asiakirjaa | a browser save exists | Shows `#homeCurrentTitle`, then `homeBrowserSaveLabel` Selaimen viimeisin tallennus / `#homeBrowserSave`, `homeOpenLabel` Viimeksi avattu JSON / `#homeLatestOpen`, `homeExportLabel` Viimeisin JSON-vienti / `#homeLatestExport`. Unknown values read "Tarkka aika ei tiedossa" / "Ei vielä tietoa" (exact rules in S-12). |
| Unreadable save warning | `#homeSaveWarning` | `homeUnreadableWarning` Selaimessa on tallennus, jota ei voitu avata. Alkuperäisiä tietoja ei ole korvattu. | the stored project fails to parse | The broken save is left untouched. |
| Session-only warning | `#homeSessionWarning` | `sessionOnlyWarning` Selaimen tallennus on estetty. Työ säilyy vain avoimessa istunnossa – vie se JSON-tiedostoksi ennen sulkemista. | storage is blocked | — |
| Privacy line | — | `homePrivacy` Voit käyttää työkalua ilman kirjautumista. Vie työsi tiedostoksi milloin tahansa. | always | — |
| Illustration | `.home-visual` | `homeCanvasLabel` AJATTELUN TYÖTILA, `homeCanvasRoot` Kannattaako uusi tuote julkaista?, `homeCanvasFor` + PUOLTAA, `homeCanvasForTitle`, `homeCanvasForDetail`, `homeCanvasAgainst` − VASTUSTAA, `homeCanvasAgainstTitle`, `homeCanvasAgainstDetail`, `homeCanvasSteps` Kartoita · Punnitse · Päätä | always, `aria-hidden` | Static; not a live tree. |
| Feature cards | `.home-features` | 01 `homeStageMap` Kartoita / `homeExplore`; 02 `homeStageEvaluate` Punnitse / `homeEvaluate`; 03 `homeStageDecide` Päätä yhdessä / `homeDecide` + badge `homeSoon` Paikallinen | always | — |
| Bottom line | `.home-bottom` | `methodName` GRACE-menetelmä, `homeMethodNote`, button `#btnHomeHelp` `homeLearn` Tutustu menetelmään | always | Opens the Help dialog (S-11.18). |

## S-02 Top bar (`header.topbar`)

| Element | Id | Key / Finnish | Does |
| --- | --- | --- | --- |
| Home | `#btnBackHome` ⌂ | `homeBack` Aloitussivulle | Returns to S-01 without closing the document. |
| Brand | `#btnEditorAbout` WITT. / GRACE Method ⓘ | — | Opens About dialog. |
| Document title | `#projectTitle` (input, maxlength 200) | `docName` Asiakirjan nimi | Edits the project title in place; part of the document, undoable. |
| Undo / redo (new app only) | `#historyControls`: `#btnUndoTop` ↶, `#btnRedoTop` ↷ | `undo` Kumoa (Ctrl/Cmd+Z), `redo` Tee uudelleen (Ctrl/Cmd+Shift+Z) | Owner decision 2026-11-09 (S-15): always visible left of the zone toggles, disabled when there is nothing to undo or redo. The prototype offers undo only in the Edit menu, by key and in the tree-only quick bar. |
| Zone toggles | `#btnZoneLeft` ◧ Alt+1, `#btnZoneTop` ▤ Alt+2, `#btnZoneRight` ◨ Alt+3, `#btnZoneBottom` ▥ Alt+4 | titles "Vasen sivupalkki (Alt+1)" etc. | `aria-pressed` reflects visibility; defaults left/top/right on, bottom off; per-browser preference (`witt-view-v1`). |
| Help (new app only) | `#btnHelpTop` ? | `shortcutsButton` Pikanäppäimet (key `?`) | Owner decision 2026-11-09 (S-15): opens the help and shortcuts dialog, right of the zone toggles. On ≤ 410 px the language and theme selects narrow so the row fits. |
| Language | `#localeSelect` | `language` Kieli | Switches all nine languages live. |
| Theme | `#themeSelect` | `theme` Ulkoasuteema | Eleven themes (S-00). |

## S-03 Toolbar (`.toolbar.witt-simplified-toolbar`)

| Group | Element | Key / Finnish | Does |
| --- | --- | --- | --- |
| Purpose | `#modeArgument` / `#modeDecision` | `modeArgument` Argumentointi / `modeDecision` Päätös | Switches the document mode. In decision mode the stage group gains `Päätösäänestys`, the left-bottom block gains option buttons, root label becomes PÄÄTÖS. |
| Stage | caption `stageLabel` TYÖVAIHE; `#btnWorkflowExplore` `explore` Kartoita; `#btnWorkflowEvaluate` `evaluate` Punnitse; `#btnVoting` `votingButton` Äänestä (decision mode) | — | Explore hides review inputs everywhere (inspector shows the "Uskottavuus ja vaikutus arvioidaan Punnitse-tilassa" note with a `Punnitse` button); Evaluate shows them. Voting opens the ballot dialog (S-11.16). Hidden `#workflowSelect` mirrors the state. |
| Actor | `#actorSelect` | `profileSelect` Arvioija | Lists local users and AI profiles; includes the "add a local user" entry (UX-E04). Changes whose reviews the inspector edits; never relabels existing work. |
| Presentation | `#btnTreeView` `treeView` Puu / `#btnTableView` `tableView` Taulukko; `#btnViewSettings` `viewSettingsButton` Näkymäasetukset (`aria-controls=viewDock`, `aria-expanded`); `#btnAIResults` `aiAssessmentsButton` AI:n arviot (hidden unless an AI profile has ratings) | — | Tree/table switch (`T`); view-settings dock toggle (`Alt+V`); AI results dialog (S-11.22). |
| Menus | five `details.toolbar-popover` | see below | Click `summary` to open; one open at a time; close on outside click and Escape. |

### Menu contents

**Tiedosto** (`#fileMenu`, `toolbarFileGroup`): `#btnNew` `new` + Uusi · `#btnOpen` `openJson` Avaa JSON · `#btnSave` `saveFile` ↓ Tallenna tiedosto (kbd Ctrl/Cmd+S) · `#btnExportVisual` `exportVisual` Vie kuva / PDF · `#btnLibrary` `documentLibrary` Asiakirjakirjasto · divider · `#btnAIReview` `aiProposalMenu` AI:n tai toisen käyttäjän muutosehdotus · divider · `#saveStatus` (role=status, default text "Vain tällä laitteella").

**Muokkaa** (`#editMenu`, `toolbarEditGroup`): `#btnEditMenuSelected` `editArgument` Muokkaa argumenttia · `#btnEditMenuSupport` `supportAdd` + Puoltava (kbd +) · `#btnEditMenuOppose` `opposeAdd` − Vastustava (kbd −) · `#btnEditMenuNeutral` `neutralAdd` Neutraali · `#btnEditMenuOption` `optionShort` Vaihtoehto · divider · `#btnContextMenu` `contextOpen` Toistuvat perustelut · `#btnSharedMenu` `sharedOpen` Yhteisperusteet (hidden by default) · `#btnEditMenuMove` `moveSubtree` Siirrä alipuu · `#btnEditMenuCollapse` `collapseSubtree` Sulje alipuu · `#btnEditMenuDelete` `deleteSubtree` Poista alipuu (kbd Del) · divider · `#btnUndo` `undo` Kumoa (Ctrl/Cmd+Z) · `#btnRedo` `redo` Tee uudelleen (Ctrl/Cmd+Shift+Z). Items that do not apply to the selection are disabled, not hidden (e.g. Siirrä alipuu / Poista alipuu on the root).

**Arviointi** (`#assessmentMenu`, `toolbarAssessGroup`): `#btnPeople` `profileManage` Käyttäjät · `#btnAssess` `assessmentStart` Arviointikierros (kbd `R`) · `#btnReviewLens` `reviewLens` Käyttäjien arvioiden näkyminen · label `indexDisplay` Perustelutulos + `#indexModeSelect` (`indexShared` Yhteinen / `indexPersonal` Oma).

**Näkymä** (`#viewMenu`, `toolbarViewGroup`): `#btnViewPanelMenu` `viewSettingsButton` Näkymäasetukset (Alt+V) · `#btnFocusView` `focusTree` Vain puu (F) · checkbox `#aiOptionHighlights` `highlightTopOptions` Korosta vahvimmat vaihtoehdot · checkbox `#importantToggle` `importantHighlight` Korosta painavimmat · checkbox `#showAuthors` `showAuthors` Näytä tekijöiden nimet.

**Apua** (`#helpMenu`, `toolbarHelpGroup`): `#btnDemo` `example` Esimerkit · `#btnTutorial` `tutorialStart` Opastettu harjoitus · `#btnKeyboardTop` `shortcutsButton` Pikanäppäimet (kbd `?`).

## S-04 Analysis perspective banner (`#analysisPerspectiveBanner`)

Shown (role=status) while an AI viewpoint is displayed in the tree: `#analysisPerspectiveLabel` names the viewpoint; `#btnPerspectiveOwn` `backToOwnReviews` Palaa omiin arvioihin returns to the person's own reviews.

## S-05 Left panel (`aside.leftpanel`)

| Block | Element | Key / Finnish | Does |
| --- | --- | --- | --- |
| Heading | eyebrow `workArea` TYÖTILA, h2 `tree` Argumenttipuu, `#nodeCount` pill | — | Count of nodes in the document. |
| Tabs | `#btnOutlineTab` `repeatTreeTab` Puurakenne / `#btnRepeatTab` `repeatTab` Yhteydet ja perustelut | — | Switches `#outlinePane` / `#repeatLibraryPane`. |
| Outline intro | `.left-intro` | `nodeIntro` Valitse solmu muokataksesi sitä. Siirrä laatikoita hiirellä, tai tartu tyhjään taustaan siirtääksesi näkymää. | — |
| Outline | label `structure` RAKENNE; `nav#treeOutline` | — | Indented rows with a relation dot, truncated title, caret for collapsible branches, selected highlight; hover shows the claim preview tooltip (S-11.27). Details in S-05.1 (dynamic). |
| Repeat pane intro | — | `repeatIntro` Kirjastossa olevat perustelut voidaan liittää useaan solmuun. Vedä kortti kohdesolmuun tai valitse kortti ja liitä se oikeasta sivupalkista. | — |
| Create form | `#repeatCreateForm`: `#repeatNewTitle` (`repeatNewTitle` Uusi perustelu kirjastoon, placeholder `repeatTitlePlaceholder` Kirjoita perustelun väite); `details.repeat-advanced` `repeatAdvanced` Lisäasetukset (valinnainen) with `#repeatNewSemantic` (`repeatSemantic` Perustelun luonne; `contextFact` / `contextAssumption` / `contextValue`; help `repeatSemanticHelp`), `#repeatNewMode` (`repeatMode` Arviointien jakaminen; `repeatIndependent` Arviot kohteittain / `repeatLocked` Sama lukittu arvio), `#repeatNewLockedFields` (`sharedProb` Uskottavuus (%) default 100, `sharedImpact` Vaikutus (−5…+5) default 3, shown only for locked); `#btnRepeatCreate` `repeatCreate` Luo kirjastoon; `#repeatLibraryStatus` | — | Creates a concept (or a locked shared reason) and selects its card; blank title yields a placeholder "Uusi perustelu" card (UX-C02). |
| Library cards | heading `repeatExisting` Kirjaston perustelut; `#repeatCards` | — | One card per concept: title, use count, actions (attach to selected, rename, remove); draggable onto a canvas node. Empty text: "Kirjasto on tyhjä. Luo perustelu tai valitse puusta valmis perustelu." |
| Multi-use | `#repeatMultiUse`: `multiUseTitle` Useaan kohteeseen vaikuttavat väitteet, intro `multiUseIntro`; `#repeatMultiCards` | — | Cards "YKSI VÄITE · USEITA VAIKUTUKSIA" with the claim and "Yhteyksiä N" for nodes with secondary links. |
| Cross-link routes | `details#repeatCrossLinks`: `multiUseRoutes` Yhteysreitit (yksityiskohtaiset) + `#repeatSecondaryCount`; help `repeatCrossLinkHelp`; `#repeatSecondaryCards` | — | Source → target route cards for each secondary link (UX-C06). |
| Promote | `#btnRepeatPromote` `repeatPromote` Tee valitusta perustelusta toistuva | — | Promotes the selected node to a concept (UX-C04). |
| Add block | label `addToSelected` LISÄÄ VALITTUUN SOLMUUN; `#btnSupport` `supportAdd` + Puoltava, `#btnOppose` `opposeAdd` − Vastainen, `#btnNeutral` title `neutralAdd` "0"; `#btnOption` `optionAdd` + Päätösvaihtoehto and `#btnOptionGroup` `optionGroupAdd` + Vaihtoehtoryhmä (decision mode); `#btnSharedReasons` `sharedOpen` (hidden); `#btnContextReasons` `contextOpen` Toistuvat perustelut; note `localHint` Muutokset tallentuvat selaimeen automaattisesti. Vie JSON-tiedosto erilliseksi varmuuskopioksi. | — | Adds a child to the selected node with the given template relation and starts title editing. |

## S-06 Table area (`#tableArea`, replaces the canvas when Taulukko is active)

Header: eyebrow `tableEyebrow` ARGUMENTIT, h2 `tableTitle` Argumentit taulukkona, intro `tableIntro`. Filters: `#tableSearch` (`tableSearchLabel` Etsi väitteistä), `#tableFilter` (`tableAll` Kaikki suhteet / `supportWord` / `opposeWord` / `optionWord`), `#btnReviewLensTable` `reviewLens`, checkbox `#tableComments` `tableShowComments` Näytä kommentit. `#tableSummary` ("Näytetään 11/11 väitettä"), `#reviewLensBanner`, `#mobileArguments` (card list at narrow widths), table columns `tableColClaim` Väite, `tableColRelation` Suhde, `tableColContext` Asiayhteys, `tableColCredence` Uskottavuus, `tableColInfluence` Vaikutus, `tableColIndex` Perustelutulos, `tableColDetails` Tiedot (expandable "Avaa tarkemmin"). Rows in tree order with `↳` depth marks; relation pills (PÄÄVÄITE, Puoltava, Vastustava, Vaihtoehto) plus chain-direction notes ("− ketjun suunta"); context column shows the parent and the grandparent chain; evaluation columns show mean with reviewer count "85 % (3)", "+3.7 (3)", balance "+47.5 †" or "—". Keyboard: `T` toggles, Enter opens a row. Details in S-06.1 (dynamic).

## S-07 Canvas (`section.canvas-area`)

| Part | Element | Content |
| --- | --- | --- |
| Quick controls | `.canvas-quick-controls` | `#btnFocusQuick` ⛶ Vain puu · `#btnOrientationQuick` (`changeOrientation`) · `#btnArrangeQuick` `arrange` ↹ Järjestä puu · `#btnUndoQuick` ↶ Kumoa · `#actorQuickSelect` · `#btnAssessQuick` ◉ Arviointikierros · `#btnEditQuick` ✎ Muokkaa (F2) · `#btnReviewLensQuick` · `#btnKeyboardQuick` ⌨ Pikanäppäimet. Shown in "Vain puu" focus mode and when the top zone is hidden. |
| View dock | `#viewDock` | See S-07.1. |
| Viewport | `#viewport` (tabindex 0) → `#world` → `svg#edges` (8000×8000, markers `secondary-support-arrow`, `secondary-oppose-arrow`, `g#edgePaths`) + `#nodesLayer` (role=tree) | Pan by dragging the background, wheel/pinch zoom, keyboard camera. |
| Card delete (new app only) | `.node-header .node-delete` × at the card's right edge, every card but the root; `#nodeGhosts` beside `#nodesLayer` | Owner decision 2026-11-09 (S-15): title `deleteNode` Poista solmu / `deleteSubtree` Poista alipuu (Del). Muted until the card is hovered, focused or selected; red under the pointer. A leaf is deleted without a confirm (× and Del alike), a node with children still asks (`deleteSubtreeConfirm`); the removed cards leave a copy in `#nodeGhosts` that fades out in 1 s (none with reduced motion) and is dropped at once if undo restores the card. |
| Keyboard status | `#keyboardStatus` (aria-live, visually hidden) | Announces keyboard navigation. |
| Zoom controls | `.zoom-controls`: `#zoomOut` −, `#zoomLabel` "100 %", `#zoomIn` +, `#zoomReset` ⤢ (Sovita) | — |
| Legend | `.legend`: `supportWord` Puoltaa, `opposeWord` Vastustaa, `optionType` VAIHTOEHTO, `#linkLegend` `secondaryLinks` Yhteydet (shown when the links layer is on) | — |

### S-07.1 View dock (`#viewDock`, Näkymäasetukset)

Floating panel anchored next to its toolbar trigger; draggable by `#dockMove` ⠿ (title `dockMove` Siirrä näkymäasetuksia), `#btnDockCollapse` − (`dockCollapse` Pienennä paneeli), `#btnDockClose` × (`dockClose` Sulje näkymäasetukset). Position persisted per browser (UX-B03).

- **NÄKYMÄKERROKSET** (`layers`): `#viewPreset` `viewScope` with `compactView` Tiivis / `analysis` Analyysi / `allDetails` Kaikki tiedot / `custom` Omat valinnat; `#btnLayers` `customize` Säädä toggles `#layersPanel`.
- `#layersPanel` (help `layersHelp` Väitteen teksti näkyy aina. Valitse sen ympärille haluamasi lisätiedot.): checkboxes (the new app drops the prototype's `confidence` Uskottavuusarvio and `impact` Vaikutuspaino and `#dragFromText`, S-15) `data-layer=labels` `layerLabels` Otsikkorivi ja argumenttityyppi · `details` `layerDetails` Perustelut / muistiinpanot · `index` `layerIndex` Perustelusaldo · `assessments` `layerAssessments` Arviot tiiviisti (75%/+5) · `comments` `layerComments` Kommentit · `counts` `layerCounts` Alisolmujen määrä · `links` `layerLinks` Lisäyhteydet; plus `#showSharedReasons` `sharedShowInTree` Näytä toistuvat perustelut myös puussa. Changing a checkbox switches the preset to Omat valinnat.
- **Puun suunta** (`orientation`): `#orientationSelect` `leftRight` → Vasemmalta oikealle / `topDown` ↓ Ylhäältä alas / `fourDirections` ✣ Neljä suuntaa; `#btnLayout` `arrange` Järjestä puu; `#btnFit` `fit` Sovita näkymään; `#btnCompactTree` `compactVisibleTree` Tiivistä näkyvä puu (aria-pressed); `#btnCollapseOptions` `collapseAllOptions` Näytä vain vaihtoehdot (Alt+Shift+O).
- **Avaa puuta tasoittain** (`treeDepthLabel`): `#treeDepthSlider` (0…max depth), `#treeDepthValue` output ("Omat avaukset" when per-branch state is in effect), extremes `treeDepthRoot` Vain juuri / `treeDepthAll` Kaikki lehdet, `#btnDepthReset` `treeDepthReset` Palauta omat avaukset.
- **HAARAN KOROSTUS** (`focusHeading`): segments `#focusAll` `all` Kaikki / `#focusSupport` `focusSupport` + Puoltavat / `#focusOppose` `focusOppose` − Vastustavat; `#btnFocusAnchor` `selectedBranch` ◎ Valittu haara + `#focusAnchorText` ("Koko puu" when unanchored); `#focusSummary` status text.

## S-08 Inspector (`aside.inspector-panel`, `#inspector`)

Heading: eyebrow `selectedNode` VALITTU SOLMU, h2 `editArgument` Muokkaa argumenttia. Body is rendered per selected node; the full field list per node kind, stage and viewpoint is in S-08.1 (dynamic). Observed top-to-bottom order for a reason node in Punnitse: relation pill ("PUOLTAA · Paino koskee vaikutusta vanhempaan"), `Liitä myös muihin solmuihin…` (primary), Väite / otsikko (textarea), Perustelut, lähteet ja huomiot (textarea), Alustava suhde vanhempaan (select), Vanhempi (siirrä alipuuta) (select), "Arvioinnin mukaan: Puoltava (+3.7/5)" info box, Arviointiasetukset (Käyttäjänä: …), Oma uskottavuusarvio slider with %, Oma vaikutusarvio slider, "Arviot henkilöittäin · n / m" details, balance block (+47.5 † Perustelutulos −100…+100 · 0 neutraali; Uskottavuuden perusarvio; Arvioijan perustelutulos; Aliperustelujen nettovaikutus; contribution list), Väitteen luonne, lähteet ja tekijätiedot (details), Kommentit (list, textarea placeholder "Kysymys, huomio tai tarkennus (ei automaattisesti argumentti)", + Lisää kommentti). In Kartoita the review sliders and balance block are replaced by the note "Uskottavuus ja vaikutus arvioidaan Punnitse-tilassa" with a `Punnitse` button. Decision root shows "Arvostusten vaikutus vaihtoehtoihin" matrix and a `Päätösäänestys` button; an option shows "Vaihtoehdon arvostukset" with per-value rows.

## S-09 Bottom zone (`#bottomZone`, Alt+4, hidden by default)

`structureTitle` Rakenne + `#bottomSelectedNode`; buttons `#btnBottomSupport` + Puoltava, `#btnBottomOppose` − Vastustava, `#btnBottomNeutral` Neutraali, `#btnBottomMove` Siirrä alipuu, `#btnBottomDelete` Poista alipuu.

## S-10 Footer (`footer.app-footer`)

`WITT <version>` · `footerFriendly` Tallentuu selaimeesi · Ei kirjautumista · Perustelutulos ei ole totuuden todennäköisyys. · `#btnHelp` `help` Miten tätä käytetään? (opens Help dialog).

## S-11 Dialogs and overlays

All dialogs are native `<dialog>` elements with a `.dialog-inner`, a heading row with an × close button (`close` Sulje), Escape closes, focus returns to the trigger.

1. **Shared (locked) reasons** `#sharedReasonsDialog` — `sharedTitle` Käytä perustelua uudelleen; mode nav `reuseModesLabel` with `#btnReuseContextFromShared` `reuseIndependent` Arviot erikseen (suositus) and the active `reuseLocked` Sama lukittu arvio; intro `sharedIntro`, example `reuseLockedExample`; `#sharedTarget`; "1. `reuseNewHeading`" form `#sharedCreateForm` (`sharedName` Perustelun teksti, `sharedProb`, `sharedImpact`, submit `sharedCreate` Tallenna lukittu perustelu); "2. `reuseExistingHeading`" `#sharedReasonsList`; warning `sharedNotice`; `#btnSharedDone`.
2. **Context (independent) reasons** `#contextReasonsDialog` — `contextTitle`; mode nav with active `reuseIndependent` and `#btnReuseLockedFromContext`; intro `contextIntro`, example `reuseIndependentExample`; `#contextTarget`; form `#contextCreateForm` (`contextName` Perustekäsite, `contextKind` Perusteen luonne select fact/assumption/value, `contextCreate` Tallenna perustelu); `#contextReasonsList`; note `contextNotice`; `#btnContextDone`.
3. **Secondary links** `#linkDialog` — eyebrow `linkPreviewLabel` AIEMMAN MALLIN YHTEYDET, title `secondaryLinks` Lisäyhteydet, `#linkClose` `closeLinkDialog`; `#linkSourceTitle`; warning `linkScoreNotice`; form: `#linkTarget` (`linkTargetLabel` Mihin väitteeseen tämä vaikuttaa?), `#linkImpact` range −5…+5 step 0.5 default +3 with `#linkImpactValue` and axis labels `linkAxisOpposes` / `linkAxisNeutral` / `linkAxisSupports`, `#linkAdd` `addLink` + Lisää yhteys; `existingLinksHeading` + `#existingLinks`.
4. **Visual export** `#visualExportDialog` — `exportVisualTitle` Vie puu kuvaksi tai PDF:ksi; help `exportVisualHelp`; `#exportFormat` PNG/SVG/PDF; `#exportScope` `exportVisible` Nykyinen puunäkymä / `exportWhole` Koko puu (myös suljetut haarat); `#exportDetail` `exportCurrent` Nykyiset näkymäkerrokset / Tiivis / Analyysi / Kaikki tiedot; `#exportPalette` `exportLight` Vaalea, tulostukseen / `exportDark` Tumma; toggles `#exportHighlights` `importantHighlight`, `#exportLinks` `layerLinks` Lisäyhteydet (katkoviivat), `#exportShared` `sharedShowInTree`, `#exportCompact` `exportCompactVisible`; PNG options `#exportResolution` 1×/2×/3× (default 2×), `#exportPngMode` `exportPngAuto` / `exportPngTiles`, estimate `#exportPngEstimate` ("1816 × 3044 px · 5.5 MP · raakamuisti vähintään 23 Mt · Yritetään yhtä PNG:tä"), hint `exportPngTileHint`; PDF options `#exportPdfLayout` `exportPdfPages` / `exportPdfPortrait` / `exportPdfLandscape` / `exportPdfFit`; `#exportVisualStatus`; `#btnExportCancel`, `#btnExportDownload` `exportDownload` Lataa tiedosto.
5. **Examples** `#examplesDialog` — `examplesTitle` Harjoitusesimerkit; intro `examplesIntro` Valitse kuvitteellinen kolmen arvioijan keskustelu…; `#exampleCards`.
6. **Review lens** `#reviewLensDialog` — `reviewLens` Käyttäjien arvioiden näkyminen; help `reviewLensHelp`; `#btnLensAll` `lensAll` Kaikki / `#btnLensCurrent` `lensCurrent` Vain nykyinen; `#lensPeople` checkboxes per person; `#lensInsights` "Suurimmat arvioerot" with per-claim credence and influence spreads and the 0 / ≠ / ± legend; `#btnLensDone` Valmis.
7. **Tutorial panel** `#tutorialPanel` (aside, draggable by `#tutorialMove` ⠿ with `#tutorialProgress`, `#tutorialClose`) — `#tutorialHeading`, `#tutorialText`, `#tutorialTarget` `tutorialShowTarget` Näytä kohde, `#tutorialNext` `tutorialSkip` Ohita vaihe. Steps in S-11.7a (dynamic).
8. **Node context menu** `#nodeContextMenu` (role=menu; right click or Shift+F10) — Muokkaa tekstiä (F2), + Puoltava (+), − Vastainen (−), 0 Neutraali, Sulje alipuu (Välilyönti), Järjestä puu (Alt+A); decision additions in S-07.2.
9. **Assessment round** `#assessmentDialog` — eyebrow `assessmentEyebrow` GRACE · ARVIOINTI, `assessmentTitle` Arvioi yksi väite kerrallaan; `#assessmentProfile` "Käyttäjänä: …", `#assessmentNotYet`, intro `assessmentIntro`; `#assessmentStep` "Kohta 1/11" + `#assessmentReviewed` "Arvioitu 0/11", `<progress>`; question: `#assessmentContext` ("Pääväite – ei suhdetta vanhempaan" or the parent claim), `#assessmentClaim`, `#assessmentDetails`; credence field (`assessmentCredenceAxis`, `assessmentCredence` question, range + number + "/ 100"); impact field (`assessmentImpactAxis`, `#assessmentInfluenceLabel`, reflection `assessmentImpactReflectSimple`, range with output, edge labels `assessmentOppose` / `assessmentNeutral` / `assessmentSupport`); `#assessmentReviewedMarker` "Tätä kohtaa ei ole vielä merkitty arvioiduksi."; finish block `#assessmentFinish` with `#btnAssessUnreviewed` `assessmentContinue`; bottom `#btnAssessRestart` `assessmentRestart` Aloita uusi kierros, `#btnAssessPrev` `assessmentPrevious`, `#btnAssessSkip` `assessmentSkip`, `#btnAssessNext` `assessmentSaveNext` Tallenna ja seuraava →.
10. **Move subtree** `#moveNodeDialog` — `moveSubtree`; `moveTarget` Uusi vanhempi `#moveTargetSelect` (valid targets only); `#btnMoveCancel`, `#btnMoveConfirm` `confirmMove` Siirrä.
11. **New work** `#newWorkDialog` — `newWorkTitle` Uusi työ; intro `newWorkIntro`; `#btnNewWorkArgument` `newBlankArgument` Tyhjä argumenttipuu, `#btnNewWorkDecision` `newBlankDecision` Tyhjä päätöspuu, `#btnAIDraft` `newWithAI` (primary); note `newWorkNoSend`.
12. **AI draft** `#aiDialog` — `draftTitle` Luo uusi argumentti- tai päätöspuu kielimallilla; intro `draftIntro`; flow tabs `#btnAIFlowPrompt` `aiDraftStepRequest` 1. Luo tehtävä AI:lle / `#btnAIFlowImport` `aiDraftStepImport` 2. Avaa AI:n vastaus. Step 1: help `aiDraftStepHelp`; `#aiMode` `draftMode` Puun tyyppi; `#aiTopic` `aiTopicLabel` (placeholder `aiTopicPlaceholder`); `#aiContext` `draftContext` (placeholder `draftContextPlaceholder`); hint `aiTaskChoiceHint`; `#btnAICopy` `aiTaskCopy` Kopioi AI-tehtävä / `#btnAIDownloadPrompt` `aiTaskDownloadSame` Lataa sama tehtävä (TXT); `#aiDraftTaskStatus`; details `aiTaskPreview` Katso AI-tehtävän koko sisältö → `#aiPromptPreview`; details `aiTaskAdvanced` → `aiTaskSchemaIncluded` + `#btnAIDownloadSchema` `aiTaskDownloadSchema`; `#btnAIToImport`. Step 2: help `aiDraftImportHelp`; `#aiDraftPaste` `draftResponsePaste`; `#btnAIImport` `draftChooseFile`, `#btnAIShowPreview` `previewChanges` Esikatsele ennen hyväksyntää; `#aiStatus`; `#btnAIToPrompt` `aiBackToPrompt`.
13. **AI draft preview** `#aiDraftPreviewDialog` — `draftPreviewTitle` Tarkista AI:n luoma uusi työ; `#aiDraftPreview` lines; toggles `#draftIncludeRatings` `includeRatings`, `#draftIncludeComments` `includeComments`, `#draftIncludeShared` `includeShared`; caution `draftRatingNotice`; `#btnDraftApply` `draftOpen` Avaa uusi työ, `#btnDraftCancel`.
14. **About** `#aboutDialog` — `aboutTitle` WITT ja GRACE-menetelmä; the two acronyms spelled out; `aboutPurpose`; slogan; `#btnAboutDone`.
15. **Vote** `#voteDialog` — `votingButton` Päätösäänestys; warning `voteLocalWarning`; `#voteRoundStatus` ("Äänestys ei ole vielä alkanut"); settings `#voteWeighting` (`voteEqual` Yksi ääni per osallistuja / `voteShares` Henkilökohtainen äänimäärä), `#voteHideResults` `voteHideResults` (default on), `#voteAnonymous` `voteAnonymous`; hint `voteWeightsHint`; `#btnVotePeople` Käyttäjät, `#btnVoteStart` `voteStart` Aloita äänestyskierros, `#btnVoteEnd` `voteEnd` Sulje kierros ja näytä tulokset; `voteBallots` Omat kannatusäänet + `#voteBallotList` (0–100 slider per option; before a round: "Aloita kierros ja valitse sen jälkeen arvioijaprofiili äänestämistä varten." and each option with "Arviointivaiheen perustelutulos: +20.0 †"); `voteResults` Tulokset ja laskenta + `#voteResults`; details `voteAudit` Äänestystapahtumien kirjaus `#voteAuditRows`; details `voteHistoryTitle` Aiemmat äänestyskierrokset `#voteHistoryRows`; `#btnVoteDone`.
16. **People** `#peopleDialog` — `profileManage` Käyttäjät; privacy text `profilePrivacy`; `#currentUserName` `userRenameCurrent` Oma käyttäjänimi + help `userRenameHelp`; `#assessmentWeighting` `assessmentWeightingLabel` Yhteisen arviointituloksen laskenta (`assessmentWeightStructural` Rakenteellinen (aiempi laskenta) / `assessmentWeightEqual` Arvioijien arviot, sama paino kaikilla / `assessmentWeightShares` Arvioijien arviot, henkilökohtaiset äänimäärät) + hint `assessmentWeightHint`; `#peopleList` rows: Nimi input, Äänimäärä number, "11 uskottavuus · 10 vaikutus" review counts, `Valittuna` (disabled, current) / `Vaihda tähän` and `Poista`; `#btnAddPerson` `profileAdd` + Lisää käyttäjä; `#btnDialogClose` Sulje.
17. **Help** `#helpDialog` — `helpTitle` WITT – pikaohje; paragraphs `helpMethod`, `helpTree`, `helpComments`, `assessmentHelpMain`, `helpIndex`, `helpLocal`; section `shortcutTitle` Näppäimistökäyttö with `shortcutNavigation`, `canvasKeyboardHelp`, `shortcutNavHorizontal`, `shortcutNavVertical`, `shortcutNavFourWay`, `shortcutNavToggle`, `shortcutEditing`, `shortcutAdding`, `#shortcutCurrentAdd`, `shortcutContext`, `shortcutOther`, `shortcutTable`; `.shortcut-settings` `shortcutCustomize` Muokattavat pikanäppäimet, help `shortcutCustomizeHelp`, `#shortcutSettings` grid, `#btnShortcutsReset` `shortcutReset`, `#shortcutSettingsStatus`; `helpP2P`; `#btnHelpClose`.
18. **Confirm** `#confirmDialog` — `confirmationTitle` Vahvista toiminto, `#confirmText`, `#confirmCancel`, `#confirmAccept` Jatka.
19. **Notice** `#noticeDialog` — `noticeTitle` Ilmoitus, `#noticeText`, `#noticeClose`.
20. **Import report** `#importReportDialog` — `importValidationTitle` JSON-tuonnin tarkistus; `#importReportSummary`; `#importReportIssues` list; note `importValidationNote`; `#importReportStatus`; `#btnImportReportCopy` `importValidationCopy` Kopioi korjausraportti, `#btnImportReportDownload` `importValidationDownload` Lataa raportti .txt, `#btnImportReportClose`.
21. **Replace** `#replaceDialog` — `replaceTitle` Mitä tehdään nykyiselle työlle?; section `replaceCurrentLabel` Nykyinen työ with `#replaceCurrentName`, `#replaceCurrentInfo` (mode and node count), `replaceEditedLabel` Viimeksi muokattu `#replaceEditedAt`, `replaceAutosaveLabel` Automaattitallennus selaimeen `#replaceAutosavedAt`; `replaceNextAction` Seuraava toiminto + `#replaceDescription`; note `replaceReminder`; `#replaceCancel`, `#replaceForget` `replaceForget` Hylkää nykyinen ja jatka, `#replaceKeep` `replaceKeep` Tallenna kirjastoon ja jatka (primary).
22. **Text prompt** `#textDialog` — `textDialogGeneric` Anna nimi, `#textPrompt`, `#textValue` (maxlength 120), `#textCancel`, `#textAccept` `confirmContinue`.
23. **Document library** `#libraryDialog` — `documentLibrary` Asiakirjakirjasto; disclaimer `libraryDisclaimer` (IndexedDB, not a backup); `#libraryStatus`; `#btnLibrarySaveCurrent` `librarySaveCurrent` Tallenna nykyinen kirjastoon, `#btnLibraryBackup` `libraryBackup` Vie kaikki JSONina, `#btnLibraryRestore` `libraryRestore` Tuo varmuuskopio, `#btnLibraryRefresh` `libraryRefresh` Päivitä, `#btnLibraryClose`; `#libraryList` cards.
24. **Contribution (AI review)** `#aiReviewDialog` — `contributionTitle` Tuo tai vie muutoksia ja arviointeja; intro `contributionIntro`; explainer `aiProposalExplainer`; step 1 details `aiProposalStep1` (open): `#aiReviewMode` `contributionTask` (`contributionExtend` Täydennä puuta ja ehdota korjauksia / `contributionAssess` Tee vain oma arviointikierros), hint, `#btnAIReviewCopy`, `#btnAIReviewExport` (TXT), `#aiReviewTaskStatus`, preview details `#aiReviewPromptPreview`, advanced `#btnAIReviewSchema`; step 2 `aiProposalStep2`: `#aiReviewPaste` `contributionPaste`, `#btnAIReviewUpload` `contributionChooseFile`, `#btnAIReviewImport` `previewChanges`, `#btnAIReviewClose`, `#aiReviewStatus`; step 3 `aiProposalStep3` Vie käyttäjien muutokset ja arviot: help `contributionMultiExportHelp`, `#contributionExporterList` participant checkboxes, note `contributionNameHelp`, `#btnContributionEditUsers` `contributionEditUsers`, `#btnWITTExport` `contributionHumanExport` Valitse alkuperäinen JSON ja vie valittujen muutokset, `#contributionExportStatus`.
25. **AI results** `#aiResultsDialog` — `aiAssessmentsTitle` AI:n arviot ja päätösvaihtoehdot; `aiReviewIsolation`; `#aiResultsAssessorSelect` `aiReviewerLabel`; `#aiResultsCounts`; `#aiResultsEmpty` `aiNoImportedRatings`; `aiOptionRankingTitle` + `#aiResultsRanking`; `#aiResultsRankingHint`; `#aiResultsHighlight` `highlightTopOptions`; `#btnAIResultsShow` `aiShowInTree` Näytä AI:n näkökulma puussa, `#btnAIResultsClose`.
26. **Contribution preview** `#aiReviewPreviewDialog` — `contributionPreviewTitle` Valitse hyväksyttävät muutokset; single source block `#proposalSingleSource` (`#proposalSourceKind` `contributionHuman` / `contributionAI`, `#proposalSourceName` `contributionUsername`, note `contributionSourceNote`); `#proposalGroupSources` for multi-user bundles; fieldset `contributionSelect` with `#proposalClaims` `contributionClaims` Uudet solmut, `#proposalEdits` `contributionEdits`, `#proposalLinks` `contributionLinks`, `#proposalSharedReasons` `contributionShared`, `#proposalAssessments` `includeRatings`, `#proposalComments` `includeComments`; `#proposalItemChoices` per-item; `#aiReviewPreview` lines; caution `contributionWarning`; `#btnAIReviewApply` `aiReviewApply` Hyväksy ehdotukset, `#btnAIReviewReject`.
27. **Claim preview tooltip** `#claimPreview` (role=tooltip) — `#claimPreviewText` full title, `#claimPreviewContext` "Vanhempi (siirrä alipuuta): …"; shown on outline hover and keyboard focus.

## S-12 Persisted browser state

Every key the prototype reads or writes (`localStorage` unless noted; an in-memory map replaces it when storage is blocked, and the status then reads "Vain väliaikainen istunto"). No `sessionStorage` is used.

| Key | Scope | Shape |
| --- | --- | --- |
| `witt-project-v3` | per browser, the one active document | the whole project JSON (schema v8) |
| `witt-workspace-meta-v1` | per browser | `{active:{id,title,savedAt}, lastOpenedJson?:{filename,projectId,at}, lastExportedJson?:{filename,projectId,at}}` |
| `witt-view-v1` | per browser (not per document) | `{presentation, orientation, workflow, layers{labels,details,index,assessments,comments,counts,links} (the prototype also writes `confidence`, `impact`; the new app reads either as `assessments`), focus{mode,anchorId}, dockCollapsed, dockHidden, dockScreenPosition, indexMode, viewAssessorId, highlightOptions, showImportance, showSharedReasons, showRecurringInTree, compactVisible (the prototype also writes `dragFromText`), depthLimit, depthCompact}`; defaults: presentation `table` when the window is ≤ 600 px else `tree`, orientation horizontal, workflow explore, layers = Tiivis preset, dock hidden and collapsed, index shared, showRecurringInTree/depthCompact true |
| `witt-zones-v1` | per browser | `{left,top,right,bottom}`; defaults left = window > 1000 px, top and right true, bottom false |
| `witt-appearance-v1` | per browser | one of the special skins `cosmos`, `hologram`, `manuscript-book`, `manuscript-pen`, `bitberg`, `terminal`, `ascii`, `comic`; absent when a base theme is chosen (the base theme `light`/`dark`/`paper` is document data in `project.theme`); legacy `studio-daw` reads as `bitberg` |
| `witt-locale-v1` | per browser | language code |
| `witt-keybindings-v1` | per browser | `{support,oppose,option,table,focus,assessment,help,arrange}` from the fixed choice list, all distinct; defaults `+ - * T F R ? Alt+A` |
| `witt-assessor-v1:<projectId>` | per document | the active actor's user id |
| `witt-review-view-v1:<projectId>` | per document | `null` (every human) or an array of user ids (the review lens) |
| `witt-assessment-pass-v2:<projectId>:<actorId>` | per document and actor | `{cursorId, doneIds[], fingerprints{id→string}}`; stale entries dropped on load |
| IndexedDB `witt-document-library` / store `documents` / v1 | per browser | `{id,title,updatedAt,savedAt,nodeCount,revision,document}`; written only by explicit library actions, never by autosave |

Session-only (never stored): "Vain puu" focus mode, the open left tab, the selected library card, depth overrides, explicitly closed branches, the table reveal, the tutorial, the camera, the selection.

## S-13 File formats and flows

`.witt.json` v8 (project), `.peruste.json` legacy v2 (upgraded on open), `witt-ai-draft-v2` (AI reply for a new tree), `witt-contribution-v2` (proposal / multi-user bundle), library backup JSON, AI task TXT, JSON schema downloads, PNG/ZIP/SVG/PDF exports. Shapes and prompt templates are pinned in `IDENTITY_AI_AND_VOTING.md` and the fixtures under `tests/golden/` once lifted from the prototype (pending in this revision).

## S-14 Themes and responsive layout

Eight themes (S-00). Desktop grid: top bar, toolbar, left panel / canvas / inspector, optional bottom zone, footer. 390 px: panels stack, toolbar wraps, canvas keeps a usable height, dock limited to the viewport. Exact tokens and breakpoints pending from the `inv-styles` report.

## S-15 Prototype defects the owner may choose not to replicate

Recorded here so they are decided, not inherited silently. Each needs an owner decision and a `CHANGELOG.md` line before the new app deviates.

Decided deviations:

- 2026-11-09 (owner): the `bitberg` theme is labelled “◆ Yövärit” (en “◆ Night colours”, nine languages) instead of the prototype’s “Bitberg”, with a glyph like the other themes. The theme id `bitberg`, the `witt-appearance-v1` value and the stylesheet are unchanged, so stored preferences keep working.
- 2026-11-09 (owner): undo ↶ and redo ↷ are always visible in the top bar (`#btnUndoTop`, `#btnRedoTop`, styled like the zone toggles). The prototype hides them in the Edit menu and the tree-only quick bar, and the owner could not find them.
- 2026-11-09 (owner): a ? button in the top bar (`#btnHelpTop`) opens the help and shortcuts dialog, which the prototype offers only in the Apua menu, by the `?` key and in the tree-only quick bar.
- 2026-11-09 (owner): cards get a × delete button apart from + − ▾; deleting a leaf no longer asks (undo restores it); deleted cards fade out for a second so a slip is seen. The prototype deletes only from menus, the bottom bar and the Del key, and always asks.
- 2026-11-09 (owner): three more per-browser skins after Yövärit: `terminal` ▮ Terminaali (green phosphor on black, monospace, scanlines, glow, amber for opposing, a blinking cursor on the selected card), `ascii` # ASCII (plain text on paper; cards boxed in `+ - |`, the selected one in `# =`, buttons and chips in `[ ]`, tree edges drawn as characters `- + > v ^` by `AsciiEdge.tsx` instead of curves), `comic` ✎ Sarjakuva (xkcd-like: black ink on white, hand-drawn box corners, edges wobbled by the `#wittSketch` SVG filter, the bundled Comic Neue font under SIL OFL 1.1). Stored in `witt-appearance-v1` like the other skins; visual export uses the dark palette for `terminal`, light for the others.
- 2026-11-09 (owner): the separate card layers `confidence` Uskottavuusarvio and `impact` Vaikutuspaino are removed; they repeated the compact pair `assessments` Arviot tiiviisti (75%/+5), which the Kaikki tiedot preset now shows instead. A saved view with either one on opens with the compact pair. The visual export keeps the prototype's nine-layer shape with both off.
- 2026-11-09 (owner): the `#dragFromText` option is removed; a card can always be dragged by its text as well as by its header (the prototype's default).
- 2026-11-09 (owner): an inspector slider with no saved assessment of the person's own (`#nodeConfidence`, `#nodeImpact`) is greyed (`.range-unset`) and reads "—" instead of the document's starting value, which the scores do not use. Pressing or moving it saves it, even at the shown value; saving either slider also saves the other one as shown when the person has none yet (a stale impact still asks to be reassessed). The assessment round dialog is unchanged: it saves both axes by its own button.
- 2026-11-09 (owner): in a decision, a reason directly under an option is rated as its *significance for the option*: the inspector slider reads `profileSignificance` Oma arvio merkityksestä vaihtoehdolle (−5…+5), the kicker `significanceNote`, and the assessment round's axis and reflection `assessmentSignificanceAxis` / `assessmentSignificanceReflect` (one number for direction, strength and how much the matter weighs for the assessor). Every other relation reads `assessmentInfluenceAxis` Vaikutus vanhempaan (−5…+5) in the round instead of the prototype's "Vaikutus / merkitys". Same number, same maths (`ratesSignificance` in `src/app/derive.ts`).
- 2026-11-09 (owner): a ninth rebindable shortcut `value` (default `,`; `,` and `.` join the choices) adds a value judgment under the selected card in one step (`node.add` with `semanticType: 'value'`), label `valueAdd` Lisää arvostus.
- 2026-11-09 (owner): a node's own type name. The inspector field `#nodeTypeLabel` `typeLabelField` Oma tyyppinimi (datalist `typeLabelPresets`, help `typeLabelHelp`, max 40) writes `node.typeLabel`; on the root, an option or a group it replaces the card tag (`relationLabel`, also in the outline, table and export), on a reason it shows as `.node-type-label` on its own line above the title (the header has no room) and the `.node-semantic` chip is left out; long names end in an ellipsis with the full name as the tooltip. Presets: Tosiasia, Kriteeri, Tavoite, Arvo, Periaate, Huomio. A new sibling option, group or value copies it. The document field and the import schema gain `typeLabel`.
- 2026-11-09 (owner): two more examples after the prototype's five, built by `scripts/build-recruitment-examples.ts`: `rekry-yksi` (one candidate, criteria as claims in argument mode) and `rekry-kolme` (three candidates as options, the criteria as repeated reasons); manifest in `src/app/examples.ts`.

- Inspector "Arvioinnin mukaan": Puoltava (+3.6666666666666665/5)" prints an unrounded float; the table shows the same value as "+3.7 (3)". Proposed: one decimal everywhere. (Reproduced as is for now.)
- The quick-control bar's `↹ Järjestä puu` and `↶ Kumoa` glyphs are lost once the catalog text replaces the button label; the new app shows the catalog text, as the prototype does after localisation.
- `edge-group` has no stroke rule in the stylesheet, so an edge into an option group is invisible; `.shared-node-mark`, `.meta-links` and `.node-add.group` have no rules either. Reproduced through the shared stylesheet.
- The prototype's `#keyboardStatus` live region is never written. Reproduced (empty).
- Alt+V does not close the dock while its first control holds focus (the dock focuses `#viewPreset` on open); a click elsewhere first is needed in both apps.
