// The guided practice (#tutorialPanel): the prototype's startTutorial / tutorialCheck / renderTutorial /
// tutorialShowTarget / initTutorialDrag (app.js 1125–1182, 1268–1320, 3918–3934). The session state lives in this
// module, outside React, so it survives the home ↔ workspace switch; the panel observes the store and advances a step
// when its condition holds in the document. Nothing here is persisted.
import { useEffect, useSyncExternalStore } from 'react';
import { personalCredence, personalInfluence } from '../domain/index.ts';
import type { Node, Project } from '../domain/index.ts';
import { translator } from '../lib/i18n/i18n.ts';
import type { MessageKey } from '../lib/i18n/i18n.ts';
import { newId } from '../lib/providers.ts';
import { addNode, arrangeTree, selectPresentation, startInlineEdit } from './actions.ts';
import { displayShortcut, readShortcuts } from './shortcuts.ts';
import { blankProject, getStore, useAppState, useTranslator } from './store.ts';
import type { AppState } from './store.ts';
import { LAYER_PRESETS } from './view.ts';

export const TUTORIAL_STEPS = 7;
/** The toolbar element each step points at (steps 0–3 point at cards instead). */
const ANCHORS: readonly (string | null)[] = [
  null,
  null,
  null,
  null,
  'btnWorkflowEvaluate',
  'btnTableView',
  'btnLayout',
  null,
];
const SUPPORT_DEFAULT_TITLE = 'Puoltava argumentti';
const OPPOSE_DEFAULT_TITLE = 'Vastustava argumentti';

export interface TutorialState {
  step: number;
  rootId: string;
  supportId: string | null;
  opposeId: string | null;
  messShown: boolean;
}
interface Snapshot {
  tutorial: TutorialState | null;
  position: { x: number; y: number } | null;
}
let snapshot: Snapshot = { tutorial: null, position: null };
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
export const tutorialState = (): TutorialState | null => snapshot.tutorial;
export function stopTutorial(): void {
  if (snapshot.tutorial) update({ tutorial: null });
}
const setStep = (step: number) => {
  if (snapshot.tutorial) update({ tutorial: { ...snapshot.tutorial, step } });
};

const t = () => translator(getStore().get().messages);

/** Replaces the active work (after the replacement dialog) with the practice document and opens step 1. */
export async function startTutorial(): Promise<void> {
  const store = getStore();
  const tr = t();
  if (!(await store.prepareReplacement(tr('newDocumentConfirm')))) return;
  const doc = blankProject('argument');
  const root = doc.nodes[0] as Node;
  const project: Project = {
    ...doc,
    title: tr('tutorialDocumentTitle'),
    nodes: [{ ...root, title: tr('tutorialRootClaim'), details: tr('tutorialRootDetail') }],
  };
  store.load(project);
  store.setView({ presentation: 'tree', workflow: 'explore', layers: { ...LAYER_PRESETS.text } });
  update({
    position: null,
    tutorial: { step: 0, rootId: root.id, supportId: null, opposeId: null, messShown: false },
  });
}

/** Step 6's deliberately disordered tree: two sample reasons if missing, root children heaped beside the root. */
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
  store.setView({ presentation: 'tree', orientation: 'horizontal', dockCollapsed: false });
  store.requestFit();
}

/** The prototype's `tutorialCheck`: advances when the document shows the step was done. */
function check(state: AppState): void {
  const current = snapshot.tutorial;
  if (!current) return;
  const { project } = state;
  const rootChildren = project.nodes.filter((n) => n.parentId === current.rootId);
  let next = current;
  if (next.step === 0) {
    const child = rootChildren.find((n) => n.relation === 'support');
    if (child) next = { ...next, supportId: child.id, step: 1 };
  }
  if (next.step === 1 && next.supportId) {
    const node = project.nodes.find((n) => n.id === next.supportId);
    if (node && node.title !== SUPPORT_DEFAULT_TITLE) next = { ...next, step: 2 };
  }
  if (next.step === 2) {
    const child = rootChildren.find((n) => n.relation === 'oppose');
    if (child) next = { ...next, opposeId: child.id, step: 3 };
  }
  if (next.step === 3 && next.opposeId) {
    const node = project.nodes.find((n) => n.id === next.opposeId);
    if (node && node.title !== OPPOSE_DEFAULT_TITLE) next = { ...next, step: 4 };
  }
  if (next.step === 4 && next.supportId && project.nodes.some((n) => n.id === next.supportId)) {
    const voted = personalCredence(project, next.supportId, state.actorId);
    const influence = personalInfluence(project, 'primary', next.supportId, state.actorId);
    if (voted && influence.current) next = { ...next, step: 5 };
  }
  let mess = false;
  if (next.step === 5 && state.view.presentation === 'table') {
    next = { ...next, step: 6 };
    mess = true;
  }
  if (next !== current) update({ tutorial: next });
  // The messy tree changes the document; let the store finish the notification that brought us here first.
  if (mess) queueMicrotask(showMessyTutorialTree);
}

/** "Näytä kohde": performs or focuses what the current step asks for. */
function showTarget(): void {
  const current = snapshot.tutorial;
  if (!current) return;
  const store = getStore();
  if (current.step === 0 || current.step === 2) {
    store.select(current.rootId);
    const relation = current.step === 0 ? 'support' : 'oppose';
    const action = document.querySelector<HTMLButtonElement>(
      `.node[data-id="${CSS.escape(current.rootId)}"] .node-add[data-relation="${relation}"]`
    );
    if (window.innerWidth <= 760 || !action?.getClientRects().length) addNode(relation, current.rootId);
    else action.focus({ preventScroll: true });
    return;
  }
  if (current.step === 1 || current.step === 3) {
    const id = current.step === 1 ? current.supportId : current.opposeId;
    if (id) {
      store.select(id);
      startInlineEdit(id);
    }
    return;
  }
  if (current.step === 4) {
    store.setView({ workflow: 'evaluate', layers: { ...LAYER_PRESETS.analysis } });
    if (current.supportId) store.select(current.supportId);
    return;
  }
  if (current.step === 5) selectPresentation('table');
  if (current.step === 6) {
    arrangeTree();
    setStep(7);
  }
}

