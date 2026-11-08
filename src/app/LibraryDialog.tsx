// Asiakirjakirjasto (UI_INVENTORY S-11.23, inv-files §C): the browser's IndexedDB library, explicitly saved only.
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseProject } from '../domain/index.ts';
import type { Project } from '../domain/index.ts';
import { downloadText } from '../lib/files.ts';
import { createLibrary } from '../lib/library.ts';
import type { Library, LibraryRow } from '../lib/library.ts';
import { newId, nowIso } from '../lib/providers.ts';
import { formatWorkspaceTime } from '../lib/workspaceMeta.ts';
import { Modal } from './dialogs.tsx';
import { getStore, useAppState, useTranslator } from './store.ts';
import type { Translator } from '../lib/i18n/i18n.ts';

let libraryPromise: Promise<Library | null> | null = null;
const knownRevisions = new Map<string, number>();
/** Opens the library once per session; null when IndexedDB is unavailable (the dialog says so). */
export function library(): Promise<Library | null> {
  libraryPromise ??= createLibrary().catch(() => null);
  return libraryPromise;
}

/** The prototype's `saveCurrentToLibrary`: confirms before overwriting an unknown record; returns success. */
export async function saveCurrentToLibrary(project: Project, t: Translator): Promise<boolean> {
  const store = getStore();
  const repo = await library();
  if (!repo) {
    store.showMessage(t('libraryUnavailable'));
    return false;
  }
  try {
    const safe = parseProject(project);
    let known = knownRevisions.get(safe.id) ?? null;
    if (known === null) {
      const existing = await repo.get(safe.id);
      if (existing) {
        if (!(await store.askConfirm(t('libraryOverwriteConfirm', { title: existing.title })))) return false;
        known = existing.revision;
      }
    }
    const result = await repo.put(safe, known);
    knownRevisions.set(safe.id, result.revision);
    return true;
  } catch (error) {
    store.showMessage(
      `${t('librarySaveFailed')} (${error instanceof Error ? error.message : String(error)})`
    );
    return false;
  }
}

