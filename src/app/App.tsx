// The shell: body classes, zones, keyboard, home/workspace switch, bottom zone, footer and the dialog hosts.
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  SCORING_VERSION,
  arranged,
  cardsOverlap,
  exportFilename,
  inspectImport,
  parseProject,
  serializeProjectFile,
  starterToProject,
} from '../domain/index.ts';
import { downloadText, pickTextFile } from '../lib/files.ts';
import { DOC_LINK_LIMIT, DOC_LINK_PREFIX, buildDocLink, readDocLink } from '../lib/inflate.ts';
import { DEFAULT_LANGUAGE } from '../lib/i18n/i18n.ts';
import { applyPageHead } from '../lib/pageHead.ts';
import { VERSION } from '../lib/version.ts';
import { newId, nowIso } from '../lib/providers.ts';
import { recordEvent } from '../lib/workspaceMeta.ts';
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
import { stageDraftFromFile } from './AiDraftDialog.tsx';
import { stageProposalFromFile } from './AiReviewDialog.tsx';
import { AssessmentDialog } from './AssessmentDialog.tsx';
import { Canvas } from './Canvas.tsx';
import { ModalHost, NoticeBar } from './dialogs.tsx';
import { Home } from './Home.tsx';
import { FILE_SIZE_LIMIT, showImportReport, textByteLength } from './ImportReportDialog.tsx';
import { Inspector } from './Inspector.tsx';
import { LeftPanel } from './LeftPanel.tsx';
import { library } from './LibraryDialog.tsx';
import { PeopleDialog } from './PeopleDialog.tsx';
import { useFrame } from './projection.ts';
import { ReviewLensDialog } from './ReviewLensDialog.tsx';
import { readShortcuts, shortcutFor } from './shortcuts.ts';
import { getStore, useAppState, useTranslator } from './store.ts';
import type { Zone } from './store.ts';
import { TableView } from './TableView.tsx';
import { Toolbar } from './Toolbar.tsx';
import { TopBar } from './TopBar.tsx';
import { Tutorial } from './Tutorial.tsx';
import { ViewDock } from './ViewDock.tsx';
import { VoteDialog } from './VoteDialog.tsx';
import { ZONES } from './view.ts';
import { readInviteOnStart } from './collab.ts';
import { readDraftLink } from './AiDraftDialog.tsx';

const Sketchpad = lazy(() => import('./Sketchpad.tsx'));

