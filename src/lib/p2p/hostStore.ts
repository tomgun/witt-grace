// The host's session record in IndexedDB (`witt-collab` / `host`), so a reload continues the same collaboration with
// the same links (WG-030). IndexedDB rather than localStorage because it keeps the non-extractable signing key as is.
import type { HostRecord } from './session.ts';

const DB = 'witt-collab';
const STORE = 'host';
const KEY = 'current';
/** A record older than this is a forgotten session, not one to continue. */
export const HOST_RECORD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = act(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/** The last hosted session, or null when there is none, it is too old, or IndexedDB is unavailable. */
export async function loadHostRecord(nowMs: number): Promise<HostRecord | null> {
  try {
    const stored = (await run('readonly', (s) => s.get(KEY))) as
      { savedAt?: number; record?: HostRecord } | undefined;
    if (!stored?.record || stored.record.version !== 1) return null;
    if (typeof stored.savedAt !== 'number' || nowMs - stored.savedAt > HOST_RECORD_MAX_AGE_MS) return null;
    return stored.record;
  } catch {
    return null;
  }
}
/** Keep the record, or forget it (`null`). Failures only cost the reload resume, so they are not raised. */
export async function saveHostRecord(record: HostRecord | null, nowMs: number): Promise<void> {
  try {
    if (record) await run('readwrite', (s) => s.put({ savedAt: nowMs, record }, KEY));
    else await run('readwrite', (s) => s.delete(KEY));
  } catch {
    // The session goes on; only a reload would not resume it.
  }
}
