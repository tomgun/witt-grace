// The prototype's workspace actions as functions over the store (inv-canvas §2, §5; inv-panels §A.4, §D). Every
// document change is one command; everything else is session or view state.
import {
  CARD_W,
  SCORING_VERSION,
  canAttachReasonConcept,
  canReparent,
  childrenOf,
  createBlankProject,
  descendants,
  fourWayProjection,
  rootNode,
  stableFourWayAddition,
} from '../domain/index.ts';
import type { Node, Project, Stance } from '../domain/index.ts';
import { translator } from '../lib/i18n/i18n.ts';
import { newId, nowIso } from '../lib/providers.ts';
import { fadeOutCards } from './fade.ts';
import { buildFrame } from './projection.ts';
import { getStore } from './store.ts';
import type { AppState, LibrarySelection } from './store.ts';
import { LAYER_PRESETS } from './view.ts';
import type { IndexMode, Presentation, Workflow } from './view.ts';

type AddRelation = Exclude<Stance, 'root'>;
const t = () => translator(getStore().get().messages);
const frameOf = (state: AppState) => buildFrame(state.project, state.view, state);

export const canEdit = (state: AppState = getStore().get()): boolean =>
  state.project.users.find((u) => u.id === state.actorId)?.role !== 'viewer';
export const isOwner = (state: AppState = getStore().get()): boolean =>
  state.project.users.find((u) => u.id === state.actorId)?.role === 'owner';
export const selectedNode = (state: AppState = getStore().get()): Node | undefined =>
  state.project.nodes.find((n) => n.id === state.selectedId);

/** `addNode`: leaves depth and compact modes, keeps every four-way card in place, selects and edits the new node. */
export function addNode(relation: AddRelation, parentId?: string, semanticType?: 'value'): string | null {
  const store = getStore();
  const state = store.get();
  const parent = parentId ?? state.selectedId;
  if (!canEdit(state)) {
    store.showMessage(t()('viewerCannotEdit'));
    return null;
  }
  if (state.view.depthLimit !== null) {
    store.setDepthOverrides(new Map());
    store.setView({ depthLimit: null });
  }
  if (store.get().view.compactVisible) store.setView({ compactVisible: false });
  const id = newId();
  const before = store.get();
  const fourWay = before.view.orientation === 'four-way';
  const oldFrame = fourWay ? frameOf(before) : null;
  store.select(parent);
  // A new neutral reason starts as an unrated note (owner 2026-11-10).
  const unrated = relation === 'neutral' && !semanticType ? true : undefined;
  if (!store.dispatch({ type: 'node.add', id, parentId: parent, relation, semanticType, unrated }))
    return null;
  if (fourWay && oldFrame) {
    const project = store.get().project;
    const root = rootNode(project) as Node;
    const baseline = fourWayProjection(project.nodes, root.id, CARD_W, oldFrame.cardH).positions;
    try {
      const stable = stableFourWayAddition(
        project.nodes,
        oldFrame.positions,
        oldFrame.directions,
        baseline,
        parent,
        id,
        CARD_W,
        oldFrame.cardH
      );
      const offsets: Record<string, { x: number; y: number }> = {};
      for (const [nodeId, pos] of stable) {
        const base = baseline.get(nodeId);
        if (base) offsets[nodeId] = { x: pos.x - base.x, y: pos.y - base.y };
      }
      store.dispatch({ type: 'layout.fourWay', offsets });
    } catch {
      // the default projection stands
    }
  }
  // In a collaboration the node exists once the host commits it.
  store.afterNode(id, () => {
    store.select(id);
    startInlineEdit(id);
  });
  return id;
}

export async function deleteNode(nodeId: string): Promise<void> {
  const store = getStore();
  const state = store.get();
  const node = state.project.nodes.find((n) => n.id === nodeId);
  if (!node || node.parentId === null) return;
  if (!canEdit(state)) {
    store.showMessage(t()('viewerCannotEdit'));
    return;
  }
  const removed = descendants(state.project, nodeId);
  // A leaf goes at once (undo brings it back); a subtree still asks, since it takes more than the visible card.
  if (
    removed.length &&
    !(await store.askConfirm(t()('deleteSubtreeConfirm', { title: node.title, count: removed.length })))
  )
    return;
  fadeOutCards([nodeId, ...removed]);
  store.select(node.parentId);
  if (store.dispatch({ type: 'node.remove', id: nodeId }))
    // A leaf goes without a question, so the way back is said aloud (S-15, 2026-11-19).
    store.notify({ kind: 'info', text: t()('deletedNotice', { title: node.title }), undo: true });
}

