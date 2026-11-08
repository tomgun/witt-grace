/* WITT current active draft and save metadata (current schema only).
 * A single autosaved draft lives here. Explicit library saves use IndexedDB.
 * No automatic document history or old-version migration.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WittWorkspace = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PROJECT_KEY = 'witt-project-v3'; // Storage key is independent of document schema version.
  const META_KEY = 'witt-workspace-meta-v1';
  const stamp = () => new Date().toISOString();
  const isRecord = o => o && typeof o === 'object' && !Array.isArray(o);
  function safeParse(s, fallback) { try { return JSON.parse(s); } catch (_) { return fallback; } }
  function readMeta(storage) {
    const meta = safeParse(storage.getItem(META_KEY), {});
    return isRecord(meta) ? meta : {};
  }
  function rawActive(storage) {
    const raw = storage.getItem(PROJECT_KEY);
    return raw ? { key: PROJECT_KEY, raw } : null;
  }
  function hasSavedWork(storage) { return !!rawActive(storage); }
  function persist(storage, project, at = stamp()) {
    // Always save the project before metadata; an error cannot falsely indicate success.
    storage.setItem(PROJECT_KEY, JSON.stringify(project));
    const meta = readMeta(storage);
    meta.active = { id: project.id, title: project.title, savedAt: at };
    try { storage.setItem(META_KEY, JSON.stringify(meta)); }
    catch (_) { /* Draft remains safe even if optional metadata fails. */ }
    return meta.active;
  }

// Read-only summary for all "replace active work" entry points. The
// document's updatedAt is a CONTENT edit time; browserSavedAt records
// autosave of the active copy. Neither implies a library or file export.
function activeSummary(storage, project, temporary = false) {
  const doc = isRecord(project) ? project : {};
  const metadata = readMeta(storage);
  const active = isRecord(metadata.active) && metadata.active.id === doc.id ? metadata.active : null;
  const validTime = value => typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value)) ? value : null;
  return {
    id: typeof doc.id === 'string' ? doc.id : null,
    title: typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim() : null,
    mode: doc.mode === 'decision' ? 'decision' : doc.mode === 'argument' ? 'argument' : null,
    nodeCount: Array.isArray(doc.nodes) ? doc.nodes.length : null,
    editedAt: validTime(doc.updatedAt),
    browserSavedAt: temporary ? null : validTime(active?.savedAt),
    sessionOnly: !!temporary
  };
}
  function recordEvent(storage, kind, filename, projectId, at = stamp()) {
    if (!['lastOpenedJson', 'lastExportedJson'].includes(kind)) throw Error('Invalid workspace event');
    const meta = readMeta(storage);
    meta[kind] = { filename: String(filename).slice(0,255), projectId, at };
    storage.setItem(META_KEY, JSON.stringify(meta));
    return meta[kind];
  }
  return { PROJECT_KEY, META_KEY, readMeta, rawActive, hasSavedWork, persist, activeSummary, recordEvent };
});
