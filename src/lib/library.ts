// The document library: explicit saves in IndexedDB (`witt-document-library` / `documents`, version 1), local,
// same-origin and offline, exactly as the prototype's `document-library.js`. Browser storage clearing removes these
// records, so JSON backups stay essential. Writes carry an optimistic revision so a stale tab cannot overwrite.
// The library is never written by autosave; the app saves to it only on an explicit action.
import type { Project } from '../domain/index.ts';

export const LIBRARY_DB_NAME = 'witt-document-library';
export const LIBRARY_STORE = 'documents';
export const LIBRARY_DB_VERSION = 1;
export const LIBRARY_BUNDLE_FORMAT = 'witt-document-library-v1';
export const LIBRARY_BUNDLE_MAX_DOCUMENTS = 1000;

/** One stored row: the summary fields beside a deep copy of the document. */
export interface LibraryRecord {
  id: string;
  title: string;
  updatedAt: string;
  savedAt: string;
  nodeCount: number;
  revision: number;
  document: Project;
}
export type LibraryRow = Pick<
  LibraryRecord,
  'id' | 'title' | 'updatedAt' | 'savedAt' | 'revision' | 'nodeCount'
>;
export interface LibraryBundle {
  format: typeof LIBRARY_BUNDLE_FORMAT;
  exportedAt: string;
  documents: Project[];
}
export type PutResult = { id: string; revision: number; reused: boolean };
export type RemoveResult = { id: string; deleted: true };
export type ImportResult = { imported: number; duplicated: number };

export interface Library {
  get(id: string): Promise<LibraryRecord | null>;
  /** Summaries newest save first. */
  list(): Promise<LibraryRow[]>;
  /** Save a document; `expectedRevision` is the revision this tab last saw (null for a first save). */
  put(document: Project, expectedRevision?: number | null): Promise<PutResult>;
  remove(id: string, expectedRevision: number): Promise<RemoveResult>;
  /** Every stored document as a portable backup, not only the open one. */
  exportBundle(): Promise<LibraryBundle>;
  /** All-or-nothing restore: nothing existing is overwritten, colliding ids become copies. */
  importBundle(
    bundle: unknown,
    validate: (document: unknown) => Project,
    createId: () => string
  ): Promise<ImportResult>;
  close(): void;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

// Pure transforms, so tests can pin the record and backup shapes without a database.

/** The row written for a document at a given revision. */
export function libraryRecord(document: Project, revision: number, savedAt: string): LibraryRecord {
  return {
    id: document.id,
    title: document.title,
    updatedAt: document.updatedAt,
    savedAt,
    nodeCount: document.nodes.length,
    revision,
    document,
  };
}
export const libraryRow = (record: LibraryRecord): LibraryRow => ({
  id: record.id,
  title: record.title,
  updatedAt: record.updatedAt,
  savedAt: record.savedAt,
  revision: record.revision,
  nodeCount: record.nodeCount,
});
/** Rows sorted by `savedAt` descending (plain string comparison, as the prototype). */
export const libraryRows = (records: LibraryRecord[]): LibraryRow[] =>
  records.map(libraryRow).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
/** The backup JSON shape. */
export const libraryBundle = (records: LibraryRecord[], exportedAt: string): LibraryBundle => ({
  format: LIBRARY_BUNDLE_FORMAT,
  exportedAt,
  documents: records.map((r) => clone(r.document)),
});
/** Validate every document of a backup before any write: the bundle shape, each document, distinct ids. */
export function validateBundle(bundle: unknown, validate: (document: unknown) => Project): Project[] {
  if (
    !isRecord(bundle) ||
    bundle.format !== LIBRARY_BUNDLE_FORMAT ||
    !Array.isArray(bundle.documents) ||
    bundle.documents.length > LIBRARY_BUNDLE_MAX_DOCUMENTS
  )
    throw new Error('Invalid WITT library bundle');
  const originals = bundle.documents.map((doc) => clone(validate(clone(doc))));
  if (originals.some((doc) => !doc || typeof doc.id !== 'string' || !doc.id || !Array.isArray(doc.nodes)))
    throw new Error('Invalid document');
  if (new Set(originals.map((doc) => doc.id)).size !== originals.length)
    throw new Error('Duplicate document IDs in bundle');
  return originals;
}
/** The records a restore writes: colliding ids get a fresh id and " (imported)" after the title; every record is
 * revision 1 with the same `savedAt`. */
export function planImport(
  originals: Project[],
  existingIds: Iterable<string>,
  createId: () => string,
  savedAt: string
): { records: LibraryRecord[]; duplicated: number } {
  const used = new Set(existingIds);
  const records: LibraryRecord[] = [];
  let duplicated = 0;
  for (const item of originals) {
    const doc = clone(item);
    if (used.has(doc.id)) {
      let id: string | null = null;
      for (let tries = 0; tries < 12; tries++) {
        const candidate = createId();
        if (typeof candidate === 'string' && candidate && !used.has(candidate)) {
          id = candidate;
          break;
        }
      }
      if (!id) throw new Error('Could not generate collision-free document ID');
      doc.id = id;
      doc.title = doc.title + ' (imported)';
      duplicated++;
    }
    used.add(doc.id);
    records.push(libraryRecord(doc, 1, savedAt));
  }
  return { records, duplicated };
}

// The IndexedDB repository.

type Finish<T> = (value: T) => void;
type Abort = (error: unknown) => void;

function openDatabase(provider: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = provider.open(LIBRARY_DB_NAME, LIBRARY_DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LIBRARY_STORE))
        db.createObjectStore(LIBRARY_STORE, { keyPath: 'id' });
    };
    req.onerror = () => reject(req.error || new Error('IndexedDB:n avaaminen epäonnistui'));
    req.onblocked = () => reject(new Error('Tietokanta on toisen ikkunan lukitsema'));
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

