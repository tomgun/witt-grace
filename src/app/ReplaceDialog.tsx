// The prototype's #replaceDialog ("Mitä tehdään nykyiselle työlle?"): every entry point that replaces the active
// document (new work, example, tutorial, file, library, AI draft) passes through store.prepareReplacement, which
// renders this. Peruuta stays; "Hylkää nykyinen ja jatka" proceeds; "Tallenna kirjastoon ja jatka" saves first and
// proceeds only when the save succeeded.
import { useState } from 'react';
import { Modal } from './dialogs.tsx';
import { saveCurrentToLibrary } from './libraryBridge.ts';
import { getStore, useAppState, useTranslator } from './store.ts';
import type { ModalRequest, ReplaceChoice } from './store.ts';

/** The prototype's `formatWorkspaceTime`: a medium date and short time in the UI language, or "Tarkka aika ei tiedossa". */
export function formatWorkspaceTime(
  value: string | null | undefined,
  locale: string,
  unknown: string
): string {
  if (!value || Number.isNaN(Date.parse(value))) return unknown;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}

export function ReplaceDialog({ request }: { request: Extract<ModalRequest, { kind: 'replace' }> }) {
  const t = useTranslator();
  const store = getStore();
  const state = useAppState();
  const [saving, setSaving] = useState(false);
  const { project } = state;
  const done = (choice: ReplaceChoice) => {
    store.closeModal();
    request.resolve(choice);
  };
  const keep = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveCurrentToLibrary(project);
      done('keep');
    } catch (error) {
      setSaving(false);
      store.notify({
        kind: 'error',
        text: `${t('libraryUnavailable')}: ${error instanceof Error ? error.message : String(error)}`,
      });
      done(null);
    }
  };
  const unknown = t('homeTimeUnknown');
  const info = [
    t(project.mode === 'decision' ? 'modeDecision' : 'modeArgument'),
    t('replaceNodeCount', { count: project.nodes.length }),
  ].join(' · ');
  // The autosave happens with every change, so the document's own edit time is the browser copy's time as well
  // (the home card shows the same value); a session-only store has no durable copy to date.
  const editedAt = formatWorkspaceTime(project.updatedAt, state.language, unknown);
  const autosavedAt = state.storagePersistent ? editedAt : t('replaceSessionOnly');
  return (
    <Modal
      open
      onClose={() => done(null)}
      title={t('replaceTitle')}
      id="replaceDialog"
      testId="replace-dialog"
      heading={false}
    >
      <section className="replace-current" aria-labelledby="replaceCurrentLabel">
        <p id="replaceCurrentLabel" className="replace-current-kicker">
          {t('replaceCurrentLabel')}
        </p>
        <strong id="replaceCurrentName" className="replace-current-name">
          {project.title.trim() || unknown}
        </strong>
        <p id="replaceCurrentInfo" className="replace-current-info">
          {info}
        </p>
        <dl className="replace-timestamps">
          <dt>{t('replaceEditedLabel')}</dt>
          <dd id="replaceEditedAt">{editedAt}</dd>
          <dt>{t('replaceAutosaveLabel')}</dt>
          <dd id="replaceAutosavedAt">{autosavedAt}</dd>
        </dl>
      </section>
      <p className="replace-next-label">{t('replaceNextAction')}</p>
      <p id="replaceDescription">{request.description}</p>
      <p className="inspector-note">{t('replaceReminder')}</p>
      <div className="dialog-actions replace-actions">
        <button type="button" className="btn quiet" id="replaceCancel" autoFocus onClick={() => done(null)}>
          {t('cancel')}
        </button>
        <button type="button" className="btn quiet" id="replaceForget" onClick={() => done('forget')}>
          {t('replaceForget')}
        </button>
        <button
          type="button"
          className="btn primary"
          id="replaceKeep"
          disabled={saving}
          onClick={() => void keep()}
        >
          {t('replaceKeep')}
        </button>
      </div>
    </Modal>
  );
}
