// The walkthroughs' panel (#tutorialPanel): a callout that sits beside the part of the interface it talks about, with
// an arrow, the phases of the method and one thing to do at a time (owner request 2026-11-19, UI_INVENTORY S-15).
// The steps and their completion rules are data in tutorials.ts; this module draws them, points at the DOM, carries
// out "Näytä kohde" and keeps the session state outside React so it survives the home ↔ workspace switch. The only
// thing persisted is the answer to the invite on the home screen (`witt-tutorial-invite-v1`).
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import type { Node, Project } from '../domain/index.ts';
import { translator } from '../lib/i18n/i18n.ts';
import { newId } from '../lib/providers.ts';
import { addNode, arrangeTree, selectPresentation, startInlineEdit } from './actions.ts';
import { displayShortcut, readShortcuts } from './shortcuts.ts';
import { blankProject, getStore, useAppState, useTranslator } from './store.ts';
import type { AppState } from './store.ts';
import { BASICS, COLLAB, DECISION, PEOPLE, TUTORIALS, advance, lastStep, placeBeside } from './tutorials.ts';
import type { TutorialId, TutorialRun } from './tutorials.ts';
import { LAYER_PRESETS } from './view.ts';

export type TutorialState = TutorialRun;
interface Snapshot {
  tutorial: TutorialRun | null;
  /** Where the person dragged the panel during this step; null lets it sit beside its target. */
  position: { x: number; y: number } | null;
  /** The invite was answered "Ei nyt" in this session. */
  inviteLater: boolean;
}
let snapshot: Snapshot = { tutorial: null, position: null, inviteLater: false };
const listeners = new Set<() => void>();
const update = (patch: Partial<Snapshot>) => {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => snapshot;
export const useTutorial = (): Snapshot => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
export const tutorialState = (): TutorialRun | null => snapshot.tutorial;
export function stopTutorial(): void {
  if (snapshot.tutorial) update({ tutorial: null, position: null });
}

// ---- the invite on the home screen ------------------------------------------------------------------------------
const INVITE_KEY = 'witt-tutorial-invite-v1';
const inviteNever = (): boolean => {
  try {
    return window.localStorage.getItem(INVITE_KEY) === 'never';
  } catch {
    return false;
  }
};
/** "Älä kysy enää", and a finished basics walkthrough: the invite is not shown again in this browser. */
export function dismissInviteForGood(): void {
  try {
    window.localStorage.setItem(INVITE_KEY, 'never');
  } catch {
    // storage blocked: the invite returns next time, which is the lesser harm
  }
  update({ inviteLater: true });
}
export const dismissInviteForNow = (): void => update({ inviteLater: true });
/** True while the home screen should ask whether to take the walkthrough. */
export const useTutorialInvite = (): boolean => {
  const { inviteLater, tutorial } = useTutorial();
  return !inviteLater && !tutorial && !inviteNever();
};

const t = () => translator(getStore().get().messages);
const narrow = () => window.innerWidth <= 760;

/** Leaves a step: the dragged position is forgotten, and entering the arrange step makes its untidy tree. On a
 * narrow window the steps that point at the side panels are passed in either direction. */
function goTo(step: number): void {
  const current = snapshot.tutorial;
  if (!current) return;
  const end = lastStep(current.id);
  let next = Math.max(0, Math.min(end, step));
  if (current.id === 'basics' && narrow() && next >= BASICS.tourLeft && next <= BASICS.tourZones)
    next = next > current.step ? BASICS.toEvaluate : BASICS.nameOppose;
  update({
    tutorial: { ...current, step: next, furthest: Math.max(current.furthest, next) },
    position: null,
  });
  if (current.id === 'basics') {
    if (next === BASICS.arrange) showMessyTutorialTree();
    if (next === end) dismissInviteForGood();
  }
}

/** Replaces the active work (after the replacement dialog) with a practice document, or uses the open one. */
export async function startTutorial(id: TutorialId = 'basics'): Promise<void> {
  const store = getStore();
  const tr = t();
  // Every panel is shown, whatever was hidden before: a step that points at a panel that is not there teaches
  // nothing, and where the panels are switched is itself one of the steps.
  const showPanels = () => store.setZones({ left: true, top: true, right: true });
  const base = {
    step: 0,
    furthest: 0,
    supportId: null,
    opposeId: null,
    secondUserId: null,
    messShown: false,
    collabOpened: false,
  };
  if (id === 'collab') {
    // Nothing is replaced: the walkthrough points at the open document's own menus.
    if (store.get().home) store.setHome(false);
    const state = store.get();
    const root = state.project.nodes.find((n) => n.parentId === null) as Node;
    update({ position: null, tutorial: { ...base, id, rootId: root.id, firstUserId: state.actorId } });
    return;
  }
  if (!(await store.prepareReplacement(tr('newDocumentConfirm')))) return;
  const doc = blankProject('argument');
  const root = doc.nodes[0] as Node;
  const project: Project = {
    ...doc,
    title: tr(
      id === 'people'
        ? 'tutPeopleDocTitle'
        : id === 'decision'
          ? 'tutDecisionDocTitle'
          : 'tutorialDocumentTitle'
    ),
    nodes: [
      id === 'decision'
        ? { ...root, title: tr('tutDecisionRoot') }
        : { ...root, title: tr('tutorialRootClaim'), details: tr('tutorialRootDetail') },
    ],
  };
  store.load(project);
  if (id === 'basics') {
    store.setView({ presentation: 'tree', workflow: 'explore', layers: { ...LAYER_PRESETS.text } });
    showPanels();
    update({
      position: null,
      // A narrow window has no side panels to point at: the look-around steps are passed.
      tutorial: { ...base, id, rootId: root.id, firstUserId: store.get().actorId },
    });
    return;
  }
  if (id === 'decision') {
    // An argument document on purpose: changing its type is the walkthrough's first thing to do.
    store.setView({ presentation: 'tree', workflow: 'explore', layers: { ...LAYER_PRESETS.text } });
    showPanels();
    update({ position: null, tutorial: { ...base, id, rootId: root.id, firstUserId: store.get().actorId } });
    return;
  }
  // people: a small tree the first assessor has already rated, so there is something to compare with.
  const me = store.get().actorId;
  const supportId = newId();
  const opposeId = newId();
  store.dispatch({
    type: 'node.add',
    id: supportId,
    parentId: root.id,
    relation: 'support',
    title: tr('tutPeopleSupport'),
  });
  store.dispatch({
    type: 'node.add',
    id: opposeId,
    parentId: root.id,
    relation: 'oppose',
    title: tr('tutPeopleOppose'),
  });
  for (const [nodeId, credence, influence] of [
    [supportId, 80, 3],
    [opposeId, 60, -2],
  ] as const)
    store.dispatch({
      type: 'review.personal',
      voteId: newId(),
      assessmentId: newId(),
      nodeId,
      userId: me,
      credence,
      influence,
    });
  store.select(root.id);
  store.setView({
    presentation: 'tree',
    workflow: 'evaluate',
    layers: { ...LAYER_PRESETS.analysis, comments: true },
  });
  showPanels();
  store.requestFit();
  update({
    position: null,
    tutorial: { ...base, id, rootId: root.id, supportId, opposeId, firstUserId: me },
  });
}

/** The arrange step's deliberately disordered tree: two sample reasons if missing, heaped beside the root. */
function showMessyTutorialTree(): void {
  const current = snapshot.tutorial;
  if (!current || current.messShown) return;
  update({ tutorial: { ...current, messShown: true } });
  const store = getStore();
  const tr = t();
  const rootId = current.rootId;
  const hasChild = (relation: 'support' | 'oppose') =>
    store.get().project.nodes.some((n) => n.parentId === rootId && n.relation === relation);
  if (!hasChild('support'))
    store.dispatch({
      type: 'node.add',
      id: newId(),
      parentId: rootId,
      relation: 'support',
      title: tr('supportAdd'),
    });
  if (!hasChild('oppose'))
    store.dispatch({
      type: 'node.add',
      id: newId(),
      parentId: rootId,
      relation: 'oppose',
      title: tr('opposeAdd'),
    });
  const project = store.get().project;
  const root = project.nodes.find((n) => n.id === rootId);
  if (root) {
    const positions: Record<string, { x: number; y: number }> = {};
    project.nodes
      .filter((n) => n.parentId === rootId)
      .forEach((node, i) => {
        positions[node.id] = {
          x: root.position.x + 230 + (i % 2) * 24,
          y: root.position.y + 24 + (i % 3) * 25,
        };
      });
    store.dispatch({ type: 'node.position', positions });
  }
  // The view settings are not opened here: they would cover the untidy tree the step is about.
  store.setView({ presentation: 'tree', orientation: 'horizontal' });
  store.requestFit();
}

/** Advances when the document shows the step was done (tutorials.ts decides). */
function check(state: AppState): void {
  const current = snapshot.tutorial;
  if (!current) return;
  const next = advance(current, {
    project: state.project,
    actorId: state.actorId,
    presentation: state.view.presentation,
    workflow: state.view.workflow,
    dialog: state.dialog,
  });
  if (next === current) return;
  if (next.step === current.step) {
    update({ tutorial: next });
    return;
  }
  update({ tutorial: { ...next, step: current.step, furthest: current.furthest } });
  // The untidy tree changes the document; let the store finish the notification that brought us here first.
  queueMicrotask(() => goTo(next.step));
}

/** The room the callout keeps clear. A control inside the view settings is pointed at from beside the whole panel,
 * never over it; a menu is pointed at from beside the place its list drops into, so the list can be used. */
function besideWhat(target: HTMLElement): { left: number; top: number; right: number; bottom: number } {
  const dock = target.closest('#viewDock');
  if (dock) return dock.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  // The type chip's list opens from its left edge; the toolbar's menus open from their right edge.
  if (target.matches('.doc-type-menu'))
    return { left: r.left, right: r.left + 296, top: r.bottom, bottom: r.bottom + 240 };
  if (target.matches('details.toolbar-popover'))
    return { left: r.right - 264, right: r.right, top: r.bottom, bottom: r.bottom + 420 };
  return r;
}

const cardSelector = (id: string | null) => (id ? `.node[data-id="${CSS.escape(id)}"]` : null);
/** What the step points at, most specific first; the first one on screen gets the callout, all get the ring. */
function anchors(run: TutorialRun, state: AppState): string[] {
  const evaluating = state.view.workflow === 'evaluate';
  const list: (string | null)[] = [];
  if (run.id === 'basics') {
    const root = cardSelector(run.rootId);
    if (run.step === BASICS.tourTree) list.push(root);
    if (run.step === BASICS.tourLeft) list.push('.leftpanel .left-add, .leftpanel');
    if (run.step === BASICS.tourInspector) list.push('.inspector-panel');
    if (run.step === BASICS.tourZones) list.push('.zone-controls:not(.history-controls):not(.help-controls)');
    if (run.step === BASICS.addSupport)
      list.push(`${root} .node-add[data-relation="support"]`, '#btnSupport');
    if (run.step === BASICS.nameSupport) list.push(cardSelector(run.supportId));
    if (run.step === BASICS.addOppose) list.push(`${root} .node-add[data-relation="oppose"]`, '#btnOppose');
    if (run.step === BASICS.nameOppose) list.push(cardSelector(run.opposeId));
    if (run.step === BASICS.toEvaluate) list.push('#btnWorkflowEvaluate');
    if (run.step === BASICS.rateSupport)
      list.push(
        evaluating && state.selectedId === run.supportId ? '#nodeConfidence' : null,
        cardSelector(run.supportId),
        evaluating ? null : '#btnWorkflowEvaluate'
      );
    if (run.step === BASICS.round) list.push('#assessmentMenu');
    if (run.step === BASICS.rateOppose)
      list.push(cardSelector(run.opposeId), evaluating ? '#nodeConfidence' : null);
    // The result box is the selected card's: it is pointed at only when that card is the main claim.
    if (run.step === BASICS.readResult)
      list.push(state.selectedId === run.rootId && evaluating ? '#inspector .score-hero' : null, root);
    if (run.step === BASICS.table) list.push('#btnTableView');
    if (run.step === BASICS.tableBack) list.push('#btnTreeView');
    // Arranging is in the view settings: their button first, then the button inside once they are open.
    if (run.step === BASICS.arrange) list.push(state.view.dockHidden ? '#btnViewSettings' : '#btnLayout');
  } else if (run.id === 'decision') {
    if (run.step === DECISION.intro || run.step === DECISION.switchType) list.push('#docTypeMenu');
    if (run.step === DECISION.addOptions) list.push('#btnOption', cardSelector(run.rootId));
    if (run.step === DECISION.addReason) list.push('.node[data-relation="option"]');
    if (run.step === DECISION.rateReason)
      list.push(
        evaluating && state.selectedId === run.supportId ? '#nodeImpact' : null,
        cardSelector(run.supportId),
        evaluating ? null : '#btnWorkflowEvaluate'
      );
    if (run.step === DECISION.compare)
      list.push(
        state.selectedId === run.rootId ? '[data-testid="decision-overview"]' : null,
        cardSelector(run.rootId)
      );
    if (run.step === DECISION.vote) list.push('#btnVoting');
  } else if (run.id === 'people') {
    if (run.step === PEOPLE.intro || run.step === PEOPLE.addAssessor) list.push('#actorSelect');
    if (run.step === PEOPLE.rateAsSecond)
      list.push(state.selectedId === run.supportId ? '#nodeConfidence' : null, cardSelector(run.supportId));
    if (run.step === PEOPLE.compare) list.push('#inspector .score-hero', cardSelector(run.rootId));
    if (run.step === PEOPLE.lens) list.push('#assessmentMenu');
  } else {
    if (run.step === COLLAB.intro || run.step === COLLAB.openDialog) list.push('#fileMenu');
    if (run.step === COLLAB.ending) list.push('#historyControls');
  }
  return list.filter((s): s is string => !!s);
}

/** "Näytä kohde": performs or focuses what the current step asks for. */
function showTarget(): void {
  const current = snapshot.tutorial;
  if (!current) return;
  const store = getStore();
  const evaluate = () =>
    store.setView({ workflow: 'evaluate', presentation: 'tree', layers: { ...LAYER_PRESETS.analysis } });
  if (current.id === 'basics') {
    const { step } = current;
    if (step === BASICS.addSupport || step === BASICS.addOppose) {
      store.select(current.rootId);
      const relation = step === BASICS.addSupport ? 'support' : 'oppose';
      const action = document.querySelector<HTMLButtonElement>(
        `${cardSelector(current.rootId)} .node-add[data-relation="${relation}"]`
      );
      if (narrow() || !action?.getClientRects().length) addNode(relation, current.rootId);
      else action.focus({ preventScroll: true });
    } else if (step === BASICS.nameSupport || step === BASICS.nameOppose) {
      const id = step === BASICS.nameSupport ? current.supportId : current.opposeId;
      if (id) {
        store.select(id);
        startInlineEdit(id);
      }
    } else if (step === BASICS.toEvaluate) evaluate();
    else if (step === BASICS.round) document.querySelector<HTMLElement>('#assessmentMenu > summary')?.click();
    else if (step === BASICS.rateSupport || step === BASICS.rateOppose) {
      evaluate();
      const id = step === BASICS.rateSupport ? current.supportId : current.opposeId;
      if (id) store.select(id);
    } else if (step === BASICS.readResult) {
      evaluate();
      store.select(current.rootId);
      requestAnimationFrame(() =>
        document.querySelector('#inspector .score-hero')?.scrollIntoView({ block: 'nearest' })
      );
    } else if (step === BASICS.table) selectPresentation('table');
    else if (step === BASICS.tableBack) selectPresentation('tree');
    else if (step === BASICS.arrange) arrangeTree();
    else store.select(current.rootId);
    return;
  }
  if (current.id === 'decision') {
    const { step } = current;
    if (step === DECISION.intro || step === DECISION.switchType)
      document.querySelector<HTMLElement>('#docTypeMenu > summary')?.click();
    else if (step === DECISION.addOptions) store.select(current.rootId);
    else if (step === DECISION.addReason) {
      const option = store.get().project.nodes.find((n) => n.kind === 'option');
      if (option) store.select(option.id);
    } else if (step === DECISION.rateReason) {
      evaluate();
      if (current.supportId) store.select(current.supportId);
    } else if (step === DECISION.compare) {
      evaluate();
      store.select(current.rootId);
      requestAnimationFrame(() =>
        document.querySelector('[data-testid="decision-overview"]')?.scrollIntoView({ block: 'nearest' })
      );
    }
    return;
  }
  if (current.id === 'people') {
    if (current.step === PEOPLE.intro || current.step === PEOPLE.addAssessor)
      document.getElementById('actorSelect')?.focus();
    else if (current.step === PEOPLE.rateAsSecond) {
      evaluate();
      if (current.secondUserId && store.get().actorId !== current.secondUserId)
        store.setActor(current.secondUserId);
      if (current.supportId) store.select(current.supportId);
    } else if (current.step === PEOPLE.compare) {
      evaluate();
      store.select(current.rootId);
      requestAnimationFrame(() =>
        document.querySelector('#inspector .score-hero')?.scrollIntoView({ block: 'nearest' })
      );
    } else if (current.step === PEOPLE.lens)
      document.querySelector<HTMLElement>('#assessmentMenu > summary')?.click();
    return;
  }
  if (current.step === COLLAB.intro || current.step === COLLAB.openDialog)
    document.querySelector<HTMLElement>('#fileMenu > summary')?.click();
}

/** "Edellinen": one step back, to look at it again; it then waits for Seuraava (tutorials.ts `furthest`). */
function previousStep(): void {
  const current = snapshot.tutorial;
  if (current && current.step > 0) goTo(current.step - 1);
}
/** A phase chip: to the first step of a phase that has been reached. */
function goToPhase(phase: number): void {
  const current = snapshot.tutorial;
  if (!current) return;
  const first = TUTORIALS[current.id].steps.findIndex((s) => s.phase === phase);
  if (first >= 0 && first <= current.furthest) goTo(first);
}

/** "Seuraava" / "Sulje opastus". */
function nextStep(): void {
  const current = snapshot.tutorial;
  if (!current) return;
  if (current.step === lastStep(current.id)) stopTutorial();
  else goTo(current.step + 1);
}

const clampToWindow = (panel: HTMLElement, x: number, y: number) => ({
  x: Math.max(6, Math.min(x, window.innerWidth - panel.offsetWidth - 6)),
  y: Math.max(6, Math.min(y, window.innerHeight - panel.offsetHeight - 6)),
});

export function Tutorial() {
  const state = useAppState();
  const tr = useTranslator();
  const { tutorial, position } = useTutorial();
  const store = getStore();
  const visible = !!tutorial && !state.home && !state.dialog && !state.modal;
  const panelRef = useRef<HTMLElement>(null);

  // Launched from the home screen and the Apua menu; a store subscription advances the steps.
  useEffect(() => {
    const onStart = (event: Event) =>
      void startTutorial(((event as CustomEvent<TutorialId | undefined>).detail ?? 'basics') as TutorialId);
    window.addEventListener('witt-tutorial', onStart);
    const unsubscribe = store.subscribe(() => check(store.get()));
    check(store.get());
    return () => {
      window.removeEventListener('witt-tutorial', onStart);
      unsubscribe();
    };
  }, [store]);

  // The arrange step completes when the tree is arranged, from the view settings, a menu or Alt+A.
  const arranging = visible && tutorial?.id === 'basics' && tutorial.step === BASICS.arrange;
  useEffect(() => {
    if (!arranging) return;
    const onArranged = () => goTo(BASICS.done);
    window.addEventListener('witt-arranged', onArranged);
    return () => window.removeEventListener('witt-arranged', onArranged);
  }, [arranging]);

  // The ring and the callout follow the rendered DOM: after every change of the document, the view or the step, and
  // a few times a second besides, because panning the canvas moves a card without telling anyone.
  const selectors = visible && tutorial ? anchors(tutorial, state) : [];
  const anchorKey = selectors.join('|');
  useLayoutEffect(() => {
    const clear = () =>
      document
        .querySelectorAll('.tutorial-highlight')
        .forEach((el) => el.classList.remove('tutorial-highlight'));
    clear();
    const panel = panelRef.current;
    if (!visible || !panel) return clear;
    const place = () => {
      const found = selectors
        .map((selector) => document.querySelector<HTMLElement>(selector))
        .filter((el): el is HTMLElement => !!el && el.getClientRects().length > 0);
      clear();
      for (const el of found) el.classList.add('tutorial-highlight');
      const first = found[0];
      const beside =
        first && !position && !narrow()
          ? placeBeside(
              besideWhat(first),
              { w: panel.offsetWidth, h: panel.offsetHeight },
              {
                w: window.innerWidth,
                h: window.innerHeight,
                // Below the header rows, unless the target is a plain control in them.
                top:
                  first.closest('.topbar, .toolbar') && !first.matches('details.toolbar-popover')
                    ? 0
                    : (document.querySelector('.toolbar')?.getBoundingClientRect().bottom ?? 0),
              }
            )
          : null;
      if (position) {
        panel.style.cssText = `left:${position.x}px;top:${position.y}px;right:auto;bottom:auto;`;
        panel.dataset.side = 'free';
      } else if (beside) {
        panel.style.cssText = `left:${Math.round(beside.x)}px;top:${Math.round(beside.y)}px;right:auto;bottom:auto;--arrow:${Math.round(beside.arrow)}px;`;
        panel.dataset.side = beside.side;
      } else {
        panel.style.cssText = '';
        panel.dataset.side = 'free';
      }
    };
    place();
    const timer = window.setInterval(place, 300);
    window.addEventListener('resize', place);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', place);
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visible,
    anchorKey,
    position,
    tutorial?.step,
    state.project,
    state.view,
    state.selectedId,
    state.inlineEditId,
  ]);

  if (!visible || !tutorial) return <aside id="tutorialPanel" className="tutorial-panel" hidden />;

  const def = TUTORIALS[tutorial.id];
  const end = lastStep(tutorial.id);
  const step = def.steps[tutorial.step]!;
  const complete = tutorial.step === end;
  // Looking at an earlier step again: it no longer completes by itself, so Seuraava is the way on.
  const reviewing = tutorial.step < tutorial.furthest;
  const shortcuts = readShortcuts(window.localStorage);
  const progress = complete
    ? tr('tutorialComplete')
    : tr('tutorialProgress', { current: tutorial.step + 1, total: end });
  const hintKey =
    tutorial.id !== 'basics'
      ? null
      : tutorial.step === BASICS.addSupport
        ? shortcuts.support
        : tutorial.step === BASICS.addOppose
          ? shortcuts.oppose
          : tutorial.step === BASICS.round
            ? shortcuts.assessment
            : tutorial.step === BASICS.arrange
              ? shortcuts.arrange
              : null;
  const hint = hintKey ? ` ${tr('tutShortcutHint', { key: displayShortcut(hintKey) })}` : '';
  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const panel = handle.closest<HTMLElement>('#tutorialPanel');
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    handle.setPointerCapture(event.pointerId);
    const onMove = (ev: PointerEvent) =>
      update({
        position: clampToWindow(panel, rect.left + ev.clientX - startX, rect.top + ev.clientY - startY),
      });
    const stop = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const movement: Record<string, [number, number]> = {
      ArrowLeft: [-24, 0],
      ArrowRight: [24, 0],
      ArrowUp: [0, -24],
      ArrowDown: [0, 24],
    };
    const delta = movement[event.key];
    const panel = event.currentTarget.closest<HTMLElement>('#tutorialPanel');
    if (!delta || !panel) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = panel.getBoundingClientRect();
    update({ position: clampToWindow(panel, rect.left + delta[0], rect.top + delta[1]) });
  };
  return (
    <aside
      id="tutorialPanel"
      ref={panelRef}
      className="tutorial-panel"
      role="dialog"
      aria-modal="false"
      aria-label={tr(def.title)}
      aria-live="polite"
      data-testid="tutorial"
      data-tutorial={tutorial.id}
      data-step={tutorial.step}
      style={{} as CSSProperties}
    >
      <div className="tutorial-head">
        <button
          type="button"
          className="tutorial-move"
          id="tutorialMove"
          title={tr('tutorialMove')}
          aria-label={tr('tutorialMove')}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
        >
          ⠿ <span id="tutorialProgress">{progress}</span>
        </button>
        <button
          type="button"
          id="tutorialClose"
          className="btn icon-btn"
          aria-label={tr('close')}
          onClick={stopTutorial}
        >
          ×
        </button>
      </div>
      {def.phases.length > 1 ? (
        <ol className="tutorial-phases" id="tutorialPhases" aria-label={tr(def.title)}>
          {def.phases.map((phase, i) => {
            const first = def.steps.findIndex((x) => x.phase === i);
            return (
              <li
                key={phase}
                className={i < step.phase || complete ? 'done' : i === step.phase ? 'current' : ''}
                aria-current={i === step.phase && !complete ? 'step' : undefined}
              >
                <button type="button" disabled={first > tutorial.furthest} onClick={() => goToPhase(i)}>
                  {tr(phase)}
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
      <h2 id="tutorialHeading">{tr(complete ? 'tutorialComplete' : def.title)}</h2>
      <p id="tutorialText">{tr(step.text) + hint}</p>
      <div className="tutorial-actions">
        <button
          type="button"
          className="btn quiet"
          id="tutorialBack"
          disabled={tutorial.step === 0}
          onClick={previousStep}
        >
          {tr('assessmentPrevious')}
        </button>
        {complete && def.next ? (
          <button
            type="button"
            className="btn quiet"
            id="tutorialContinue"
            onClick={() => void startTutorial(def.next!.id)}
          >
            {tr(def.next.label)}
          </button>
        ) : (
          <button
            type="button"
            className="btn quiet"
            id="tutorialTarget"
            hidden={complete}
            onClick={showTarget}
          >
            {tr('tutorialShowTarget')}
          </button>
        )}
        <button
          type="button"
          className={`btn ${step.manual || reviewing ? 'primary' : 'quiet'}`}
          id="tutorialNext"
          onClick={nextStep}
        >
          {tr(complete ? 'tutorialDone' : 'tutNext')}
        </button>
      </div>
    </aside>
  );
}
