# WITT – user guide (new app, version 0.1)

This guide describes what the new app does today. The prototype (dev32) at `proto/` still has more features; this guide is updated with every feature.

## What WITT is

WITT is a browser tool for drawing an argument tree or comparing decision options with the GRACE method. Everything stays in your own browser; nothing is sent to a server. Export your work as a `.witt.json` file to keep it or move it to another device.

Each person rates each reason on two axes:

- **Credence** 0–100 %: how likely the reason holds in this context.
- **Influence** −5…+5 (half steps): how strongly it supports (+) or opposes (−) the claim or option above it.

From these the **argument balance** −100…+100 is computed. It explains the argument; it is not a probability of truth and not a vote. An unrated item shows a dash (—), never a zero, and an incomplete computation carries an asterisk.

## The screen

- **Top bar**: document title, four pane toggles (left, top, right, bottom; also `Alt+1`…`Alt+4`), language and theme (Light, Dark, Paper, Bitberg).
- **Toolbar**: mode *Argumentointi* or *Päätös*, the person selector (`+ Lisää käyttäjä` adds a local person), the viewpoint *Yhteinen* / *Oma arvio*, the view *Puu* / *Taulukko*, and the menus Tiedosto, Muokkaa, Arviointi, Näkymä, Apua.
- **Left panel**: the tree as an outline and the *Yhteydet ja perustelut* tab (the repeated-reason shelf).
- **Centre**: the tree as cards. Drag a card to move it; drag the background to pan; `Ctrl/Cmd` + wheel zooms; `0` fits the tree.
- **Right panel**: the selected node and its reviews.
- **Bottom zone** (`Alt+4`): structure quick actions.

## Argument mode

1. Write the thesis in the right panel's *Väite / otsikko* field.
2. Add reasons: press `+` (supporting) or `−` (opposing) while the tree is active, or use the Muokkaa menu or the bottom zone. The new card opens for editing at once.
3. Review a reason under *Oma arvio*: set credence and influence and press *Vahvista*. The card shows your review as `75%/+5`.
4. The thesis balance updates immediately: one fully credible +5 reason gives +50, two give +100, one −5 objection gives −50.
5. An objection to an objection supports the original claim: a review always concerns the relation to the immediate parent.

## Decision mode

1. Choose *Päätös*. The root is the decision question; it gets no truth rating.
2. Add options (`+ Päätösvaihtoehto`) and reasons under them.
3. The root's panel shows *Vaihtoehtojen tarkastelu*: feasibility (hard constraints and prerequisites), balance and any ballot preference.
4. Gates: set a reason's kind to *Ehdoton rajoite* or *Esiehto* and mark whether it is met. An unmet gate blocks the option regardless of scores.
5. Ballot (Arviointi → Päätösäänestys): the owner opens a round, which freezes vote weights. Everyone gives a 0–100 preference per option. The owner closes the round and the results appear. The ballot is local and not secret.

## People and viewpoints

- Arviointi → *Käyttäjät*: names, vote shares and the pooled-result weighting (equal, by shares, or the document's template values).
- Switch the active person in the toolbar. Reviews stay separate per person; a name can change, the id stays.
- The *Oma arvio* viewpoint computes from your own reviews only. *Yhteinen* pools the humans' reviews; AI profiles are excluded.

## Repeated reasons

One reason may bear on several options differently. Select a reason and press *Liitä myös muihin solmuihin…*, pick the target: a new use appears with its own reviews. The left panel's *Yhteydet ja perustelut* tab is the shelf: create a card, see each use's reviews, attach a card to the selected node.

## Table

The *Taulukko* view lists every claim in logical order with its relation, context, your credence and influence and the balance. Search and the filter narrow the list; a claim's name selects it.

## Files and saving

- Work autosaves to the browser (*Tallennettu selaimeen*). Browser storage is per device and not a backup.
- Tiedosto → *Tallenna tiedosto* downloads a `.witt.json`. *Avaa JSON* opens one. Before replacing, the app names the work that is open.
- `Ctrl/Cmd+Z` undoes, `Ctrl/Cmd+Shift+Z` redoes. `?` lists the shortcuts.

## Not there yet

Image and PDF export, the document library, AI task text and proposal import, locked shared reasons, secondary links, the guided tutorial and the examples. They exist in the prototype (`proto/`) and arrive here feature by feature (`docs/ISSUE-PLAN.md`).