export function startInlineEdit(nodeId: string): void {
  const store = getStore();
  const state = store.get();
  const node = state.project.nodes.find((n) => n.id === nodeId);
  if (!node || node.sharedReasonId || node.reasonConceptId || !canEdit(state) || state.inlineEditId) return;
  if (state.selectedId !== nodeId) store.select(nodeId);
  store.setInlineEdit(nodeId);
}

/** Collapse is a document change (undoable) except under a depth limit, where it is a view override. */
export function setSubtreeCollapsed(nodeId: string, collapsed?: boolean): void {
  const store = getStore();
  const state = store.get();
  const { project } = state;
  const node = project.nodes.find((n) => n.id === nodeId);
  if (!node || !childrenOf(project, nodeId).length) return;
  const frame = frameOf(state);
  const next = collapsed ?? !frame.isNodeCollapsed(node);
  const inside = descendants(project, nodeId).includes(state.selectedId);
  if (state.view.depthLimit !== null) {
    const overrides = new Map(state.depthOverrides);
    overrides.set(nodeId, next);
    store.setDepthOverrides(overrides);
    if (next && inside) store.select(nodeId);
    store.requestFit();
    return;
  }
  if (!canEdit(state)) {
    store.showMessage(t()('viewerCannotEdit'));
    return;
  }
  store.setTableReveal(null);
  // The pressed card stays where it is on screen while the rest is laid out again (Canvas.tsx).
  window.dispatchEvent(new CustomEvent('witt-camera', { detail: { kind: 'hold', id: nodeId } }));
  const closed = new Set(state.explicitlyClosedIds);
  if (next) {
    closed.add(nodeId);
    if (inside) store.select(nodeId);
  } else closed.delete(nodeId);
  store.setExplicitlyClosed(closed);
  store.dispatch({ type: 'node.collapse', id: nodeId, collapsed: next });
}

/** "Näytä vain päätösvaihtoehdot" / "Avaa vaihtoehtojen perustelut". */
export function toggleOptionBranches(): void {
  const store = getStore();
  const state = store.get();
  const { project } = state;
  const options = project.nodes.filter((n) => n.relation === 'option' && childrenOf(project, n.id).length);
  if (!options.length) return;
  const frame = frameOf(state);
  const collapse = options.some((n) => !frame.isNodeCollapsed(n));
  const insideOption = options.some((o) => descendants(project, o.id).includes(state.selectedId));
  if (state.view.depthLimit !== null) {
    const overrides = new Map(state.depthOverrides);
    for (const option of options) overrides.set(option.id, collapse);
    store.setDepthOverrides(overrides);
    if (collapse && insideOption) store.select(frame.rootId);
    store.requestFit();
    return;
  }
  if (!canEdit(state)) {
    store.showMessage(t()('viewerCannotEdit'));
    return;
  }
  if (collapse && insideOption) store.select(frame.rootId);
  store.setTableReveal(null);
  const closed = new Set(state.explicitlyClosedIds);
  for (const option of options)
    if (collapse) closed.add(option.id);
    else closed.delete(option.id);
  store.setExplicitlyClosed(closed);
  store.setView({ compactVisible: collapse });
  let changed = false;
  for (const option of options)
    if (option.collapsed !== collapse) {
      store.dispatch({ type: 'node.collapse', id: option.id, collapsed: collapse });
      changed = true;
    }
  if (!changed) store.requestFit();
  else store.requestFit();
}

/** "Järjestä puu": compacts the visible projection when something is closed, otherwise re-lays the document out. */
export function arrangeTree(): void {
  const store = getStore();
  const state = store.get();
  if (state.view.depthLimit !== null) {
    store.setView({ depthCompact: true });
    store.requestFit();
    return;
  }
  if (state.project.nodes.some((n) => n.collapsed) && state.view.focus.mode === 'all') {
    store.setView({ compactVisible: true });
    store.requestFit();
    return;
  }
  store.setView({ compactVisible: false });
  if (!canEdit(state)) {
    store.showMessage(t()('viewerCannotEdit'));
    return;
  }
  if (state.view.orientation === 'four-way') store.dispatch({ type: 'layout.fourWay', offsets: {} });
  else store.dispatch({ type: 'layout.auto' });
  store.requestFit();
  // Said aloud for the walkthrough's arrange step, however the arranging was started (button, menu, Alt+A).
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('witt-arranged'));
}

export function toggleCompactVisible(): void {
  const store = getStore();
  const { view } = store.get();
  if (view.depthLimit !== null) store.setView({ depthCompact: !view.depthCompact });
  else store.setView({ compactVisible: !view.compactVisible });
  store.requestFit();
}

