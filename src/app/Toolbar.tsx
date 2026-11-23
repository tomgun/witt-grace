// The toolbar row: mode, stage, actor, presentation and the five menus, exactly as the prototype lays them out
// (inv-panels §D). Menu items that do not apply are disabled, not hidden, unless the prototype hides them.
import { servedOverWeb } from '../lib/embedded.ts';
import type { ReactNode } from 'react';
import { SCORING_OFFERED, childrenOf, isAiProfile, isPlainDocument } from '../domain/index.ts';
import type { ScoringVersion } from '../domain/index.ts';
import {
  ADD_LOCAL_USER,
  addDiagram,
  addNode,
  canEdit,
  chooseActor,
  choosePerspective,
  deleteNode,
  openRepeatLibrary,
  selectPresentation,
  setSubtreeCollapsed,
  setWorkflow,
  showViewDock,
  startInlineEdit,
  toggleFocus,
  toggleViewDock,
} from './actions.ts';
import { viewedAssessorId } from './derive.ts';
import { scoringText } from './scoringText.ts';
import type { Frame } from './projection.ts';
import { displayShortcut } from './shortcuts.ts';
import type { Shortcuts } from './shortcuts.ts';
import { MENU_GROUP } from './menus.ts';
import { getStore, useAppState, useTranslator } from './store.ts';

