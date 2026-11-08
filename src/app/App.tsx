import { useCallback, useEffect, useState } from 'react';
import { descendants, rootNode } from '../domain/index.ts';
import { newId } from '../lib/providers.ts';
import { Canvas } from './Canvas.tsx';
import { Inspector } from './Inspector.tsx';
import { Modal, NoticeBar } from './dialogs.tsx';
import { Outline } from './Outline.tsx';
import { TableView } from './TableView.tsx';
import { PeopleDialog } from './PeopleDialog.tsx';
import { VoteDialog } from './VoteDialog.tsx';
import { Toolbar } from './Toolbar.tsx';
import { TopBar } from './TopBar.tsx';
import { getStore, useAppState, useTranslator } from './store.ts';
import type { Zone } from './store.ts';
import { useScores } from './useScores.ts';

type AddRelation = 'support' | 'oppose' | 'neutral' | 'option';

export function App() {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, view } = state;
  const scores = useScores(project, view.viewpoint, state.actorId);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [voteOpen, setVoteOpen] = useState(false);
  const selected = project.nodes.find((n) => n.id === state.selectedId);
  const root = rootNode(project);

  const add = useCallback(
    (relation: AddRelation) => {
      const target = store.get().selectedId;
      const id = newId();
      if (store.dispatch({ type: 'node.add', id, parentId: target, relation })) {
        store.select(id);
        requestAnimationFrame(() =>
          document.querySelector<HTMLTextAreaElement>('[data-testid="node-title"]')?.focus()
        );
      }
    },
    [store]
  );
  const requestDelete = useCallback(() => {
    const id = store.get().selectedId;
    if (root && id !== root.id) setPendingDelete(id);
  }, [store, root]);

  useEffect(() => {
    document.body.dataset.theme = state.appearance;
    document.documentElement.lang = state.language;
  }, [state.appearance, state.language]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const zones: Record<string, Zone> = { '1': 'left', '2': 'top', '3': 'right', '4': 'bottom' };
        const zone = zones[e.key];
        if (zone) {
          e.preventDefault();
          store.toggleZone(zone);
          return;
        }
        if (e.key.toLowerCase() === 'v') {
          e.preventDefault();
          store.setView({ dockOpen: !store.get().view.dockOpen });
          return;
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (typing) return;
      if (e.key === '+') {
        e.preventDefault();
        add('support');
      } else if (e.key === '-' || e.key === '−') {
        e.preventDefault();
        add('oppose');
      } else if (e.key === 'Delete') {
        e.preventDefault();
        requestDelete();
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (e.key === 'F2') {
        e.preventDefault();
        document.querySelector<HTMLTextAreaElement>('[data-testid="node-title"]')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [add, requestDelete, store]);

  const pending = pendingDelete ? project.nodes.find((n) => n.id === pendingDelete) : undefined;
  const zones = view.zones;
  return (
    <div className="app-shell" data-testid="app">
      <TopBar />
      {zones.top ? (
        <Toolbar
          onAdd={add}
          onDeleteSelected={requestDelete}
          onShortcuts={() => setShortcutsOpen(true)}
          onPeople={() => setPeopleOpen(true)}
          onVote={() => setVoteOpen(true)}
        />
      ) : null}
      <NoticeBar />
      <main
        className={`workspace${zones.left ? '' : ' no-left'}${zones.right ? '' : ' no-right'}`}
        data-testid="workspace"
      >
        {zones.left ? <Outline /> : null}
        {view.layout === 'table' ? <TableView scores={scores} /> : <Canvas scores={scores} />}
        {zones.right ? <Inspector scores={scores} /> : null}
      </main>
      {zones.bottom ? (
        <section className="bottom-zone" aria-label={t('structureTitle')} data-testid="bottom-zone">
          <div className="bottom-zone-title">
            <strong>{t('structureTitle')}</strong> <span>{selected?.title}</span>
          </div>
          <div className="bottom-zone-actions">
            <button
              type="button"
              className="btn support-add"
              onClick={() => add('support')}
              data-testid="bottom-add-support"
            >
              {t('supportAdd')}
            </button>
            <button
              type="button"
              className="btn oppose-add"
              onClick={() => add('oppose')}
              data-testid="bottom-add-oppose"
            >
              {t('opposeAdd')}
            </button>
            <button type="button" className="btn quiet" onClick={() => add('neutral')}>
              {t('neutralAdd')}
            </button>
            {project.mode === 'decision' ? (
              <button
                type="button"
                className="btn option-add"
                onClick={() => add('option')}
                data-testid="bottom-add-option"
              >
                {t('optionAdd')}
              </button>
            ) : null}
            <button
              type="button"
              className="btn quiet"
              onClick={requestDelete}
              disabled={!selected || selected.id === root?.id}
            >
              {t('deleteSubtree')}
            </button>
          </div>
        </section>
      ) : null}
      {view.dockOpen ? (
        <div className="view-dock" role="dialog" aria-label={t('viewSettingsButton')} data-testid="view-dock">
          <div className="dock-topline">
            <span>{t('viewSettingsButton')}</span>
            <button
              type="button"
              className="btn quiet"
              aria-label={t('dockClose')}
              onClick={() => store.setView({ dockOpen: false })}
            >
              ×
            </button>
          </div>
          <label className="toolbar-importance">
            <input
              type="checkbox"
              checked={view.showAuthors}
              onChange={(e) => store.setView({ showAuthors: e.target.checked })}
            />
            <span>{t('showAuthors')}</span>
          </label>
          <button type="button" className="btn quiet" onClick={() => store.dispatch({ type: 'layout.auto' })}>
            {t('arrange')}
          </button>
        </div>
      ) : null}
      <footer className="app-footer">
        <span>
          WITT <b>0.1.0</b>
        </span>
        <span>{t('footerFriendly')}</span>
        <a href="proto/" className="proto-link">
          dev32
        </a>
      </footer>
      <PeopleDialog open={peopleOpen} onClose={() => setPeopleOpen(false)} />
      <VoteDialog open={voteOpen} onClose={() => setVoteOpen(false)} scores={scores} />
      <Modal
        open={!!pending}
        onClose={() => setPendingDelete(null)}
        title={t('confirmationTitle')}
        testId="delete-dialog"
      >
        <p>
          {pending
            ? t('deleteSubtreeConfirm', {
                title: pending.title,
                count: descendants(project, pending.id).length,
              })
            : ''}
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn quiet" onClick={() => setPendingDelete(null)}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn primary"
            data-testid="delete-confirm"
            onClick={() => {
              if (pending) store.dispatch({ type: 'node.remove', id: pending.id });
              setPendingDelete(null);
            }}
          >
            {t('deleteSubtree')}
          </button>
        </div>
      </Modal>
      <Modal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        title={t('shortcutsButton')}
        testId="shortcuts-dialog"
      >
        <table className="shortcuts">
          <tbody>
            <tr>
              <td>
                <kbd>+</kbd> / <kbd>−</kbd>
              </td>
              <td>
                {t('supportAdd')} / {t('opposeAdd')}
              </td>
            </tr>
            <tr>
              <td>
                <kbd>Del</kbd>
              </td>
              <td>{t('deleteSubtree')}</td>
            </tr>
            <tr>
              <td>
                <kbd>F2</kbd>
              </td>
              <td>{t('editArgument')}</td>
            </tr>
            <tr>
              <td>
                <kbd>Ctrl/Cmd+Z</kbd>, <kbd>Ctrl/Cmd+Shift+Z</kbd>
              </td>
              <td>
                {t('undo')}, {t('redo')}
              </td>
            </tr>
            <tr>
              <td>
                <kbd>Alt+1</kbd>…<kbd>Alt+4</kbd>
              </td>
              <td>{t('zoneControls')}</td>
            </tr>
            <tr>
              <td>
                <kbd>Alt+V</kbd>
              </td>
              <td>{t('viewSettingsButton')}</td>
            </tr>
            <tr>
              <td>
                <kbd>Ctrl/Cmd +</kbd> / <kbd>−</kbd> / <kbd>0</kbd>
              </td>
              <td>{t('canvasKeyboardHelp')}</td>
            </tr>
          </tbody>
        </table>
        <div className="dialog-actions">
          <button type="button" className="btn primary" onClick={() => setShortcutsOpen(false)}>
            {t('close')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