export function selectPresentation(next: Presentation): void {
  const store = getStore();
  const state = store.get();
  if (state.view.presentation === next) return;
  store.setView({ presentation: next });
  if (next === 'table') {
    store.setFocusOnly(false);
    store.setTableReveal(null);
  } else store.requestFit();
}

export function toggleFocus(force?: boolean): void {
  const store = getStore();
  store.setFocusOnly(force ?? !store.get().focusOnly);
}

/** Kartoita = text layers + comments; Punnitse = analysis layers + comments. */
export function setWorkflow(next: Workflow): void {
  const store = getStore();
  store.setView({
    workflow: next,
    layers: { ...LAYER_PRESETS[next === 'explore' ? 'text' : 'analysis'], comments: true },
  });
  store.requestFit();
}

/** Every other way into Punnitse (an example, the assessment round, a use opened from the library): the cards show
 * the ratings and the result there, as after the toolbar's button; a view already in Punnitse keeps its layers. */
export function enterEvaluate(): void {
  if (getStore().get().view.workflow !== 'evaluate') setWorkflow('evaluate');
}

export function choosePerspective(value: string): void {
  const store = getStore();
  if (value === 'shared' || value === 'personal')
    store.setView({ indexMode: value as IndexMode, viewAssessorId: null });
  else if (value.startsWith('assessor:'))
    store.setView({ indexMode: 'personal', viewAssessorId: value.slice(9) });
}

export const ADD_LOCAL_USER = '__add_local_user__';
export async function addLocalProfile(): Promise<string | null> {
  const store = getStore();
  const tr = t();
  const name = (await store.askText(tr('profileNewPrompt'), tr('profileAdd'), tr('profileAdd')))?.trim();
  if (!name) return null;
  const users = store.get().project.users;
  if (name.length > 120 || users.some((u) => u.name.toLowerCase() === name.toLowerCase())) {
    store.showMessage(tr('profileNameTaken'));
    return null;
  }
  const id = newId();
  if (!store.dispatch({ type: 'user.add', id, name, shares: 1, role: 'editor' })) return null;
  store.setActor(id);
  return id;
}
export async function chooseActor(value: string): Promise<void> {
  const store = getStore();
  const state = store.get();
  if (value === ADD_LOCAL_USER) {
    if (!isOwner(state)) {
      store.showMessage(t()('viewerCannotEdit'));
      return;
    }
    if (state.project.users.length >= 100) {
      store.showMessage(t()('profileNameTaken'));
      return;
    }
    await addLocalProfile();
    return;
  }
  store.setActor(value);
}

export function toggleViewDock(): void {
  const store = getStore();
  if (store.get().view.dockHidden) showViewDock();
  else store.setView({ dockHidden: true });
}
export function showViewDock(): void {
  const store = getStore();
  if (store.get().view.presentation === 'table') selectPresentation('tree');
  store.setView({ dockHidden: false, dockCollapsed: false });
}

