// The replacement dialog's one dependency on the document library (src/lib/library.ts).
import type { Project } from '../domain/index.ts';
import { translator } from '../lib/i18n/i18n.ts';
import { saveCurrentToLibrary as save } from './LibraryDialog.tsx';
import { getStore } from './store.ts';

/** Saves a snapshot of the active document to the library; rejects when the save did not happen. */
export async function saveCurrentToLibrary(project: Project): Promise<void> {
  const t = translator(getStore().get().messages);
  if (!(await save(project, t))) throw new Error(t('librarySaveFailed'));
}