/** Wrap an open database. `now` supplies the `savedAt` / `exportedAt` stamps. */
export function createRepository(db: IDBDatabase, now: () => string): Library {
  let closed = false;
  const transact = <T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore, finish: Finish<T>, abort: Abort) => void
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      if (closed) {
        reject(new Error('Tietokantayhteys on suljettu'));
        return;
      }
      let tx: IDBTransaction;
      try {
        tx = db.transaction(LIBRARY_STORE, mode);
      } catch (error) {
        reject(error);
        return;
      }
      let result: T;
      let fail: unknown = null;
      tx.oncomplete = () => (fail ? reject(fail) : resolve(result));
      tx.onerror = () => reject(tx.error || new Error('Tietokantaoperaatio epäonnistui'));
      tx.onabort = () => reject(fail || tx.error || new Error('Tietokantamuutos peruttiin'));
      const finish: Finish<T> = (value) => {
        result = value;
      };
      const abort: Abort = (error) => {
        fail = error;
        try {
          tx.abort();
        } catch {
          reject(error);
        }
      };
      try {
        operation(tx.objectStore(LIBRARY_STORE), finish, abort);
      } catch (error) {
        abort(error);
      }
    });

  const get = (id: string) =>
    transact<LibraryRecord | null>('readonly', (store, finish, abort) => {
      const req = store.get(id);
      req.onsuccess = () => finish(req.result ? clone(req.result as LibraryRecord) : null);
      req.onerror = () => abort(req.error);
    });
  const list = () =>
    transact<LibraryRow[]>('readonly', (store, finish, abort) => {
      const req = store.getAll();
      req.onsuccess = () => finish(libraryRows(req.result as LibraryRecord[]));
      req.onerror = () => abort(req.error);
    });
  function put(document: Project, expectedRevision: number | null = null): Promise<PutResult> {
    const raw: unknown = document;
    if (
      !isRecord(raw) ||
      typeof raw.id !== 'string' ||
      !raw.id ||
      typeof raw.title !== 'string' ||
      !Array.isArray(raw.nodes)
    )
      return Promise.reject(new Error('Tallennettava asiakirja on virheellinen'));
    const safe = clone(document);
    if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1))
      return Promise.reject(new Error('Virheellinen odotettu versio'));
    return transact<PutResult>('readwrite', (store, finish, abort) => {
      const req = store.get(safe.id);
      req.onerror = () => abort(req.error);
      req.onsuccess = () => {
        const old = req.result as LibraryRecord | undefined;
        if (old && expectedRevision !== old.revision) {
          if (expectedRevision === null && JSON.stringify(old.document) === JSON.stringify(safe)) {
            finish({ id: old.id, revision: old.revision, reused: true });
            return;
          }
          abort(
            new Error(
              'Ristiriitainen asiakirjaversio: vie paikallinen työ JSONiksi ja avaa kirjaston uusin versio. Tietoja ei korvattu.'
            )
          );
          return;
        }
        if (!old && expectedRevision !== null) {
          abort(new Error('Asiakirja on poistettu toisessa ikkunassa. Tallennus estettiin.'));
          return;
        }
        const revision = (old?.revision || 0) + 1;
        const saved = store.put(libraryRecord(safe, revision, now()));
        saved.onerror = () => abort(saved.error);
        finish({ id: safe.id, revision, reused: false });
      };
    });
  }
  function remove(id: string, expectedRevision: number): Promise<RemoveResult> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
      return Promise.reject(new Error('Poistoon vaaditaan asiakirjan tunnettu versio'));
    return transact<RemoveResult>('readwrite', (store, finish, abort) => {
      const read = store.get(id);
      read.onerror = () => abort(read.error);
      read.onsuccess = () => {
        const old = read.result as LibraryRecord | undefined;
        if (!old) {
          abort(new Error('Asiakirjaa ei enää ole'));
          return;
        }
        if (old.revision !== expectedRevision) {
          abort(new Error('Asiakirjaa on muokattu toisessa ikkunassa. Poisto estettiin.'));
          return;
        }
        const req = store.delete(id);
        req.onerror = () => abort(req.error);
        finish({ id, deleted: true });
      };
    });
  }
  async function exportBundle(): Promise<LibraryBundle> {
    const records = await transact<LibraryRecord[]>('readonly', (store, finish, abort) => {
      const req = store.getAll();
      req.onsuccess = () => finish(req.result as LibraryRecord[]);
      req.onerror = () => abort(req.error);
    });
    return libraryBundle(records, now());
  }
  function importBundle(
    bundle: unknown,
    validate: (document: unknown) => Project,
    createId: () => string
  ): Promise<ImportResult> {
    if (
      !isRecord(bundle) ||
      bundle.format !== LIBRARY_BUNDLE_FORMAT ||
      !Array.isArray(bundle.documents) ||
      bundle.documents.length > LIBRARY_BUNDLE_MAX_DOCUMENTS
    )
      return Promise.reject(new Error('Invalid WITT library bundle'));
    if (typeof validate !== 'function' || typeof createId !== 'function')
      return Promise.reject(new Error('Import validators required'));
    let originals: Project[];
    try {
      originals = validateBundle(bundle, validate);
    } catch (error) {
      return Promise.reject(error);
    }
    return transact<ImportResult>('readwrite', (store, finish, abort) => {
      const req = store.getAll();
      req.onerror = () => abort(req.error);
      req.onsuccess = () => {
        try {
          const existing = (req.result as LibraryRecord[]).map((r) => r.id);
          const plan = planImport(originals, existing, createId, now());
          for (const record of plan.records) {
            const write = store.put(record);
            write.onerror = () => abort(write.error);
          }
          finish({ imported: originals.length, duplicated: plan.duplicated });
        } catch (error) {
          abort(error);
        }
      };
    });
  }
  return {
    get,
    list,
    put,
    remove,
    exportBundle,
    importBundle,
    close() {
      closed = true;
      db.close();
    },
  };
}

const browserIndexedDb = (): IDBFactory | null => (typeof indexedDB !== 'undefined' ? indexedDB : null);

/** Open the library. Rejects with the prototype's message when IndexedDB is unavailable; pass a fake factory in
 * tests. `now` is the clock for save stamps. */
export function createLibrary(
  provider: IDBFactory | null = browserIndexedDb(),
  now: () => string = () => new Date().toISOString()
): Promise<Library> {
  if (!provider) return Promise.reject(new Error('IndexedDB ei ole käytettävissä tässä selainympäristössä'));
  return openDatabase(provider).then((db) => createRepository(db, now));
}