/** Reasons from the library: who may be attached where. */
export function canAttachLibraryReason(
  project: Project,
  selection: LibrarySelection,
  targetId: string,
  editable: boolean
): boolean {
  const parent = project.nodes.find((n) => n.id === targetId);
  if (!parent || !editable) return false;
  if (!['claim', 'option'].includes(parent.kind) || parent.sharedReasonId) return false;
  if (selection.type === 'concept') {
    if (!(project.reasonConcepts ?? []).some((r) => r.id === selection.id)) return false;
    if (parent.reasonConceptId === selection.id) return false;
    return canAttachReasonConcept(project, selection.id, targetId);
  }
  if (selection.type === 'locked') {
    if (!(project.sharedReasons ?? []).some((r) => r.id === selection.id)) return false;
    return !project.nodes.some((n) => n.parentId === targetId && n.sharedReasonId === selection.id);
  }
  return false;
}
export function attachLibraryReason(selection: LibrarySelection, targetId: string): string | null {
  const store = getStore();
  const state = store.get();
  const tr = t();
  if (!canAttachLibraryReason(state.project, selection, targetId, canEdit(state))) {
    store.showMessage(tr('repeatInvalidTarget'));
    return null;
  }
  const nodeId = newId();
  const ok =
    selection.type === 'concept'
      ? store.dispatch({ type: 'concept.attach', id: selection.id, parentId: targetId, nodeId })
      : store.dispatch({ type: 'shared.attach', id: selection.id, parentId: targetId, nodeId });
  if (!ok) return null;
  // Open the target and every ancestor so the new use is visible.
  const project = store.get().project;
  const byId = new Map(project.nodes.map((n) => [n.id, n]));
  const closed = new Set(store.get().explicitlyClosedIds);
  for (let node = byId.get(targetId); node; node = node.parentId ? byId.get(node.parentId) : undefined) {
    if (node.collapsed) store.dispatch({ type: 'node.collapse', id: node.id, collapsed: false });
    closed.delete(node.id);
  }
  store.setExplicitlyClosed(closed);
  store.setDepthOverrides(new Map());
  store.selectLibraryReason(null);
  store.select(nodeId);
  store.setView({
    workflow: 'evaluate',
    showRecurringInTree: true,
    presentation: 'tree',
    depthLimit: null,
    compactVisible: false,
    focus: { ...store.get().view.focus, mode: 'all' },
  });
  store.requestCenter(nodeId);
  return nodeId;
}
/** "Liitä myös muihin solmuihin…": promotes a plain claim to a concept and opens it in the library. */
export function reuseFromTreeNode(nodeId: string): void {
  const store = getStore();
  const state = store.get();
  const node = state.project.nodes.find((n) => n.id === nodeId);
  if (!node || node.kind !== 'claim' || !node.parentId || node.sharedReasonId) {
    store.showMessage(t()('repeatInvalidTarget'));
    return;
  }
  let conceptId = node.reasonConceptId ?? null;
  if (!conceptId) {
    conceptId = newId();
    if (!store.dispatch({ type: 'concept.promote', nodeId, conceptId })) return;
  }
  store.select(nodeId);
  store.selectLibraryReason({ type: 'concept', id: conceptId });
  store.setView({ presentation: 'tree', showRecurringInTree: true });
  requestAnimationFrame(() => document.querySelector<HTMLSelectElement>('#repeatAttachTarget')?.focus());
}
export function openRepeatLibrary(): void {
  const store = getStore();
  store.setLeftTab('repeat');
  store.setZones({ left: true });
  if (store.get().view.presentation !== 'tree') store.setView({ presentation: 'tree' });
}

export function moveTargets(project: Project, nodeId: string): Node[] {
  return project.nodes.filter((n) => canReparent(project, nodeId, n.id));
}

// ---- Project tabs (WG-059) -------------------------------------------------------------------------------------

/** A new empty diagram in a tab of its own, of the shown diagram's type and with the same people (the same stable
 * ids), so a person is one person across the project's diagrams. Its question opens for writing. */
export function addDiagram(): void {
  const store = getStore();
  const state = store.get();
  const blank = createBlankProject({
    mode: state.project.mode,
    projectId: newId(),
    rootId: newId(),
    userId: state.actorId,
    now: nowIso(),
    scoring: SCORING_VERSION,
  });
  if (store.attachTabs([{ ...blank, users: state.project.users }]) === 0) return;
  const root = blank.nodes.find((n) => n.parentId === null);
  if (root && store.get().view.presentation === 'tree')
    requestAnimationFrame(() => requestAnimationFrame(() => store.setInlineEdit(root.id)));
}

/** Remove a tab's diagram from the project after a confirmation that names it; undo brings it back. */
export async function removeDiagram(index: number): Promise<void> {
  const store = getStore();
  const document = store.get().workbook.documents[index];
  if (!document) return;
  if (!(await store.askConfirm(t()('tabCloseConfirm', { title: document.title })))) return;
  // The tabs may have changed while the question was open: remove the diagram that was named.
  const now = store.get().workbook.documents.findIndex((d) => d.id === document.id);
  if (now !== -1) store.removeTab(now);
}

/** Rename the shown diagram: its title is the document's own title (the main claim's card is not touched). */
export async function renameDiagram(): Promise<void> {
  const store = getStore();
  const state = store.get();
  if (!canEdit(state)) {
    store.showMessage(t()('viewerCannotEdit'));
    return;
  }
  const title = await store.askText(
    t()('tabRename'),
    t()('tabRenameAction'),
    t()('tabRenameAction'),
    state.project.title
  );
  if (title) store.dispatch({ type: 'project.setTitle', title });
}

export async function renameProject(): Promise<void> {
  const store = getStore();
  const title = await store.askText(
    t()('projectRenamePrompt'),
    t()('projectRename'),
    t()('projectRenameAction'),
    store.get().workbook.title
  );
  if (title !== null) store.renameProject(title);
}

/** A new sketchpad in the project, opened at once for drawing. */
export function addSketchpad(): void {
  const store = getStore();
  const id = store.addProjectSketch(
    t()('sketchDefaultName', { n: store.get().workbook.sketches.length + 1 })
  );
  if (id) window.dispatchEvent(new CustomEvent('witt-sketch', { detail: `project:${id}` }));
}