export function App() {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, view, zones } = state;
  const frame = useFrame(state);
  const [shortcutsVersion, setShortcutsVersion] = useState(0);
  // Luonnoslehtiö (S-15, 2026-11-20): a screen of its own, opened from the home screen and the Näkymä menu; its
  // code is fetched when it is first opened.
  const [sketching, setSketching] = useState(false);
  useEffect(() => {
    const open = () => setSketching(true);
    window.addEventListener('witt-sketch', open);
    return () => window.removeEventListener('witt-sketch', open);
  }, []);
  const shortcuts = useMemo(() => readShortcuts(window.localStorage), [shortcutsVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = project.nodes.find((n) => n.id === state.selectedId);

  // Body state the prototype's CSS keys on.
  // An invite link in the address bar, or this tab's session before a reload (WG-030).
  useEffect(() => readInviteOnStart(), []);
  // A link an AI gave the person: a draft carried in the address, or the paste step (S-15, 2026-11-20).
  useEffect(() => {
    const read = () => void readDraftLink();
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  useEffect(() => {
    const body = document.body;
    body.dataset.theme = state.appearance;
    document.documentElement.lang = state.language;
    applyPageHead(document, window.location, {
      title: t('seoTitle'),
      description: t('seoDescription'),
      language: state.language,
      defaultLanguage: DEFAULT_LANGUAGE,
    });
    body.classList.toggle('home-active', state.home);
    body.classList.toggle('witt-focus', state.focusOnly && !state.home);
    for (const zone of ZONES) {
      body.classList.toggle(`zone-${zone}-hidden`, !zones[zone]);
      body.classList.toggle(`zone-${zone}-visible`, zones[zone]);
    }
  }, [state.appearance, state.language, state.home, state.focusOnly, zones, t]);

  // File flows (also reachable from the home screen and Ctrl/Cmd+S).
  useEffect(() => {
    // The prototype's `openFile` (inv-ai-contrib §0.4): one preflight, then the route the file's format names.
    const openFile = async () => {
      const picked = await pickTextFile();
      if (picked) await openText(picked);
    };
    const openText = async (picked: { text: string; name: string }) => {
      try {
        if (textByteLength(picked.text) > FILE_SIZE_LIMIT) {
          store.showMessage(t('importTooLarge'));
          return;
        }
        const report = inspectImport(picked.text, { currentProject: store.get().project });
        if (!report.ok) {
          showImportReport(report, picked.name);
          return;
        }
        if (report.format === 'draft') {
          stageDraftFromFile(report.parsed, picked.name);
          return;
        }
        if (report.format === 'contribution') {
          stageProposalFromFile(report.parsed, picked.name);
          return;
        }
        if (report.format === 'library') {
          const repo = await library();
          if (!repo) {
            store.showMessage(t('libraryUnavailable'));
            return;
          }
          const count = ((report.parsed as { documents?: unknown[] }).documents ?? []).length;
          if (!(await store.askConfirm(t('libraryRestoreConfirm', { count })))) return;
          const result = await repo.importBundle(report.parsed, parseProject, newId);
          store.openDialog('library');
          store.notify({
            kind: 'info',
            text: t('libraryRestored', { count: result.imported, copies: result.duplicated }),
          });
          return;
        }
        const opened =
          report.format === 'starter'
            ? starterToProject(report.parsed, { now: nowIso(), newId, scoring: SCORING_VERSION })
            : parseProject(report.parsed);
        // A file whose cards have no places of their own opens as a tidy tree; an arrangement someone made is
        // kept as it is (owner 2026-11-19, S-15).
        const incoming = cardsOverlap(opened) ? arranged(opened) : opened;
        const description = `${t('importConfirm', { title: incoming.title })}\nJSON tarkistettu: ${report.formatName}.`;
        if (!(await store.prepareReplacement(description))) return;
        store.load(incoming);
        recordEvent(window.localStorage, 'lastOpenedJson', picked.name, incoming.id, nowIso());
      } catch (error) {
        store.showMessage(
          t('importFailed', { reason: error instanceof Error ? error.message : String(error) })
        );
      }
    };
    const saveFile = () => {
      const current = store.get().project;
      const filename = exportFilename(current.title);
      downloadText(filename, serializeProjectFile(current));
      recordEvent(window.localStorage, 'lastExportedJson', filename, current.id, nowIso());
      store.notify({ kind: 'info', text: t('savedFile') });
    };
    // A link that carries the whole document (owner 2026-11-20, S-15): made here, copied by the person's press.
    const copyLink = async () => {
      const json = JSON.stringify(JSON.parse(serializeProjectFile(store.get().project)));
      const link = await buildDocLink(window.location.href, json);
      if (link.length > DOC_LINK_LIMIT) {
        store.showMessage(t('docLinkTooLarge', { length: link.length, limit: DOC_LINK_LIMIT }));
        return;
      }
      try {
        await navigator.clipboard.writeText(link);
        store.showMessage(
          `${t('docLinkCopied', { length: link.length })}\n\n${t('docLinkShorteners')}`,
          t('docLinkShortenerWarning')
        );
      } catch {
        store.showMessage(t('docLinkCopyFailed'));
      }
    };
    // Arriving by such a link: the fragment leaves the address at once, and the document goes through the same
    // check and replacement dialog as an opened file.
    const readLink = async () => {
      const hash = window.location.hash;
      if (!hash.startsWith(DOC_LINK_PREFIX)) return;
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      try {
        const text = await readDocLink(hash, FILE_SIZE_LIMIT);
        if (text !== null) await openText({ text, name: t('docLinkSource') });
      } catch {
        store.showMessage(t('docLinkBroken'));
      }
    };
    const onOpen = () => void openFile();
    const onCopyLink = () => void copyLink();
    const onHash = () => void readLink();
    void readLink();
    window.addEventListener('hashchange', onHash);
    window.addEventListener('witt-copy-link', onCopyLink);
    window.addEventListener('witt-open-file', onOpen);
    window.addEventListener('witt-save-file', saveFile);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('witt-copy-link', onCopyLink);
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
        else if (action === 'value') addNode('support', undefined, 'value');
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

  if (sketching) {
    return (
      <Suspense fallback={null}>
        <Sketchpad onClose={() => setSketching(false)} />
      </Suspense>
    );
  }
  if (state.home) {
    return (
      <>
        <Home />
        <NoticeBar />
        <ModalHost frame={frame} onShortcutsChanged={() => setShortcutsVersion((v) => v + 1)} />
        <Tutorial />
      </>
    );
  }
  const editable = canEdit(state);
  const workspaceClass = `workspace${view.presentation === 'table' ? ' table-view' : ''}${view.workflow === 'evaluate' ? ' table-evaluate' : ''}${state.leftTab === 'repeat' ? ' repeat-library-open' : ''}`;
  return (
    <div className="app-shell" data-testid="app">
      <TopBar shortcuts={shortcuts} />
      <Toolbar frame={frame} shortcuts={shortcuts} />
      <NoticeBar />
      <main className={workspaceClass} id="workspaceMain" data-testid="workspace">
        <LeftPanel frame={frame} />
        {view.presentation === 'table' ? (
          <TableView frame={frame} />
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
          WITT <b>{VERSION}</b>
        </span>
        {/* The saving state lives here, out of the way but always in sight (owner 2026-11-19, S-15): quiet when all is
            well, red when a save failed. The Tiedosto menu's line is the one screen readers hear. */}
        <span className="footer-status">
          <b
            id="saveStatusFooter"
            className={state.saveStatus === 'saveFailed' ? 'error' : ''}
            aria-hidden="true"
          >
            {t(state.saveStatus)}
          </b>
          <span>{t('footerFriendly').split(' · ').slice(1).join(' · ')}</span>
        </span>
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
      <AssessmentDialog open={state.dialog === 'assessment'} onClose={() => store.openDialog(null)} />
      <ReviewLensDialog
        open={state.dialog === 'reviewLens'}
        onClose={() => store.openDialog(null)}
        frame={frame}
      />
      <ModalHost frame={frame} onShortcutsChanged={() => setShortcutsVersion((v) => v + 1)} />
      <Tutorial />
    </div>
  );
}
