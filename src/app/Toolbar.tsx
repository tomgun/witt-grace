import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  isAiProfile,
  rootNode,
  serializeProjectFile,
  exportFilename,
  parseProject,
} from '../domain/index.ts';
import type { Mode } from '../domain/index.ts';
import { downloadText, pickTextFile } from '../lib/files.ts';
import { newId } from '../lib/providers.ts';
import { Modal } from './dialogs.tsx';
import { blankProject, getStore, useAppState, useTranslator } from './store.ts';
import type { Viewpoint } from './store.ts';

function Menu({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <details className="toolbar-popover" data-testid={`menu-${id}`}>
      <summary>{label}</summary>
      <div
        className="toolbar-popup"
        role="menu"
        onClick={(e) => ((e.currentTarget.closest('details') as HTMLDetailsElement).open = false)}
      >
        {children}
      </div>
    </details>
  );
}
const MenuButton = ({
  onClick,
  disabled,
  children,
  testId,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  testId?: string;
}) => (
  <button
    type="button"
    className="btn quiet"
    role="menuitem"
    onClick={onClick}
    disabled={disabled}
    data-testid={testId}
  >
    {children}
  </button>
);

export function Toolbar({
  onAdd,
  onDeleteSelected,
  onShortcuts,
}: {
  onAdd: (relation: 'support' | 'oppose' | 'neutral' | 'option') => void;
  onDeleteSelected: () => void;
  onShortcuts: () => void;
}) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project } = state;
  const [replacement, setReplacement] = useState<{ title: string; apply: () => void } | null>(null);
  const root = rootNode(project);
  const selected = project.nodes.find((n) => n.id === state.selectedId);
  const canEdit = project.users.find((u) => u.id === state.actorId)?.role !== 'viewer';

  const confirmReplace = (title: string, apply: () => void) => setReplacement({ title, apply });
  const newDocument = (mode: Mode) =>
    confirmReplace(`${t('new')} · ${t(mode === 'decision' ? 'modeDecision' : 'modeArgument')}`, () =>
      store.load(blankProject(mode))
    );
  const openFile = async () => {
    const picked = await pickTextFile();
    if (!picked) return;
    try {
      const parsed = parseProject(JSON.parse(picked.text));
      confirmReplace(`${t('openJson')} · ${picked.name}`, () => store.load(parsed));
    } catch (error) {
      store.notify({
        kind: 'error',
        text: `${picked.name}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };
  const saveFile = () => {
    downloadText(exportFilename(project.title), serializeProjectFile(project));
    store.notify({ kind: 'info', text: t('savedFile') });
  };
  const addPerson = () => {
    const name = window.prompt(t('profileNewPrompt'));
    if (!name?.trim()) return;
    const id = newId();
    if (store.dispatch({ type: 'user.add', id, name })) store.setActor(id);
  };
  const setMode = (mode: Mode) => {
    if (mode === project.mode) return;
    if (mode === 'argument' && project.nodes.some((n) => n.kind === 'option' || n.kind === 'group')) {
      store.notify({ kind: 'error', text: t('optionsPreventArgumentMode') });
      return;
    }
    store.dispatch({ type: 'project.setMode', mode });
  };
  const modeWord = project.mode === 'decision' ? t('modeDecision') : t('modeArgument');

  return (
    <div className="toolbar" aria-label={t('toolbarEditGroup')} data-testid="toolbar">
      <div className="toolbar-group">
        <div className="mode-switch" role="group" aria-label={`${t('modeArgument')} / ${t('modeDecision')}`}>
          <button
            type="button"
            className={project.mode === 'argument' ? 'active' : ''}
            aria-pressed={project.mode === 'argument'}
            data-testid="mode-argument"
            onClick={() => setMode('argument')}
          >
            {t('modeArgument')}
          </button>
          <button
            type="button"
            className={project.mode === 'decision' ? 'active' : ''}
            aria-pressed={project.mode === 'decision'}
            data-testid="mode-decision"
            onClick={() => setMode('decision')}
          >
            {t('modeDecision')}
          </button>
        </div>
        <label className="visually-hidden" htmlFor="actorSelect">
          {t('profileSelect')}
        </label>
        <select
          id="actorSelect"
          className="profile-select"
          data-testid="actor-select"
          title={t('profileSelect')}
          value={state.actorId}
          onChange={(e) => (e.target.value === '__add__' ? addPerson() : store.setActor(e.target.value))}
        >
          {project.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
              {isAiProfile(u) ? ' (AI)' : ''}
            </option>
          ))}
          <option value="__add__">{t('profileAdd')}</option>
        </select>
        <label className="visually-hidden" htmlFor="viewpointSelect">
          {t('indexDisplay')}
        </label>
        <select
          id="viewpointSelect"
          data-testid="viewpoint-select"
          title={t('indexDisplay')}
          value={state.view.viewpoint}
          onChange={(e) => store.setView({ viewpoint: e.target.value as Viewpoint })}
        >
          <option value="shared">{t('indexShared')}</option>
          <option value="personal">{t('indexPersonal')}</option>
        </select>
      </div>
      <div className="toolbar-group toolbar-simple-menus">
        <Menu id="file" label={t('toolbarFileGroup')}>
          <MenuButton testId="menu-new-argument" onClick={() => newDocument('argument')}>
            {t('new')} · {t('modeArgument')}
          </MenuButton>
          <MenuButton testId="menu-new-decision" onClick={() => newDocument('decision')}>
            {t('new')} · {t('modeDecision')}
          </MenuButton>
          <MenuButton testId="menu-open" onClick={() => void openFile()}>
            {t('openJson')}
          </MenuButton>
          <MenuButton testId="menu-save" onClick={saveFile}>
            {t('saveFile')}
          </MenuButton>
          <div className="menu-divider" />
          <span className="save-status" role="status" data-testid="save-status">
            {t(state.saveStatus)}
          </span>
        </Menu>
        <Menu id="edit" label={t('toolbarEditGroup')}>
          <MenuButton
            testId="menu-add-support"
            onClick={() => onAdd('support')}
            disabled={!canEdit || !selected}
          >
            {t('supportAdd')}
          </MenuButton>
          <MenuButton
            testId="menu-add-oppose"
            onClick={() => onAdd('oppose')}
            disabled={!canEdit || !selected}
          >
            {t('opposeAdd')}
          </MenuButton>
          <MenuButton
            testId="menu-add-neutral"
            onClick={() => onAdd('neutral')}
            disabled={!canEdit || !selected}
          >
            {t('neutralAdd')}
          </MenuButton>
          {project.mode === 'decision' ? (
            <MenuButton
              testId="menu-add-option"
              onClick={() => onAdd('option')}
              disabled={!canEdit || !selected || (selected.kind !== 'decision' && selected.kind !== 'group')}
            >
              {t('optionShort')}
            </MenuButton>
          ) : null}
          <div className="menu-divider" />
          <MenuButton
            testId="menu-delete"
            onClick={onDeleteSelected}
            disabled={!canEdit || !selected || selected.id === root?.id}
          >
            {t('deleteSubtree')}
          </MenuButton>
          <div className="menu-divider" />
          <MenuButton testId="menu-undo" onClick={() => store.undo()} disabled={!state.canUndo}>
            {t('undo')}
          </MenuButton>
          <MenuButton testId="menu-redo" onClick={() => store.redo()} disabled={!state.canRedo}>
            {t('redo')}
          </MenuButton>
        </Menu>
        <Menu id="view" label={t('toolbarViewGroup')}>
          <MenuButton
            testId="menu-view-settings"
            onClick={() => store.setView({ dockOpen: !state.view.dockOpen })}
          >
            {t('viewSettingsButton')} <kbd>Alt+V</kbd>
          </MenuButton>
          <label className="toolbar-importance">
            <input
              type="checkbox"
              checked={state.view.showAuthors}
              onChange={(e) => store.setView({ showAuthors: e.target.checked })}
            />
            <span>{t('showAuthors')}</span>
          </label>
        </Menu>
        <Menu id="help" label={t('toolbarHelpGroup')}>
          <MenuButton testId="menu-shortcuts" onClick={onShortcuts}>
            {t('shortcutsButton')} <kbd>?</kbd>
          </MenuButton>
        </Menu>
      </div>
      <Modal
        open={!!replacement}
        onClose={() => setReplacement(null)}
        title={t('replaceTitle')}
        testId="replace-dialog"
      >
        <p>{replacement?.title}</p>
        <p data-testid="replace-summary">
          {t('replaceSummary', {
            title: project.title,
            mode: modeWord,
            count: project.nodes.length,
            updated: project.updatedAt.slice(0, 16).replace('T', ' '),
          })}
        </p>
        <p className="inspector-note">{t('footerFriendly')}</p>
        <div className="dialog-actions">
          <button
            type="button"
            className="btn quiet"
            onClick={() => setReplacement(null)}
            data-testid="replace-cancel"
          >
            {t('cancel')}
          </button>
          <button type="button" className="btn quiet" onClick={saveFile}>
            {t('saveFile')}
          </button>
          <button
            type="button"
            className="btn primary"
            data-testid="replace-confirm"
            onClick={() => {
              replacement?.apply();
              setReplacement(null);
            }}
          >
            {t('replaceConfirm')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