/** "Ohita vaihe" / "Sulje opastus". */
function skipStep(): void {
  const current = snapshot.tutorial;
  if (!current) return;
  if (current.step === TUTORIAL_STEPS) {
    stopTutorial();
    return;
  }
  setStep(current.step + 1);
  if (current.step + 1 === 6) showMessyTutorialTree();
}

const clamp = (panel: HTMLElement, x: number, y: number) => ({
  x: Math.max(6, Math.min(x, window.innerWidth - panel.offsetWidth - 6)),
  y: Math.max(6, Math.min(y, window.innerHeight - panel.offsetHeight - 6)),
});

export function Tutorial() {
  const state = useAppState();
  const tr = useTranslator();
  const { tutorial, position } = useTutorial();
  const store = getStore();
  const visible = !!tutorial && !state.home;

  // Launch from the home screen and the Apua menu; a store subscription advances the steps.
  useEffect(() => {
    const onStart = () => void startTutorial();
    window.addEventListener('witt-tutorial', onStart);
    const unsubscribe = store.subscribe(() => check(store.get()));
    check(store.get());
    return () => {
      window.removeEventListener('witt-tutorial', onStart);
      unsubscribe();
    };
  }, [store]);

  // Step 6 completes when "Järjestä puu" is clicked (the prototype wires this onto the two arrange buttons).
  useEffect(() => {
    if (!visible || tutorial?.step !== 6) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('#btnArrangeQuick, #btnLayout')) setStep(7);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [visible, tutorial?.step]);

  // Highlights follow the rendered DOM: re-applied after every document or view change, cleared when gone.
  useEffect(() => {
    const clear = () =>
      document
        .querySelectorAll('.tutorial-highlight')
        .forEach((el) => el.classList.remove('tutorial-highlight'));
    clear();
    if (!visible || !tutorial) return clear;
    const targets: (Element | null)[] = [];
    const anchor = ANCHORS[tutorial.step];
    if (anchor) targets.push(document.getElementById(anchor));
    const card = (id: string) => document.querySelector(`.node[data-id="${CSS.escape(id)}"]`);
    const action = tutorial.step === 0 ? 'support' : tutorial.step === 2 ? 'oppose' : null;
    if (action)
      targets.push(card(tutorial.rootId)?.querySelector(`.node-add[data-relation="${action}"]`) ?? null);
    const editId = tutorial.step === 1 ? tutorial.supportId : tutorial.step === 3 ? tutorial.opposeId : null;
    if (editId) targets.push(card(editId));
    for (const target of targets) target?.classList.add('tutorial-highlight');
    return clear;
  }, [visible, tutorial, state.project, state.view, state.selectedId, state.inlineEditId]);

  // Re-clamp a moved panel when the window shrinks.
  useEffect(() => {
    if (!visible || !position) return;
    const onResize = () => {
      const panel = document.getElementById('tutorialPanel');
      if (panel) update({ position: clamp(panel, position.x, position.y) });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [visible, position]);

  if (!visible || !tutorial) return <aside id="tutorialPanel" className="tutorial-panel" hidden />;

  const shortcuts = readShortcuts(window.localStorage);
  const complete = tutorial.step === TUTORIAL_STEPS;
  const progress = complete
    ? tr('tutorialComplete')
    : tr('tutorialProgress', { current: tutorial.step + 1, total: TUTORIAL_STEPS });
  const hint =
    tutorial.step === 0
      ? ` (${displayShortcut(shortcuts.support)})`
      : tutorial.step === 2
        ? ` (${displayShortcut(shortcuts.oppose)})`
        : '';
  const text = tr(`tutorialStep${tutorial.step}` as MessageKey) + hint;
  const move = (dx: number, dy: number, panel: HTMLElement) => {
    const rect = panel.getBoundingClientRect();
    update({ position: clamp(panel, rect.left + dx, rect.top + dy) });
  };
  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const panel = handle.closest<HTMLElement>('#tutorialPanel');
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { x: rect.left, y: rect.top };
    handle.setPointerCapture(event.pointerId);
    const onMove = (ev: PointerEvent) =>
      update({ position: clamp(panel, origin.x + ev.clientX - startX, origin.y + ev.clientY - startY) });
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
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    const panel = event.currentTarget.closest<HTMLElement>('#tutorialPanel');
    if (panel) move(delta[0], delta[1], panel);
  };
  const style = position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined;
  return (
    <aside
      id="tutorialPanel"
      className="tutorial-panel"
      aria-label={tr('tutorialStart')}
      aria-live="polite"
      data-testid="tutorial"
      data-step={tutorial.step}
      style={style}
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
      <h2 id="tutorialHeading">{tr(complete ? 'tutorialComplete' : 'tutorialHeading')}</h2>
      <p id="tutorialText">{text}</p>
      <div className="tutorial-actions">
        <button
          type="button"
          className="btn quiet"
          id="tutorialTarget"
          hidden={complete}
          onClick={showTarget}
        >
          {tr('tutorialShowTarget')}
        </button>
        <button type="button" className="btn quiet" id="tutorialNext" onClick={skipStep}>
          {tr(complete ? 'tutorialDone' : 'tutorialSkip')}
        </button>
      </div>
    </aside>
  );
}
