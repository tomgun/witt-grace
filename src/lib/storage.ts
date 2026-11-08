// Browser storage behind a small interface so the app can run without it (private mode, quota, tests).
// Keys are the prototype's, so a document autosaved by the prototype on the same origin is found.
import { parseProject, serializeProjectCompact } from '../domain/index.ts';
import type { Project } from '../domain/index.ts';

export const PROJECT_KEY = 'witt-project-v3';
export const VIEW_KEY = 'witt-view-v1';
export const LOCALE_KEY = 'witt-locale-v1';
export const APPEARANCE_KEY = 'witt-appearance-v1';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export const memoryStore = (): KeyValueStore => {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
};
/** `localStorage` when the browser allows it, else an in-memory store the session loses on reload (reported by the caller). */
export function browserStore(): { store: KeyValueStore; persistent: boolean } {
  try {
    const probe = '__witt_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return { store: window.localStorage, persistent: true };
  } catch {
    return { store: memoryStore(), persistent: false };
  }
}

export type SaveResult = { ok: true; at: string } | { ok: false; reason: string };
export function saveProject(store: KeyValueStore, project: Project, at: string): SaveResult {
  try {
    store.setItem(PROJECT_KEY, serializeProjectCompact(project));
    return { ok: true, at };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
export type LoadResult =
  { ok: true; project: Project } | { ok: false; reason: string } | { ok: false; empty: true };
export function loadProject(store: KeyValueStore): LoadResult {
  let raw: string | null = null;
  try {
    raw = store.getItem(PROJECT_KEY);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  if (!raw) return { ok: false, empty: true };
  try {
    return { ok: true, project: parseProject(JSON.parse(raw)) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
export function readPreference(store: KeyValueStore, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}
export function writePreference(store: KeyValueStore, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch {
    // preferences are optional
  }
}