export function LibraryDialog() {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, language } = state;
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [status, setStatus] = useState(t('libraryLoading'));
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => {
    const repo = await library();
    if (!repo) {
      setRows([]);
      setStatus(`${t('libraryUnavailable')}: IndexedDB`);
      return;
    }
    try {
      const list = await repo.list();
      setRows(list);
      setStatus(`${list.length} ${t('librarySavedCount')}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [t]);
  useEffect(() => {
    // The list arrives from IndexedDB asynchronously; the first load is kicked off after mount.
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);
  const close = () => store.openDialog(null);
  const withRepo = async (fn: (repo: Library) => Promise<void>) => {
    const repo = await library();
    if (!repo) {
      setStatus(t('libraryUnavailable'));
      return;
    }
    try {
      await fn(repo);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };
  const open = (row: LibraryRow) =>
    withRepo(async (repo) => {
      const fresh = await repo.get(row.id);
      if (!fresh) {
        setStatus(t('libraryMissing'));
        return;
      }
      const next = parseProject(fresh.document);
      const choice = await store.prepareReplacement(t('importConfirm', { title: next.title }));
      if (!choice) return;
      knownRevisions.set(next.id, fresh.revision);
      store.load(next);
      close();
    });
  const rename = (row: LibraryRow) =>
    withRepo(async (repo) => {
      const value = (
        await store.askText(t('libraryRenamePrompt'), t('libraryRename'), t('libraryRename'), row.title)
      )?.trim();
      if (!value) return;
      const fresh = await repo.get(row.id);
      if (!fresh || fresh.revision !== row.revision) {
        setStatus(t('libraryConflict'));
        return;
      }
      if (row.id === project.id) {
        store.dispatch({ type: 'project.setTitle', title: value });
        await saveCurrentToLibrary(store.get().project, t);
      } else {
        await repo.put(
          parseProject({ ...fresh.document, title: value, updatedAt: nowIso() }),
          fresh.revision
        );
      }
      await refresh();
    });
  const duplicate = (row: LibraryRow) =>
    withRepo(async (repo) => {
      const fresh = await repo.get(row.id);
      if (!fresh) {
        setStatus(t('libraryMissing'));
        return;
      }
      const now = nowIso();
      const copy = parseProject({
        ...fresh.document,
        id: newId(),
        title: `${fresh.document.title} ${t('libraryCopySuffix')}`,
        createdAt: now,
        updatedAt: now,
      });
      await repo.put(copy, null);
      await refresh();
    });
  const remove = (row: LibraryRow) =>
    withRepo(async (repo) => {
      if (!(await store.askConfirm(t('libraryDeleteConfirm', { title: row.title })))) return;
      await repo.remove(row.id, row.revision);
      knownRevisions.delete(row.id);
      await refresh();
    });
  const saveCurrent = async () => {
    if (await saveCurrentToLibrary(project, t)) {
      await refresh();
      setStatus(t('librarySavedExplicit'));
    }
  };
  const backup = () =>
    withRepo(async (repo) => {
      const bundle = await repo.exportBundle();
      downloadText('witt-library-backup.json', `${JSON.stringify(bundle, null, 2)}\n`);
      setStatus(t('libraryBackupReady', { count: bundle.documents.length }));
    });
  const restore = (file: File) =>
    withRepo(async (repo) => {
      if (file.size > 25_000_000) throw new Error(t('importTooLarge'));
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const count = (parsed as { documents?: unknown[] })?.documents?.length ?? 0;
      if (!(await store.askConfirm(t('libraryRestoreConfirm', { count })))) return;
      try {
        const result = await repo.importBundle(parsed, parseProject, newId);
        await refresh();
        setStatus(t('libraryRestored', { count: result.imported, copies: result.duplicated }));
      } catch (error) {
        setStatus((error instanceof Error && error.message) || t('libraryInvalidBackup'));
      }
    });
  return (
    <Modal
      open
      onClose={close}
      title={t('documentLibrary')}
      id="libraryDialog"
      testId="library-dialog"
      className="action-dialog library-dialog"
      heading={false}
    >
      <p>{t('libraryDisclaimer')}</p>
      <p id="libraryStatus" role="status" aria-live="polite">
        {status}
      </p>
      <input
        type="file"
        id="libraryBackupInput"
        className="visually-hidden"
        accept="application/json,.json"
        ref={fileRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void restore(file);
        }}
      />
      <div className="dialog-actions">
        <button
          type="button"
          id="btnLibrarySaveCurrent"
          className="btn primary"
          onClick={() => void saveCurrent()}
        >
          {t('librarySaveCurrent')}
        </button>
        <button type="button" id="btnLibraryBackup" className="btn quiet" onClick={() => void backup()}>
          {t('libraryBackup')}
        </button>
        <button
          type="button"
          id="btnLibraryRestore"
          className="btn quiet"
          onClick={() => fileRef.current?.click()}
        >
          {t('libraryRestore')}
        </button>
        <button type="button" id="btnLibraryRefresh" className="btn quiet" onClick={() => void refresh()}>
          {t('libraryRefresh')}
        </button>
        <button type="button" id="btnLibraryClose" className="btn primary" onClick={close}>
          {t('close')}
        </button>
      </div>
      <div id="libraryList" className="library-list" role="list">
        {!rows.length ? <p className="inline-warning">{t('libraryEmpty')}</p> : null}
        {rows.map((row) => (
          <div key={row.id} className="library-entry" role="listitem">
            <strong>
              {row.title}
              {row.id === project.id ? ` · ${t('libraryCurrent')}` : ''}
            </strong>
            <small>{`${row.nodeCount} ${t('exampleClaims')} · ${formatWorkspaceTime(t, language, row.savedAt)} · v${row.revision}`}</small>
            <div className="library-entry-actions">
              <button type="button" className="btn quiet" onClick={() => void open(row)}>
                {t('libraryOpen')}
              </button>
              <button type="button" className="btn quiet" onClick={() => void rename(row)}>
                {t('libraryRename')}
              </button>
              <button type="button" className="btn quiet" onClick={() => void duplicate(row)}>
                {t('libraryDuplicate')}
              </button>
              {row.id !== project.id ? (
                <button type="button" className="btn quiet" onClick={() => void remove(row)}>
                  {t('libraryDelete')}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