function Menu({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <details id={id} name={MENU_GROUP} className="toolbar-popover" data-testid={`menu-${id}`}>
      <summary>{label}</summary>
      <div
        className="toolbar-popup"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button'))
            (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}
const Item = ({
  id,
  onClick,
  disabled,
  hidden,
  children,
  kbd,
  title,
}: {
  id: string;
  onClick: () => void;
  disabled?: boolean;
  hidden?: boolean;
  children: ReactNode;
  kbd?: string;
  title?: string;
}) => (
  <>
    <button
      type="button"
      className="btn quiet"
      id={id}
      data-testid={id}
      onClick={onClick}
      disabled={disabled}
      hidden={hidden}
      title={title}
    >
      {children}
    </button>
    {kbd && !hidden ? <kbd>{kbd}</kbd> : null}
  </>
);

export function Toolbar({ frame, shortcuts }: { frame: Frame; shortcuts: Shortcuts }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, view } = state;
  const editable = canEdit(state);
  const inSession = !!state.collab && state.collab.phase !== 'ended';
  const selected = project.nodes.find((n) => n.id === state.selectedId);
  const root = project.nodes.find((n) => n.parentId === null);
  const aiProfiles = project.users.filter((u) => isAiProfile(u));
  const current = project.users.find((u) => u.id === state.actorId);
  const perspective =
    view.indexMode === 'personal' &&
    view.viewAssessorId &&
    view.viewAssessorId !== state.actorId &&
    project.users.some((u) => u.id === view.viewAssessorId)
      ? `assessor:${view.viewAssessorId}`
      : view.indexMode;
  const inspected =
    view.indexMode === 'personal'
      ? project.users.find((u) => u.id === viewedAssessorId(project, view, state.actorId))
      : undefined;
  return (
    <>
      <div
        className="toolbar witt-simplified-toolbar"
        role="region"
        aria-label={t('toolbarEditGroup')}
        data-testid="toolbar"
      >
        <div className="toolbar-group toolbar-flow" role="group" aria-label={t('workflow')}>
          <span className="toolbar-caption">{t('stageLabel')}</span>
          <div className="workflow-switch workflow-stages" role="group" aria-label={t('workflow')}>
            <button
              type="button"
              id="btnWorkflowExplore"
              data-workflow="explore"
              className={view.workflow === 'explore' ? 'active' : ''}
              aria-pressed={view.workflow === 'explore'}
              onClick={() => setWorkflow('explore')}
            >
              {t('explore')}
            </button>
            <button
              type="button"
              id="btnWorkflowEvaluate"
              data-workflow="evaluate"
              className={view.workflow === 'evaluate' ? 'active' : ''}
              aria-pressed={view.workflow === 'evaluate'}
              onClick={() => setWorkflow('evaluate')}
            >
              {t('evaluate')}
            </button>
            {project.mode === 'decision' ? (
              <button
                type="button"
                className="workflow-vote"
                id="btnVoting"
                data-testid="btnVoting"
                onClick={() => store.openDialog('vote')}
              >
                {t('votingButton')}
              </button>
            ) : null}
          </div>
          <label className="visually-hidden" htmlFor="actorSelect">
            {t('profileSelect')}
          </label>
          <select
            id="actorSelect"
            className="profile-select"
            data-testid="actor-select"
            title={t('profileSelect')}
            aria-label={t('profileSelect')}
            value={state.actorId}
            disabled={state.collab?.role === 'participant' && state.collab.phase !== 'ended'}
            onChange={(e) => void chooseActor(e.target.value)}
          >
            {project.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {isAiProfile(u) ? ' · AI' : ''}
              </option>
            ))}
            <option value={ADD_LOCAL_USER}>{t('profileAddLocalOption')}</option>
          </select>
        </div>
        <div className="toolbar-group toolbar-presentation" role="group" aria-label={t('tableViewGroup')}>
          <div className="table-switch" role="group" aria-label={t('tableViewGroup')}>
            <button
              type="button"
              id="btnTreeView"
              data-testid="layout-tree"
              className={`btn quiet${view.presentation === 'tree' ? ' active' : ''}`}
              aria-pressed={view.presentation === 'tree'}
              title={shortcuts.table}
              onClick={() => selectPresentation('tree')}
            >
              {t('treeView')}
            </button>
            <button
              type="button"
              id="btnTableView"
              data-testid="layout-table"
              className={`btn quiet${view.presentation === 'table' ? ' active' : ''}`}
              aria-pressed={view.presentation === 'table'}
              title={shortcuts.table}
              onClick={() => selectPresentation('table')}
            >
              {t('tableView')}
            </button>
          </div>
          <button
            type="button"
            className="btn quiet"
            id="btnViewSettings"
            data-testid="btnViewSettings"
            aria-controls="viewDock"
            aria-expanded={!view.dockHidden}
            aria-pressed={!view.dockHidden}
            onClick={toggleViewDock}
          >
            {t('viewSettingsButton')}
          </button>
          {aiProfiles.length ? (
            <button
              type="button"
              className="btn quiet ai-results-shortcut"
              id="btnAIResults"
              onClick={() => store.openDialog('aiResults')}
            >
              {t('aiAssessmentsButton')}
              {aiProfiles.length > 1 ? ` (${aiProfiles.length})` : ''}
            </button>
          ) : null}
        </div>
        <div className="toolbar-group toolbar-simple-menus">
          <Menu id="fileMenu" label={t('toolbarFileGroup')}>
            <Item id="btnNew" onClick={() => store.openDialog('newWork')}>
              {t('new')}
            </Item>
            <Item id="btnOpen" onClick={() => window.dispatchEvent(new CustomEvent('witt-open-file'))}>
              {t('openJson')}
            </Item>
            <Item
              id="btnSave"
              onClick={() => window.dispatchEvent(new CustomEvent('witt-save-file'))}
              kbd="Ctrl/Cmd+S"
              title="Ctrl/Cmd+S"
            >
              {t('saveFile')}
            </Item>
            <Item
              id="btnSaveDiagram"
              hidden={isPlainDocument(state.workbook)}
              onClick={() => window.dispatchEvent(new CustomEvent('witt-save-diagram'))}
            >
              {t('saveDiagramAlone')}
            </Item>
            <Item
              id="btnRestoreOwn"
              hidden={!state.aside}
              disabled={inSession}
              onClick={() => store.restoreOwnProject()}
            >
              {t('restoreOwnProject')}
            </Item>
            <Item id="btnAddDiagram" onClick={addDiagram}>
              {t('addDiagram')}
            </Item>
            <Item
              id="btnAttach"
              onClick={() => window.dispatchEvent(new CustomEvent('witt-attach-file'))}
              disabled={inSession && state.collab?.role === 'participant'}
            >
              {t('attachToProject')}
            </Item>
            {servedOverWeb(window.location.protocol) ? (
              <Item id="btnCopyLink" onClick={() => window.dispatchEvent(new CustomEvent('witt-copy-link'))}>
                {t('docLinkCopy')}
              </Item>
            ) : null}
            <Item id="btnExportVisual" onClick={() => store.openDialog('visualExport')}>
              {t('exportVisual')}
            </Item>
            <Item id="btnLibrary" onClick={() => store.openDialog('library')}>
              {t('documentLibrary')}
            </Item>
            <Item id="btnCollab" onClick={() => store.openDialog('collab')}>
              {state.collab && state.collab.phase !== 'ended' ? t('collabManage') : t('collabInvite')}
            </Item>
            <div className="menu-divider" />
            <Item id="btnAIReview" onClick={() => store.openDialog('aiReview')}>
              {t('aiProposalMenu')}
            </Item>
            <div className="menu-divider" />
            <span className="save-status" id="saveStatus" role="status" data-testid="save-status">
              {t(state.saveStatus)}
            </span>
          </Menu>
          <Menu id="editMenu" label={t('toolbarEditGroup')}>
            <Item id="btnEditMenuSelected" onClick={() => startInlineEdit(state.selectedId)}>
              {t('editArgument')}
            </Item>
            <Item
              id="btnEditMenuSupport"
              onClick={() => addNode('support')}
              disabled={!editable || selected?.kind === 'group'}
              kbd={displayShortcut(shortcuts.support)}
            >
              {t('supportAdd')}
            </Item>
            <Item
              id="btnEditMenuOppose"
              onClick={() => addNode('oppose')}
              disabled={!editable || selected?.kind === 'group'}
              kbd={displayShortcut(shortcuts.oppose)}
            >
              {t('opposeAdd')}
            </Item>
            <Item
              id="btnEditMenuNeutral"
              onClick={() => addNode('neutral')}
              disabled={!editable || selected?.kind === 'group'}
            >
              {t('neutralAdd')}
            </Item>
            <Item
              id="btnEditMenuOption"
              onClick={() => addNode('option', root?.id)}
              hidden={project.mode !== 'decision'}
              disabled={!editable || project.votingRound?.status === 'open'}
            >
              {t('optionShort')}
            </Item>
            <div className="menu-divider" />
            <Item id="btnContextMenu" onClick={openRepeatLibrary}>
              {t('contextOpen')}
            </Item>
            <Item
              id="btnEditMenuMove"
              onClick={() => store.openModal({ kind: 'move', nodeId: state.selectedId })}
              disabled={!selected?.parentId || !editable}
            >
              {t('moveSubtree')}
            </Item>
            <Item
              id="btnEditMenuCollapse"
              onClick={() => setSubtreeCollapsed(state.selectedId)}
              disabled={!selected || !childrenOf(project, selected.id).length}
            >
              {t(selected && frame.isNodeCollapsed(selected) ? 'expandSubtree' : 'collapseSubtree')}
            </Item>
            <Item
              id="btnEditMenuDelete"
              onClick={() => void deleteNode(state.selectedId)}
              disabled={!selected?.parentId || !editable}
              kbd="Del"
            >
              {t('deleteSubtree')}
            </Item>
            <div className="menu-divider" />
            <Item id="btnUndo" onClick={() => store.undo()} disabled={!state.canUndo} kbd="Ctrl/Cmd+Z">
              {t('undo')}
            </Item>
            <Item id="btnRedo" onClick={() => store.redo()} disabled={!state.canRedo} kbd="Ctrl/Cmd+Shift+Z">
              {t('redo')}
            </Item>
            <Item id="btnHistory" onClick={() => store.openDialog('history')} disabled={inSession}>
              {t('historyMenu')}
            </Item>
          </Menu>
          <Menu id="assessmentMenu" label={t('toolbarAssessGroup')}>
            <Item id="btnPeople" onClick={() => store.openDialog('people')} title={t('profileManage')}>
              {t('profileManage')}
            </Item>
            <Item
              id="btnAssess"
              onClick={() => store.openDialog('assessment')}
              disabled={!editable}
              kbd={displayShortcut(shortcuts.assessment)}
              title={`${t('assessmentStart')} (${displayShortcut(shortcuts.assessment)})`}
            >
              {t('assessmentStart')}
            </Item>
            <Item
              id="btnReviewLens"
              onClick={() => store.openDialog('reviewLens')}
              title={t(frame.lens.filtered ? 'lensFilteredHint' : 'lensAllHint')}
            >
              {t('reviewLens')}
              {frame.lens.filtered ? ` · ${frame.lens.selectedCount}/${frame.lens.totalCount}` : ''}
            </Item>
            <label className="menu-label" htmlFor="indexModeSelect">
              {t('indexDisplay')}
            </label>
            <select
              id="indexModeSelect"
              data-testid="viewpoint-select"
              aria-label={t('indexDisplay')}
              value={perspective}
              onChange={(e) => choosePerspective(e.target.value)}
            >
              <option value="shared">
                {t('indexShared')}
                {aiProfiles.length ? ` · ${t('humanReviewOnly')}` : ''}
              </option>
              <option value="personal">
                {t('indexPersonal')} · {current?.name ?? ''}
              </option>
              {project.users
                .filter((u) => u.id !== state.actorId)
                .map((u) => (
                  <option key={u.id} value={`assessor:${u.id}`}>
                    {isAiProfile(u) && !u.name.startsWith('AI') ? `AI · ${u.name}` : u.name}
                  </option>
                ))}
            </select>
            <label className="menu-label" htmlFor="scoringSelect" title={t('scoringHint')}>
              {t('scoringLabel')}
            </label>
            <select
              id="scoringSelect"
              data-testid="scoring-select"
              aria-label={t('scoringLabel')}
              aria-describedby="scoringNote"
              title={t('scoringHint')}
              value={project.settings.scoring}
              disabled={!editable}
              onChange={(e) =>
                store.dispatch({ type: 'project.setScoring', scoring: e.target.value as ScoringVersion })
              }
            >
              {SCORING_OFFERED.map((v) => (
                <option key={v} value={v}>
                  {t(scoringText(v).label)}
                </option>
              ))}
            </select>
            <p id="scoringNote" className="inspector-note" data-testid="scoring-note">
              {t(scoringText(project.settings.scoring).note)}
            </p>
          </Menu>
          <Menu id="viewMenu" label={t('toolbarViewGroup')}>
            <Item id="btnViewPanelMenu" onClick={showViewDock} kbd="Alt+V">
              {t('viewSettingsButton')}
            </Item>
            <Item
              id="btnFocusView"
              onClick={() => toggleFocus()}
              kbd={shortcuts.focus}
              title={shortcuts.focus}
            >
              ⛶ {t(state.focusOnly ? 'exitFocus' : 'focusTree')}
            </Item>
            <label className="toolbar-importance">
              <input
                type="checkbox"
                id="aiOptionHighlights"
                checked={!!view.highlightOptions}
                disabled={view.indexMode !== 'personal' || project.mode !== 'decision'}
                onChange={(e) => store.setView({ highlightOptions: e.target.checked })}
              />
              <span>{t('highlightTopOptions')}</span>
            </label>
            <label className="toolbar-importance">
              <input
                type="checkbox"
                id="importantToggle"
                checked={view.showImportance}
                onChange={(e) => store.setView({ showImportance: e.target.checked })}
              />
              <span>{t('importantHighlight')}</span>
            </label>
            <label className="toolbar-importance">
              <input
                type="checkbox"
                id="showAuthors"
                checked={project.settings.showAuthors !== false}
                onChange={(e) =>
                  store.dispatch({ type: 'project.setShowAuthors', showAuthors: e.target.checked })
                }
              />
              <span>{t('showAuthors')}</span>
            </label>
            <Item id="btnSketchMenu" onClick={() => window.dispatchEvent(new CustomEvent('witt-sketch'))}>
              {t('sketchTitle')}
            </Item>
          </Menu>
          <Menu id="helpMenu" label={t('toolbarHelpGroup')}>
            <Item id="btnDemo" onClick={() => store.openDialog('examples')}>
              {t('example')}
            </Item>
            <Item id="btnTutorial" onClick={() => window.dispatchEvent(new CustomEvent('witt-tutorial'))}>
              {t('tutorialStart')}
            </Item>
            <Item
              id="btnTutorialDecision"
              onClick={() => window.dispatchEvent(new CustomEvent('witt-tutorial', { detail: 'decision' }))}
            >
              {t('tutMenuDecision')}
            </Item>
            <Item
              id="btnTutorialPeople"
              onClick={() => window.dispatchEvent(new CustomEvent('witt-tutorial', { detail: 'people' }))}
            >
              {t('tutMenuPeople')}
            </Item>
            <Item
              id="btnTutorialCollab"
              onClick={() => window.dispatchEvent(new CustomEvent('witt-tutorial', { detail: 'collab' }))}
            >
              {t('tutMenuCollab')}
            </Item>
            <Item
              id="btnKeyboardTop"
              onClick={() => store.openDialog('help')}
              kbd={shortcuts.help}
              title={`${t('shortcutsButton')} (${shortcuts.help})`}
            >
              {t('shortcutsButton')}
            </Item>
            <Item id="btnAboutMenu" onClick={() => store.openDialog('about')}>
              {t('aboutMenu')}
            </Item>
          </Menu>
        </div>
      </div>
      {frame.mutedIds.size ? (
        <div id="muteBanner" className="analysis-perspective-banner" role="status">
          <span id="muteBannerLabel">{t('muteBanner', { count: frame.mutedIds.size })}</span>
          <button
            type="button"
            id="btnUnmuteAll"
            className="btn quiet"
            onClick={() => store.toggleMuted(null)}
          >
            {t('muteClear')}
          </button>
        </div>
      ) : null}
      {inspected && inspected.id !== state.actorId ? (
        <div id="analysisPerspectiveBanner" className="analysis-perspective-banner" role="status">
          <span id="analysisPerspectiveLabel">
            {t('viewingPerspective', { name: inspected.name })} ·{' '}
            {t('editingAs', { name: current?.name ?? '' })}
          </span>
          <button
            type="button"
            id="btnPerspectiveOwn"
            className="btn quiet"
            onClick={() => choosePerspective('personal')}
          >
            {t('backToOwnReviews')}
          </button>
        </div>
      ) : null}
    </>
  );
}
