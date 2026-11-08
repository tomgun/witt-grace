// The prototype's #examplesDialog: five synthetic three-assessor debates (witt-grace-gpt-proto/src/examples.js). The
// cards are a static manifest; the documents themselves are fetched from public/examples/ only when one is chosen, so
// ~150 kB of fixtures stay out of the main bundle. Opening one passes the replacement dialog and gets a fresh id.
import { useEffect, useRef, useState } from 'react';
import { parseProject } from '../domain/index.ts';
import { newId } from '../lib/providers.ts';
import { getStore, useAppState, useTranslator } from './store.ts';
import { stopTutorial } from './Tutorial.tsx';

export interface ExampleEntry {
  id: string;
  title: string;
  description: string;
  filename: string;
  participants: string[];
  nodeCount: number;
}
/** The prototype's `Examples.list()` verbatim (fictional data; the files are byte-equal copies of its fixtures). */
export const EXAMPLES: readonly ExampleEntry[] = [
  {
    id: 'painonhallinta',
    title: 'Painonhallinta: mikä on kestävä tapa?',
    description: 'Liikunta, nälkä, ruoan mieluisuus, aika ja yksilöllinen sopivuus.',
    filename: 'debate-painonhallinta.witt.json',
    participants: ['Aada · aktiiviliikkuja', 'Beni · kiireinen arki', 'Caro · ruoan ilo ja terveys'],
    nodeCount: 13,
  },
  {
    id: 'etatyomalli',
    title: 'Etä- ja lähityö: yhteinen työskentelymalli',
    description: 'Kolmen toimistopäivän mallia arvioivat eri työtilanteissa olevat.',
    filename: 'debate-etatyomalli.witt.json',
    participants: ['Eeva · tiiminvetäjä', 'Oskari · keskittymistehtävät', 'Mira · pitkä työmatka'],
    nodeCount: 12,
  },
  {
    id: 'kaupunkiliikenne',
    title: 'Kaupunkiliikenne: keskustan läpiajo',
    description: 'Asukkaan, yrittäjän ja esteettömyyden näkökulmat.',
    filename: 'debate-kaupunkiliikenne.witt.json',
    participants: ['Leena · keskustan asukas', 'Joonas · yrittäjä', 'Sari · esteettömyys'],
    nodeCount: 11,
  },
  {
    id: 'tekoalykehitys',
    title: 'Tekoälyagentit ohjelmistokehityksessä',
    description: 'Tuottavuuden, tietoturvan ja toimitusvastuun vertailu.',
    filename: 'debate-tekoalykehitys.witt.json',
    participants: ['Noora · turvallisuus', 'Tuomas · kehittäjä', 'Veera · toimitus'],
    nodeCount: 11,
  },
  {
    id: 'pilvialusta',
    title: 'Päätöksenteko: pilvialustan valinta',
    description: 'Kolme arvioijaa, faktat ja arvostukset, erisuuntaiset vaikutukset sekä reunaehdot.',
    filename: 'debate-pilvialusta.witt.json',
    participants: ['Aino', 'Bertta', 'Caro'],
    nodeCount: 12,
  },
];

/** Fetches one example relative to the page (Vite `base: './'`), so it works under any path and from a folder. */
export async function fetchExample(entry: ExampleEntry): Promise<unknown> {
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
    const choice = await store.prepareReplacement(t('demoConfirm'));
    if (!choice) return;
    setBusy(true);
    try {
      const sample = parseProject(await fetchExample(entry));
      stopTutorial();
      // A new workspace: never the fixture's own id, so a library copy is never overwritten.
      store.load({ ...sample, id: newId() });
      store.openDialog(null);
      if (store.get().project.users.length > 1) store.setView({ workflow: 'evaluate' });
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
