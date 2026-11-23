// The prototype's #examplesDialog: five synthetic three-assessor debates (plus two added recruitment examples) (witt-grace-gpt-proto/src/examples.js). The
// cards are a static manifest; the documents themselves are fetched from public/examples/ only when one is chosen, so
// ~150 kB of fixtures stay out of the main bundle. Opening one passes the replacement dialog and gets a fresh id.
import { useEffect, useRef, useState } from 'react';
import { arranged, parseProject } from '../domain/index.ts';
import { embedded } from '../lib/embedded.ts';
import { newId } from '../lib/providers.ts';
import { enterEvaluate } from './actions.ts';
import { getStore, useAppState, useTranslator } from './store.ts';
import { stopTutorial } from './Tutorial.tsx';

import { EXAMPLES } from './examples.ts';
import type { ExampleEntry } from './examples.ts';

export { EXAMPLES };

/** Fetches one example relative to the page (Vite `base: './'`), so it works under any path and from a folder. */
export async function fetchExample(entry: ExampleEntry): Promise<unknown> {
  // A supporter package carries its examples inside the page: a file opened from disk cannot fetch.
  const carried = embedded().examples[entry.filename];
  if (carried !== undefined) return carried;
  const response = await fetch(`examples/${entry.filename}`, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`${entry.filename}: HTTP ${response.status}`);
  return response.json();
}

export function ExamplesDialog() {
  const t = useTranslator();
  const store = getStore();
  const { dialog } = useAppState();
  const open = dialog === 'examples';
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  const close = () => store.openDialog(null);
  const choose = async (entry: ExampleEntry) => {
    if (busy) return;
    // A new workspace: never the fixture's own id, so a library copy is never overwritten.
    const id = newId();
    const choice = await store.prepareReplacement(t('demoConfirm'), id);
    if (!choice) return;
    setBusy(true);
    try {
      const sample = parseProject(await fetchExample(entry));
      stopTutorial();
      // The examples open as a tidy tree whatever places their files carry (owner 2026-11-19, S-15).
      store.load({ ...arranged(sample), id });
      store.openDialog(null);
      if (store.get().project.users.length > 1) enterEvaluate();
    } catch (error) {
      store.showMessage(`${entry.title}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={ref}
      id="examplesDialog"
      className="examples-dialog"
      aria-labelledby="examplesTitle"
      data-testid="examples-dialog"
      onClose={close}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <h2 id="examplesTitle">{t('examplesTitle')}</h2>
          <button
            type="button"
            id="btnCloseExamples"
            className="btn icon-btn"
            aria-label={t('close')}
            onClick={close}
          >
            ×
          </button>
        </div>
        <p>{t('examplesIntro')}</p>
        <div id="exampleCards" className="example-cards">
          {open
            ? EXAMPLES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="example-card"
                  data-example={entry.id}
                  disabled={busy}
                  onClick={() => void choose(entry)}
                >
                  <span className={`example-type ${entry.mode}`}>
                    {t(entry.mode === 'decision' ? 'modeDecision' : 'modeArgument')}
                  </span>
                  <strong>{entry.title}</strong>
                  <small>{entry.description}</small>
                  <small>
                    {entry.nodeCount} {t('exampleClaims')} · {entry.participants.length} {t('examplePeople')}
                  </small>
                </button>
              ))
            : null}
        </div>
      </div>
    </dialog>
  );
}
