# WITT – user guide

This guide describes the new app as it is now. The app reproduces the frozen prototype's interface (dev32, at `proto/`) region by region; the prototype's visible UI is the contract (`docs/spec/UI_INVENTORY.md`). The three AI dialogs (new tree with AI, change proposal, AI assessments) and the JSON import check are being built; they are described here as the contract says they work. The interface is Finnish-first: Finnish labels are given in *italics*, with the English meaning where it helps. Switch the language to English in the top bar to see the English labels.

## 1. What WITT is

WITT (Web Interactive Thinking Tool) is a browser tool for the GRACE method (Günther's Reflective Argumentation & Collaborative Evaluation). You draw an argument tree under a main claim (*Argumentointi*, argument mode) or compare decision options under a decision question (*Päätös*, decision mode). Work moves through stages (*TYÖVAIHE*): *Kartoita* (map: bring claims, options and reasons into view), *Punnitse* (weigh: rate credence and influence separately) and, in decision mode, *Päätösäänestys* (decision ballot).

Each person rates each reason on exactly two axes:

- **Credence** 0–100 %: how likely the reason holds, or the outcome it describes happens.
- **Influence** −5…+5 in half steps: how strongly and in which direction the reason bears on its immediate parent. Plus supports, minus opposes, 0 is neutral.

There is no third axis (general importance or utility), and there will not be one.

From these the **argument balance −100…+100** (*Perustelutulos*) is computed, 0 being neutral. In words: each child contributes 10 × its rated influence × its own recursively computed strength / 100 to its parent; effects propagate from the leaves upwards and the result is clamped to −100…+100. One fully credible +5 support gives +50, two independent ones +100, one −5 objection −50. An objection to an objection supports the original claim, because a rating always concerns the relation to the immediate parent. A decision option starts at 0. The balance is an explanatory diagnostic: not a probability, not a ballot result, not a recommendation.

**Missing is not zero.** An unrated item shows a dash (`—`), never the number 0. When some relations behind a result are missing or stale, the result carries **†** (incomplete). The compact card notation `75%/+5` means credence 75 % and influence +5; either half may be `—`.

## 2. Starting

The **home screen** (*Aloitussivu*) always opens first (and from the ⌂ button in the top bar). It has the language and theme selects, *Tietoa menetelmästä* (about the method and the acronyms) and these actions:

- *Jatka edellistä työtä* (continue) – shown when the browser holds a readable save; opens it in the workspace.
- *+ Luo uusi asiakirja* (new document) – opens *Uusi työ*: *Tyhjä argumenttipuu* (blank argument tree), *Tyhjä päätöspuu* (blank decision tree) or *Luo uusi puu AI:n avulla* (new tree with AI). With work open, starting anew asks first and replaces the current work.
- *Avaa tiedosto* (open file) – opens a `.witt.json` (section 7).
- *Kokeile esimerkkiä* (try an example) – *Harjoitusesimerkit*: five fictional three-assessor discussions plus two recruitment examples, *Sopiiko kandidaatti K?* (criteria as claims under the main claim; a criterion's influence on it is its weight) and *Kolme kandidaattia* (candidates as options, the same criteria as repeated reasons under each); they also show the current model's limit: a criterion below neutral (e.g. −16.7) still adds a little, since a reason's strength is 0…1 (weight management, remote and office work, choosing a cloud platform and others). An example opens under a fresh id, so it never overwrites a library copy; a multi-assessor example opens straight in *Punnitse*.
- *Opastettu harjoitus* (guided practice) – a seven-step exercise on a fresh document (below).
- *Muut toiminnot* (more) – *Asiakirjakirjasto* (document library), *Luo uusi puu AI:n avulla*, *AI:n tai toisen käyttäjän muutosehdotus* (proposal from an AI or another user).

The card *Jatka keskeneräistä asiakirjaa* shows the current work's title and three times: latest browser save, last opened JSON, latest JSON export ("Tarkka aika ei tiedossa" / "Ei vielä tietoa" when unknown). A browser save that cannot be read is reported and left untouched. When the browser blocks storage, the work lives only in the open session and the screen says so.

**Autosave.** Every change is saved to the browser at once (the File menu status reads *Tallennettu selaimeen*; *Vain tällä laitteella* when nothing is saved yet or storage is not persistent; *Selaintallennus epäonnistui – vie JSON-tiedosto* when a save fails). Browser storage is per device and browser and is not a backup.

**The replace dialog** *Mitä tehdään nykyiselle työlle?* ("what to do with the current work?") appears whenever you open a file, an example, a library document or the practice while work is open. It shows the current work's title, mode and node count, the last-edited and browser-autosave times and the next action. Choices: *Peruuta* (cancel), *Hylkää nykyinen ja jatka* (discard and continue) or *Tallenna kirjastoon ja jatka* (save to the library, then continue – only if the save succeeded).

**The document library** (*Asiakirjakirjasto*, File menu or the home screen's *Muut toiminnot*) keeps several documents in the browser's database (IndexedDB). It is written only on purpose: *Tallenna nykyinen kirjastoon* (save current). Each entry has *Avaa* (open), *Nimeä uudelleen* (rename), *Kopioi* (duplicate) and *Poista* (delete; not for the open one). *Vie kaikki JSONina* downloads the whole library as `witt-library-backup.json`; *Tuo varmuuskopio* restores one without overwriting anything (colliding ids become copies); *Päivitä* refreshes the list. Clearing site data deletes the library – keep `.witt.json` exports of important work.

**Guided practice** (home screen or Help → *Opastettu harjoitus*) creates a practice document and a movable panel ⠿ (*Harjoitellaan yhdessä*, step 1/7). Steps: add a supporting reason, write it, add an objection, write it, switch to *Punnitse* and rate, open the table, arrange a deliberately messy tree. The panel advances by itself when a step is done; *Näytä kohde* (show target) performs or focuses the step, *Ohita vaihe* skips, × closes.

## 3. Mapping

The workspace has the top bar (document title, ↶ undo and ↷ redo, four panel toggles, ? help and shortcuts, language, theme), the toolbar (*Argumentointi*/*Päätös*, *TYÖVAIHE* *Kartoita*/*Punnitse*, the person select, *Puu*/*Taulukko*, *Näkymäasetukset* and the menus *Tiedosto*, *Muokkaa*, *Arviointi*, *Näkymä*, *Apua* = File, Edit, Assessment, View, Help), the left panel (tabs *Puurakenne* = outline and *Yhteydet ja perustelut* = connections and reasons, plus *LISÄÄ VALITTUUN SOLMUUN* = add to selected node), the tree as cards in the centre and on the right *VALITTU SOLMU* / *Muokkaa argumenttia* (the inspector). The bottom bar *Rakenne* (`Alt+4`) is hidden by default.

**Cards.** Each node is a card: a relation tag (PÄÄVÄITE main claim, PUOLTAA supports, VASTUSTAA opposes, VAIHTOEHTO option, PÄÄTÖS decision), the title, and in *Punnitse* the balance and `75%/+5`. The card header has **+** (supporting), **−** (opposing), in decision mode on the root and on groups **\*** (option) and **▦** (option group), and **▾/▸** (collapse or expand the subtree). At the right edge **×** deletes the node; it shows when the card is selected or under the pointer. A node without children goes without a question (× or `Del`) and fades out over a second; a subtree asks first. Undo (↶ or `Ctrl/Cmd+Z`) brings it back. Click a card to select it.

**Adding** goes to the selected node: the card's +/−, the left panel's *+ Puoltava*, *− Vastainen* and *0* (neutral), the Edit menu, the bottom bar, or the keys `+` and `−`. The new card opens for typing at once.

**Inline editing.** `F2` or `Enter` on the selected card, a double click, or Edit → *Muokkaa argumenttia*. `Enter` saves, `Shift+Enter` adds a line, `Esc` cancels. The inspector fields *Väite / otsikko* (claim/title) and *Perustelut, lähteet ja huomiot* (reasons, sources, notes) save when you leave them. *Alustava suhde vanhempaan* (initial relation: supporting/opposing/neutral) only proposes a starting direction; assessors may rate the influence the other way. *Vanhempi (siirrä alipuuta)* moves the whole subtree, as does Edit → *Siirrä alipuu*. *Poista alipuu* (`Del`) asks first and can be undone (`Ctrl/Cmd+Z`).

**The node menu** (right click or `Shift+F10`): edit text, *Liitä myös muihin solmuihin…* (attach to other nodes), + supporting, − opposing, 0 neutral, on the decision root + option, collapse/expand (Space), move subtree, delete subtree, arrange tree; repeated and locked reasons also offer detaching.

**Dragging and the view.** Drag a card by its header or its text to move it; the position is saved in the document and undoable. Drag empty space to pan, use the wheel to zoom, ⤢ fits the tree. In a compacted view cards cannot be dragged until manual positions are restored.

**The outline** (*Puurakenne*) lists nodes indented: a relation dot, the title, ▸N for a collapsed branch's child count. A truncated title shows in full as a tooltip on hover or focus.

**Decision mode.** Choose *Päätös*. The root is the decision question (PÄÄTÖS) and gets no credence. Add *+ Päätösvaihtoehto* (option) and, if useful, *+ Vaihtoehtoryhmä* (option group: structural only – no rating, balance, gate or ballot of its own; concrete options go inside it). Supporting and opposing reasons go under the options. You cannot return to argument mode while options exist, and options cannot be added while a ballot round is open.

**Repeated reasons.** One reason may bear on several targets differently; every use is rated separately. The left panel's *Yhteydet ja perustelut* tab (also Edit → *Toistuvat perustelut*):

- *Uusi perustelu kirjastoon* + *Luo kirjastoon* creates a card (a blank title becomes "Uusi perustelu"). Advanced: *Perustelun luonne* (fact or consequence / assumption / value) and *Arviointien jakaminen*: *Arviot kohteittain* (ratings per target, recommended) or *Sama lukittu arvio* (one locked credence and influence shared by every use).
- *Kirjaston perustelut*: drag a card onto a tree node, or select it; the inspector then shows its name, each use with its own `75%/+5`, a target select *Liitä solmuun* and *Liitä perustelu* (attach). An unused card can be deleted.
- *Tee valitusta perustelusta toistuva* promotes the selected claim into the library; the inspector's *Liitä myös muihin solmuihin…* does the same and opens the card for choosing a target.
- A use carries the badge *Uudelleen käytetty* and, in the inspector, *Hallitse käsitettä* (manage) and *Irrota käsitteestä (säilytä arviot)* (detach, keep ratings). A locked shared reason shows *Yhteisperuste · lukittu*; its values are changed in the library.
- *Useaan kohteeseen vaikuttavat väitteet* and *Aiemmat yhteysreitit* show the older model's secondary links; each opens the *Yhteydet* dialog (strength −5…+5, your own rating, the mean, remove). A secondary link affects the target's balance and may count the same evidence twice; the dialog warns about it.

**Claim type, sources and author** (the inspector's collapsible section): *Väitteen laji* (unspecified, fact, assumption, value, hard constraint, prerequisite), for constraints and prerequisites *Ehdon toteutuminen* (met?), *Tekijän näyttäminen* (show name or anonymous – the id stays in the file), *Lähteet / evidenssi* (URL and note), and a note about similar claims or shared sources.

**Comments** are notes on a node, not arguments: *+ Lisää kommentti* at the bottom of the inspector. With the comments layer off they are hidden, not deleted.

## 4. Weighing

Choose the stage *Punnitse*. In *Kartoita* the inspector only says *Uskottavuus ja vaikutus arvioidaan Punnitse-tilassa* with a *Punnitse* button; switching also sets the layers to the Analysis preset.

**Your rating in the inspector.** Under *Arviointiasetukset* (*Käyttäjänä: name*) are the sliders *Oma uskottavuusarvio* (0–100 %) and *Oma vaikutusarvio vanhempaan (−5…+5)*. In a decision, a reason directly under an option has *Oma arvio merkityksestä vaihtoehdolle (−5…+5)* instead: one number for direction, strength and how much the matter weighs for you (e.g. *En ole treenannut moneen päivään* under *Uimaan tänään* gets a larger number the more regular training matters to you). Deeper reasons still rate their influence on their parent. The maths is the same; only the wording differs. **Calculation method** (Arviointi menu, saved in the document): *Perustelut ratkaisevat* (reasons decide) is the default for new documents. A claim's result then comes from its reasons alone and its own credence does not count; the slider reads *Oma tuntuma (ei vaikuta laskentaan)* and the rating is kept for comparison. With none of its reasons rated, the claim has no result yet (—). A leaf, a reason without reasons of its own, still scores its own credence. *Log-odds: näyttö kertyy kertoimina* works like reasons decide, but reasons combine as odds: a fully credible +5 reason triples the odds for the claim and −5 divides them by three. One such reason gives +50, two +80, three +93; the result never hits the ±100 limit, so every further reason shows. *Oma arvio + perustelut (prototyyppi)* is the prototype's way: the own rating is the starting level that the reasons move. The prototype's examples and files use it. The quick guide and the selected node's *Mitä perustelutulos tarkoittaa?* explain the methods too.

**Own type name.** The field *Oma tyyppinimi* gives the node's type a name of your own (suggestions Tosiasia, Kriteeri, Tavoite, Arvo, Periaate, Huomio, or free text, at most 40 characters). On the root, an option or a group it replaces the card's type tag (e.g. VAIHTOEHTO → KRITEERI); on a reason it joins the direction, e.g. PUOLTAVA TOSIASIA (supporting fact) or NEUTRAALI TAVOITE (at most two lines; the tooltip shows it in full). The card's + − * ▾ × buttons sit at the right edge, and marks such as *Uudelleen käytetty* show on a small row under the header. A new option, group or value judgment on the same level takes the same name. It never affects a score; clearing it restores the default.

**A note without a rating.** *Ei arvioida (huomio / tosiasia)* (Not rated) in the node settings turns a reason into a note: it has no credence or influence rating, never enters a score and never leaves its parent incomplete. The card is dotted and reads *Ei arvioida*; reasons below it are dimmed because they reach nothing above it (they can still be rated). A new neutral reason (0) starts as a note. Ratings given earlier are kept and count again when you clear the box. The assessment round has the same as a button.

**Jätän tämän arvioimatta (I leave this unrated; others can rate it).** In Punnitse and in the assessment round you can leave a reason unrated yourself when you do not want to or cannot take a position. Your ratings of this reason and of everything below it then count neither in your own nor in the shared result and are not expected from you; others can rate it. The branch is dimmed in your own view. Your ratings are kept and count again when you clear the box. If you think the reason does not matter, choose 0 as its influence instead: that is an ordinary rating that counts in the mean, and the reasons below it count. *Ei arvioida – koskee kaikkia* in the node settings applies to everyone.

**Fine scale.** Influence moves in 0.5 steps by default. *Tarkka asteikko (0,1)* under the slider gives this relation 0.1 steps, about one per cent of the scale, so a small detail can carry a little weight: twenty fully credible details at +0.5 take the thesis to the +100 cap, at +0.1 they give +20 (under log-odds +80 and +21.6).

Until you have rated, a slider is greyed and reads *—*: its handle waits at the document's starting value, which no score uses. Pressing or moving it and letting go saves it, also at the shown value. Saving one slider also saves the other one as shown if you have not rated it yet: setting only the influence to +3 also saves the shown 100 % credence. Both are one undo step; if the claim or relation changed after you rated it, the rating is marked stale and you are asked to rate again. The line *Arvioinnin mukaan: Puoltava (+3.7/5)* gives the assessed direction; *Arviot henkilöittäin · n / m* lists the visible assessors' ratings. Values, constraints and prerequisites get no credence percentage.

**The assessment round** (Assessment → *◉ Arviointikierros*, key `R`) walks the claims one at a time: *Kohta 3/11*, *Arvioitu 2/11*, a progress bar, the parent context, the claim with its notes, both axes. Buttons *← Edellinen*, *Ohita →*, *Tallenna ja seuraava →* (`Ctrl/Cmd+Enter`), *Aloita uusi kierros* and at the end *Jatka keskeneräisistä*. Progress is kept in this browser per document and person; a done mark expires when the claim, its parent or your own values change.

**The balance block** in the inspector: the result (e.g. `+47.5 †`) captioned *Perustelutulos −100…+100 · 0 neutraali*; the comparison with the shared or the assessor's balance; *Uskottavuuden perusarvio* (base credence; for an option the neutral starting level 0); *Aliperustelujen nettovaikutus* (net child influence); *Mitä perustelutulos tarkoittaa?* with the rule and this node's numbers; *Perustelukohtainen erittely* (breakdown), where each child reads *Vaikutus +3/5 · lapsen laskennallinen vahvuus 80.0/100 · vaikutuspaino 2.40* or says its rating is missing. Hitting ±100 is reported. A leaf has no derived result; its credence still propagates upwards.

**Importance highlight and the Δ number.** With View → *Korosta painavimmat* on, some cards get a highlighted border and a chip **Δ +28.0 p**. It answers: *how much would the main claim's (or option's) balance change if only this relation were removed, with everything else as assessed?* The number sits on the card whose effect it describes, not on the parent.

- *How it is computed.* Balances are computed bottom up: a reason's share in its parent is *influence × the reason's own strength*, and the parent's internal value is *base + 5 × (supporting − opposing)*, clamped to 0…100 (visible balance = 2 × internal − 100). Δ removes one relation, recomputes the parent and carries the change up the chain to the main claim or the nearest option, recomputing each intermediate share.
- *Example 1.* Main claim ← A (100 %, +5). The main claim is +50; without A it would sit at its neutral base 0, so A's card reads Δ +50.0 p.
- *Example 2.* Main claim ← A (80 %, +4) ← B (100 %, −2). B weakens A: A is +40 (+60 without B, a local effect of −20). The main claim is +28. B's card reads Δ −4.0 p, because removing B would strengthen A and through it the main claim by only 4 points; A's card reads Δ +28.0 p.
- *What it is for.* It shows which reasons carry the result, so you know where to look: which ratings to check, what to discuss, what to find out. It is not a vote or a rating and changes no score.
- *Why not every card has one.* Only the strongest fifth per main claim or option (at least one) is marked; changing ratings can move the mark to another card.
- *Notes.* Deltas of different reasons do not add up (the ±100 limits and the shared base make them interact); a balance already at a limit may barely move. Unassessed, zero-influence relations and paths through a condition, a value or a group are skipped. The number follows the chosen viewpoint (shared or one assessor). The tooltip gives the current balance, the balance without the relation and the difference, and the same for the direct parent.

**The review lens** (*Käyttäjien arvioiden näkyminen*: Assessment menu, the table's button, or the quick bar in tree-only mode) chooses whose ratings are shown: *Kaikki* (all), *Vain nykyinen* (current only) or a checkbox per person. It is a way of looking: it changes neither the document nor the ballots, and the shared balance is hidden because it is not computed for a subset. The dialog shows the largest disagreements (with the 0 / ⇄ / ± markers) and the closest assessor pairs; the numbers describe ratings, not people.

**Shared and personal viewpoint.** Assessment → *Perustelutulos*: *Yhteinen* (shared: the humans' ratings; *vain ihmiset* when AI profiles exist), *Oma arvio · name* (yours) or another assessor's viewpoint. In a personal viewpoint the edges take your rated direction and an unrated relation is dashed. While viewing someone else, a banner reads *Näytetään arvioijan X tulokset · muokkaat edelleen käyttäjänä Y* and *Näytä omat arviot* returns to yours; their ratings are read-only.

**How the shared result is pooled** is chosen in the people dialog (owner only): *Rakenteellinen esikatselu* uses the tree's authored values; *Arvioijien arviot, sama paino kaikilla* (equal) and *… äänimäärillä painotettuna* (by vote shares) use only entered credence and current influence ratings. Missing is not zero. The choice is saved in the document.

**AI viewpoints stay apart.** An AI profile (marked *· AI*) only comes from an import (an AI-created tree or proposal). Its ratings never enter the humans' shared result or the ballot. When the document has one, the toolbar shows *AI:n arviot*: the dialog *AI:n arviot ja päätösvaihtoehdot* picks the AI assessor, shows its rating counts and the option balances from its ratings, offers *Korosta vahvimmat vaihtoehdot* and *Näytä AI:n näkökulma puussa*, which switches the balance to that AI's viewpoint.

## 5. Deciding

**Options review** (*Vaihtoehtojen tarkastelu*). In decision mode during *Punnitse* the root's inspector lists the options in order: feasibility first, then completeness of the ratings, then the balance. A blocked option shows ⛔, an unresolved one ?, otherwise the balance; each row also reads e.g. *Arvostuksia arvioitu 2/3*. The order is not a recommendation or an expected utility. In a personal viewpoint, View → *Korosta vahvimmat vaihtoehdot* marks the leading option.

**Gates.** Give a reason the type *Ehdoton rajoite* (hard constraint) or *Esiehto* (prerequisite) and set *Ehdon toteutuminen*: unknown, met or unmet. An option's *Toteuttamiskelpoisuus* is then *Ei tiedossa olevia esteitä* (no known blocks), *Selvitettävä* (unresolved: a gate is unknown) or *Estetty* (blocked: a gate is unmet). A gate blocks regardless of scores and never becomes a negative weight. Only gates in the option's own subtree count.

**Values.** A reason of type *Arvostus* expresses a preference: it gets no credence, only an influence −5…+5 on this option. An option's inspector shows *Vaihtoehdon arvostukset* (your influence and the group's distribution per value) and the root shows the table *Arvostusten vaikutus vaihtoehtoihin*. This is not a new importance scale.

**The decision ballot** (*Päätösäänestys*: the toolbar's stage button, or the button in the root's and options' inspector) is a separate, optional preference vote that does not affect the balance:

- Before a round: *Äänipainot* (one vote per participant / per-person vote shares), *Piilota välitulokset kierroksen loppuun* (hide interim results; on by default), *Nimetön tulosnäkymä* (anonymous display), and *Käyttäjät* to set shares. Each option shows its balance from the weighing stage.
- The owner presses *Aloita äänestyskierros*; weights are frozen when the round opens. Earlier preference ballots are included (you are asked).
- Each person selects themselves in the toolbar, sets a 0–100 slider per option and presses *Tallenna ääni* (or *Peruuta ääni* to retract). AI profiles and viewers cannot vote.
- The owner presses *Sulje kierros ja näytä tulokset*. Results: preference = sum(weight × preference 0–100) / sum of weights, with voter count and total weight; ballots per person (unless anonymous); the voting event log; *Aiemmat äänestyskierrokset* archives closed rounds with their results.
- The ballot is local and not secret: anonymous display hides names on screen, but ids and ballots stay in the JSON.

**People and shares** (Assessment → *Käyttäjät*): *Oma käyttäjänimi* (your display name), the pooling choice (section 4) and a row per person: name, *Äänimäärä* (vote shares, an integer; locked while a round is open), rating counts (*11 uskottavuus · 10 vaikutus*), *Valittuna* / *Vaihda tähän* (switch) and *Poista* (not the owner). *+ Lisää käyttäjä* (owner only, up to 100) or the toolbar person select's *+ Lisää paikallinen käyttäjä…*. Names must be unique; a name can change, the id stays, and an imported author's work is never relabelled. A viewer profile cannot edit. This is a local identity choice with no authentication.

## 6. Views

**Tree / table** (*Puu* / *Taulukko*, toolbar or `T`). The table (*Argumentit taulukkona*) lists every claim in logical order, including those in collapsed branches (marked ◌): columns claim, relation (to the immediate parent, with a *ketjun suunta* note when the chain's direction towards the main claim differs), context (parent and grandparent), in *Punnitse* credence, influence and balance (e.g. `85 % (3)` = mean of three assessors, `*` = document baseline, `+47.5 †`, `—`), and details. Search, a relation filter, the review lens and *Näytä kommentit*. *Avaa tarkemmin* opens notes and comments, evaluation, participants' ratings in the file and secondary links under the row, plus *Näytä puussa*, which opens the closed path and centres the node. On a narrow screen a card list replaces the table, with a field to add a supporting or opposing claim.

**View settings** (*Näkymäasetukset*: toolbar button, View menu or `Alt+V`) is a floating panel: ⠿ moves it (also with the arrow keys; a double click resets its place), − collapses it, × hides it. Its place is remembered in the browser.

- *NÄKYMÄKERROKSET* (layers): presets *Tiivis* (compact), *Analyysi*, *Kaikki tiedot* (all) and *Omat valinnat* (custom); *Säädä* opens the seven layers: header row and type, notes, balance, compact ratings (75%/+5 = credence / influence), comments, child count, secondary links (dashed); plus *Näytä toistuvat perustelut myös puussa* (show repeated reasons in the tree). Claim text is always shown. *Kartoita* sets Compact + comments, *Punnitse* Analysis + comments.
- *Puun suunta* (orientation): → left to right, ↓ top down, ✣ four directions (branches around the root; your moves are kept as offsets). *Järjestä puu* (`Alt+A`) re-lays the tree (undoable) or compacts the visible tree when branches are closed; *Sovita näkymään* (`0`) fits; *Tiivistä näkyvä puu* / *Palauta solmujen omat sijainnit* (compact / restore manual positions); in decision mode *Näytä vain päätösvaihtoehdot* / *Avaa vaihtoehtojen perustelut* (`Alt+Shift+O`).
- *Avaa puuta tasoittain* (depth): a slider from root only to all levels shows the tree to that depth without changing the document; *Omat avaukset* means your own collapses, *Palauta omat avaukset* returns to them. Under a depth limit, opening or closing a branch is a view change only.
- *HAARAN KOROSTUS* (branch focus): *Kaikki*, *+ Puoltavat* or *− Vastustavat* highlights reasons pushing that way and dims the rest; an objection to an objection counts as supporting. *◎ Valittu haara* sets the starting point (default *Koko puu*, whole tree). Matches inside closed branches are shown temporarily; the collapse state is kept.

**Tree only** (*Vain puu*: View → ⛶, key `F`; `Esc` leaves) hides the panels and shows a quick bar over the tree: tree only, orientation, arrange, undo, person, assessment round, edit text, review lens, shortcuts.

**Panels**: `Alt+1` left, `Alt+2` top (the toolbar), `Alt+3` right, `Alt+4` bottom; the top bar's buttons ◧ ▤ ◨ ▥. The choice is remembered. On a narrow window (≤ 1000 px) the left panel starts hidden and at ≤ 600 px the app opens in the table; at 390 px the panels stack.

**Themes**: Light, Dark, Paper, Star map, Hologram, Manuscript, Quill pen, Night colours, Terminal (green on black like an old terminal), ASCII (cards and tree lines drawn from characters) and Comic (hand-drawn, xkcd-like). The first three are saved in the document (and travel with the file); the others are per browser. **Languages**: Finnish, German, English, Spanish, French, Russian, Simplified Chinese, Japanese and Korean; switching is immediate and remembered.

## 7. Files and sharing

**File menu**: *+ Uusi* (new), *Avaa JSON* (open), *↓ Tallenna tiedosto* (`Ctrl/Cmd+S`; downloads `<title>.witt.json`, recorded on the home card), *Vie kuva / PDF* (image/PDF), *Asiakirjakirjasto*, *AI:n tai toisen käyttäjän muutosehdotus* and the save status.

**The JSON file.** A `.witt.json` (schema v8, scoring `evidence-v3-links`) holds the whole document, byte-identical to the prototype's export. On open the file is checked completely before anything is replaced: a broken file never touches the open work. The import check *JSON-tuonnin tarkistus* names the file's format and each problem's path, message and fix; *Kopioi korjausraportti* (copy, e.g. for a language model) and *Lataa raportti .txt* (`witt-tuonnin-korjausraportti.txt`). Files over 5 MB are refused. *Avaa JSON* recognises the format and routes it: a WITT document (also the unrated AI starter `witt-ai-starter-v1`) replaces the work through the replace dialog, an AI-created tree opens in its preview, a change proposal opens in the proposal dialog, and a library backup is restored into the library after confirmation.

**Image / PDF export** (*Vie puu kuvaksi tai PDF:ksi*) draws the tree itself – not a screenshot: format PNG / SVG / PDF; scope current tree view or whole tree including closed branches; details current layers / compact / analysis / all; colours light (print) or dark; toggles importance highlight, secondary links (dashed), repeated reasons, compact visible nodes. PNG: resolution 1×/2×/3× and mode one PNG if possible (else ZIP) or tiles in a ZIP, with a size estimate ("1816 × 3044 px · 5.5 MP · …"). PDF: A4 automatic / portrait / landscape over several pages, or one page (may be small). *Lataa tiedosto* downloads; the document does not change.

**New tree with AI** (*Luo uusi puu AI:n avulla*, from the home screen or the new-work dialog), in two steps:

1. *Luo tehtävä AI:lle* (create the AI task): choose the tree type, write the topic or main claim and optional source material (discussion excerpts, notes, instructions). *Kopioi AI-tehtävä* copies the task to the clipboard, *Lataa sama tehtävä (TXT)* downloads it; *Katso AI-tehtävän koko sisältö* shows it, and the technical options offer the JSON schema separately (it is already in the task). Paste the task into a language model of your choice yourself – WITT sends nothing.
2. *Avaa AI:n vastaus* (open the reply): paste the JSON or choose the reply file, then *Esikatsele ennen hyväksyntää* (preview). The preview lists the content with *Tuo arvioinnit*, *Tuo kommentit*, *Tuo yhteisperusteet* (import ratings, comments, shared reasons; leaving out the AI's ratings also leaves out its locked shared reasons). *Avaa uusi työ* creates the document, with the AI as its own AI profile – its ratings never change the humans' shared result. The format is `witt-ai-draft-v2`.

**Proposal from an AI or another user** (*Tuo tai vie muutoksia ja arviointeja*) extends the current tree:

1. Request a proposal: ask the model to *Täydennä puuta ja ehdota korjauksia* (extend and suggest fixes) or *Tee vain oma arviointikierros* (only rate); copy the task or download it as TXT. The task contains the current work and possibly personal data.
2. Review and import: paste the proposal (from an AI or another WITT) or choose its file, then preview. *Valitse hyväksyttävät muutokset* names the source (*Ihminen / WITT* with a nickname, or *Kielimalli / AI*; a file proves no identity) and offers groups – new nodes, edits to existing nodes, secondary links, shared reasons, ratings, comments – plus per-item choices. *Hyväksy ehdotukset* adds only what you selected; other people's ratings and ballots never change, and a stale proposal (made against another version) is never merged.
3. Export users' changes: choose the original WITT file and the local users to export; each person's changes, ratings and comments go out under their own name and id (`witt-contribution-v2`, a multi-person bundle `witt-contribution-bundle-v1`). This is how two WITT users exchange work as files, without a server.

## 8. Keyboard shortcuts

Shortcuts never capture keys inside text fields. Help → *Pikanäppäimet* (`?`) opens the quick guide; its *Muokattavat pikanäppäimet* section rebinds nine commands (choices include `+ − * Ctrl+Enter Alt+1…6 Alt+A F H R T ?`; one key per command; *Palauta oletukset* resets). The setting is kept in the browser.

| Key | Action |
| --- | --- |
| `+` / `−` | Add a supporting / opposing reason to the selected node (rebindable) |
| `Ctrl/Cmd+Enter` / `Ctrl/Cmd+Shift+Enter` | The same, always available |
| `,` | Add a value judgment (a goal or value; never counted in the balance) to the selected node (rebindable) |
| `*` | Add a decision option (decision mode, rebindable) |
| `T` | Tree ⇄ table (rebindable) |
| `F` / `Esc` | Tree only on/off / off (rebindable) |
| `R` | Assessment round (rebindable) |
| `?` | Shortcuts and quick guide (rebindable; also on the home screen) |
| `Alt+A` | Arrange tree (rebindable) |
| `Alt+V` | View settings |
| `Alt+1` … `Alt+4` | Left panel, top bar, right panel, bottom bar |
| `Alt+Shift+O` | Show only decision options / open their reasons |
| `Ctrl/Cmd+S` | Save file (`.witt.json`) |
| `Ctrl/Cmd+Z` · `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` | Undo · redo |
| `Del` / `Backspace` | Delete the selected node (a subtree asks first) |
| `F2` / `Enter` | Edit the selected card's text; `Enter` saves, `Shift+Enter` new line, `Esc` cancels |
| `Shift+F10` / context-menu key | Node menu |
| `G` | Focus the tree (the selected card) |
| `Home` / `End` | First / last visible claim |
| Arrows (left-to-right tree) | ↑/↓ sibling; → open branch or first child; ← close branch or parent |
| Arrows (top-down tree) | ←/→ sibling; ↓ open or first child; ↑ close or parent |
| Arrows (four directions) | Nearest visible node in that direction |
| Space | Open or close the selected subtree |
| `Ctrl/Cmd` + `+` / `−` | Zoom in / out |
| `0` | Fit the tree to the view |
| `Alt` + arrows | Pan the view |
| `Ctrl/Cmd+Enter` (assessment round) | Save and next |
| Arrows (on a ⠿ handle) | Move the view-settings or practice panel by 24 px |

## 9. Privacy

- WITT is local-first: a static page that runs in the browser with no login, server or accounts. Nothing leaves the browser except files you save and text you copy to the clipboard. The app never calls an AI service – the AI task is copied or downloaded and the reply brought back by hand. The page's Content-Security-Policy allows only the page's own scripts and connections.
- The browser keeps the active work (`witt-project-v3`), its save metadata, view and panel settings, the language, a special theme, your shortcuts, the per-document person choice, review lens and assessment-round progress, and the document library (IndexedDB). They are per device and browser, not a backup: export `.witt.json`.
- A `.witt.json` contains everything in the document: claims and notes, sources, comments, people's names and stable ids, every person's ratings, vote shares, ballot rounds and ballots with their event log, positions, the base theme and settings. *Show anonymous* hides an author on screen only – the id stays in the file; it is not anonymisation. Imported authorship is kept as is, and unknown legacy authorship stays unknown.
- The AI task and the proposal export contain the current work and possibly personal data; read the text before giving it to a language model.
- The ballot is local and not secret; anonymous display is a presentation, not a protection. The balance is not a probability of truth.
