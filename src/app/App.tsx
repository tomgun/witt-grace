// The shell: body classes, zones, keyboard, home/workspace switch, bottom zone, footer and the dialog hosts.
import { useEffect, useMemo, useState } from 'react';
import { exportFilename, parseProject, serializeProjectFile } from '../domain/index.ts';
import { downloadText, pickTextFile } from '../lib/files.ts';
import {
  addNode,
  arrangeTree,
  deleteNode,
  selectPresentation,
  toggleFocus,
  toggleOptionBranches,
  toggleViewDock,
  canEdit,
} from './actions.ts';
import { Canvas } from './Canvas.tsx';
import { ModalHost, NoticeBar } from './dialogs.tsx';
import { Home } from './Home.tsx';
import { Inspector } from './Inspector.tsx';
import { LeftPanel } from './LeftPanel.tsx';
import { PeopleDialog } from './PeopleDialog.tsx';
import { useFrame } from './projection.ts';
import { readShortcuts, shortcutFor } from './shortcuts.ts';
import { getStore, useAppState, useTranslator } from './store.ts';
import type { Zone } from './store.ts';
import { TableView } from './TableView.tsx';
import { Toolbar } from './Toolbar.tsx';
import { TopBar } from './TopBar.tsx';
import { ViewDock } from './ViewDock.tsx';
import { VoteDialog } from './VoteDialog.tsx';
import { ZONES } from './view.ts';

export const APP_VERSION = '0.2.0-dev';

export function App() {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, view, zones } = state;
  const frame = useFrame(state);
  const [shortcutsVersion, setShortcutsVersion] = useState(0);
  const shortcuts = useMemo(() => readShortcuts(window.localStorage), [shortcutsVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = project.nodes.find((n) => n.id === state.selectedId);

  // Body state the prototype's CSS keys on.
  useEffect(() => {
    const body = document.body;
    body.dataset.theme = state.appearance;
    document.documentElement.lang = state.language;
    body.classList.toggle('home-active', state.home);
    body.classList.toggle('witt-focus', state.focusOnly && !state.home);
    for (const zone of ZONES) {
      body.classList.toggle(`zone-${zone}-hidden`, !zones[zone]);
      body.classList.toggle(`zone-${zone}-visible`, zones[zone]);
    }
  }, [state.appearance, state.language, state.home, state.focusOnly, zones]);

  // File flows (also reachable from the home screen and Ctrl/Cmd+S).
  useEffect(() => {
    const openFile = async () => {
      const picked = await pickTextFile();
      if (!picked) return;
      try {
        const parsed = parseProject(JSON.parse(picked.text));
        if (await store.askConfirm(`${t('openJson')} · ${picked.name}`)) store.load(parsed);
      } catch (error) {
        store.showMessage(`${picked.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    const saveFile = () => {
      const current = store.get().project;
      downloadText(exportFilename(current.title), serializeProjectFile(current));
      store.notify({ kind: 'info', text: t('savedFile') });
    };
    const onOpen = () => void openFile();
    window.addEventListener('witt-open-file', onOpen);
    window.addEventListener('witt-save-file', saveFile);
    return () => {
      window.removeEventListener('witt-open-file', onOpen);
      window.removeEventListener('witt-save-file', saveFile);
    };
  }, [store, t]);

  // Document-level keys in the prototype's order (inv-canvas §9.2).
  useEffect(() => {
    const camera = (detail: { kind: 'zoom' | 'fit' | 'pan'; factor?: number; dx?: number; dy?: number }) =>
      window.dispatchEvent(new CustomEvent('witt-camera', { detail }));
    const onKey = (e: KeyboardEvent) => {
      const s = store.get();
      const target = e.target as HTMLElement | null;
      const editing = !!target?.closest('input,textarea,select,dialog,[contenteditable="true"]');
      const home = s.home;
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'v' && !editing && !home) {
        e.preventDefault();
        toggleViewDock();
        return;
      }
      if (e.altKey && e.shiftKey && e.code === 'KeyO' && s.project.mode === 'decision' && !editing && !home) {
        e.preventDefault();
        toggleOptionBranches();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('witt-save-file'));
        return;
      }
      if (e.key === 'Escape' && s.focusOnly && !editing) {
        toggleFocus(false);
        return;
      }
      if (editing) return;
      if (
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        ['1', '2', '3', '4'].includes(e.key) &&
        !home
      ) {
        e.preventDefault();
        store.toggleZone(
          ({ '1': 'left', '2': 'top', '3': 'right', '4': 'bottom' } as Record<string, Zone>)[e.key]!
        );
        return;
      }
      if (!home && s.view.presentation === 'tree') {
        if ((e.ctrlKey || e.metaKey) && !e.altKey && ['+', '=', '-', '_'].includes(e.key)) {
          e.preventDefault();
          camera({ kind: 'zoom', factor: e.key === '+' || e.key === '=' ? 1.2 : 1 / 1.2 });
          return;
        }
        if (e.key === '0' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          camera({ kind: 'fit' });
          return;
        }
        if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.startsWith('Arrow')) {
          e.preventDefault();
          const pan: Record<string, [number, number]> = {
            ArrowUp: [0, 100],
            ArrowDown: [0, -100],
            ArrowLeft: [100, 0],
            ArrowRight: [-100, 0],
          };
          const [dx, dy] = pan[e.key] ?? [0, 0];
          camera({ kind: 'pan', dx, dy });
          return;
        }
      }
      const action = shortcutFor(shortcuts, e);
      if (home) {
        if (action === 'help') {
          e.preventDefault();
          store.openDialog('help');
        }
        return;
      }
      if (action) {
        e.preventDefault();
        if (action === 'support' || action === 'oppose') addNode(action);
        else if (action === 'option') {
          if (s.project.mode === 'decision')
            addNode('option', s.project.nodes.find((n) => n.parentId === null)?.id);
        } else if (action === 'table') selectPresentation(s.view.presentation === 'table' ? 'tree' : 'table');
        else if (action === 'focus') toggleFocus();
        else if (action === 'assessment') store.openDialog('assessment');
        else if (action === 'help') store.openDialog('help');
        else if (action === 'arrange') arrangeTree();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        addNode(e.shiftKey ? 'oppose' : 'support');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store.redo();
        return;
      }
      if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        document
          .querySelector<HTMLElement>(`.node[data-id="${CSS.escape(s.selectedId)}"]`)
          ?.focus({ preventScroll: true });
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const node = s.project.nodes.find((n) => n.id === s.selectedId);
        if (node?.parentId) {
          e.preventDefault();
          void deleteNode(node.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, shortcuts]);

  if (state.home) {
    return (
      <>
        <Home />
        <ModalHost frame={frame} onShortcutsChanged={() => setShortcutsVersion((v) => v + 1)} />
      </>
    );
  }
  const editable = canEdit(state);
  const workspaceClass = `workspace${view.presentation === 'table' ? ' table-view' : ''}${view.workflow === 'evaluate' ? ' table-evaluate' : ''}${state.leftTab === 'repeat' ? ' repeat-library-open' : ''}`;
  return (
    <div className="app-shell" data-testid="app">
      <TopBar />
      <Toolbar frame={frame} shortcuts={shortcuts} />
      <NoticeBar />
      <main className={workspaceClass} id="workspaceMain" data-testid="workspace">
        <LeftPanel frame={frame} />
        {view.presentation === 'table' ? (
          <TableView scores={frame.scores} />
        ) : (
          <Canvas frame={frame} shortcuts={shortcuts} />
        )}
        <Inspector frame={frame} />
      </main>
      {zones.bottom ? (
        <section
          id="bottomZone"
          className="bottom-zone"
          aria-label={t('structureTitle')}
          data-testid="bottom-zone"
        >
          <div className="bottom-zone-title">
            <strong>{t('structureTitle')}</strong>
            <span id="bottomSelectedNode">{selected?.title ?? ''}</span>
          </div>
          <div className="bottom-zone-actions">
            <button
              type="button"
              className="btn support-add"
              id="btnBottomSupport"
              data-testid="bottom-add-support"
              disabled={!editable || selected?.kind === 'group'}
              onClick={() => addNode('support')}
            >
              {t('supportAdd')}
            </button>
            <button
              type="button"
              className="btn oppose-add"
              id="btnBottomOppose"
              data-testid="bottom-add-oppose"
              disabled={!editable || selected?.kind === 'group'}
              onClick={() => addNode('oppose')}
            >
              {t('opposeAdd')}
            </button>
            <button
              type="button"
              className="btn quiet"
              id="btnBottomNeutral"
              disabled={!editable || selected?.kind === 'group'}
              onClick={() => addNode('neutral')}
            >
              {t('neutralAdd')}
            </button>
            <button
              type="button"
              className="btn quiet"
              id="btnBottomMove"
              disabled={!selected?.parentId || !editable}
              onClick={() => store.openModal({ kind: 'move', nodeId: state.selectedId })}
            >
              {t('moveSubtree')}
            </button>
            <button
              type="button"
              className="btn quiet"
              id="btnBottomDelete"
              disabled={!selected?.parentId || !editable}
              onClick={() => void deleteNode(state.selectedId)}
            >
              {t('deleteSubtree')}
            </button>
          </div>
        </section>
      ) : null}
      <footer className="app-footer">
        <span>
          WITT <b>{APP_VERSION}</b>
        </span>
        <span>{t('footerFriendly')}</span>
        <button type="button" id="btnHelp" onClick={() => store.openDialog('help')}>
          {t('help')}
        </button>
      </footer>
      {!view.dockHidden ? <ViewDock frame={frame} anchorId="btnViewSettings" /> : null}
      <PeopleDialog open={state.dialog === 'people'} onClose={() => store.openDialog(null)} />
      <VoteDialog
        open={state.dialog === 'vote'}
        onClose={() => store.openDialog(null)}
        scores={frame.scores}
      />
      <ModalHost frame={frame} onShortcutsChanged={() => setShortcutsVersion((v) => v + 1)} />
    </div>
  );
}
