// WITT – pikaohje: method help, keyboard help and the customisable shortcuts (inv-review-vote-table §G.1–G.2).
import { useState } from 'react';
import { Modal } from './dialogs.tsx';
import {
  SHORTCUT_CHOICES,
  SHORTCUT_DEFAULTS,
  SHORTCUT_LABELS,
  displayShortcut,
  readShortcuts,
  resetShortcuts,
  writeShortcuts,
} from './shortcuts.ts';
import type { ShortcutAction, Shortcuts } from './shortcuts.ts';
import { getStore, useTranslator } from './store.ts';

export function HelpDialog({ onShortcutsChanged }: { onShortcutsChanged: () => void }) {
  const t = useTranslator();
  const store = getStore();
  const [shortcuts, setShortcuts] = useState<Shortcuts>(() => readShortcuts(window.localStorage));
  const [status, setStatus] = useState('');
  const change = (action: ShortcutAction, value: string) => {
    const next = { ...shortcuts, [action]: value };
    if (new Set(Object.values(next)).size !== Object.values(next).length) {
      setStatus(t('shortcutConflict'));
      return;
    }
    setShortcuts(next);
    writeShortcuts(window.localStorage, next);
    setStatus(t('shortcutSaved'));
    onShortcutsChanged();
  };
  const reset = () => {
    resetShortcuts(window.localStorage);
    setShortcuts({ ...SHORTCUT_DEFAULTS });
    setStatus(t('shortcutSaved'));
    onShortcutsChanged();
  };
  const paragraphs = [
    'helpMethod',
    'helpTree',
    'helpComments',
    'assessmentHelpMain',
    'helpIndex',
    'helpLocal',
  ] as const;
  const keyboard = [
    'shortcutNavigation',
    'canvasKeyboardHelp',
    'shortcutNavHorizontal',
    'shortcutNavVertical',
    'shortcutNavFourWay',
    'shortcutNavToggle',
    'shortcutEditing',
    'shortcutAdding',
  ] as const;
  return (
    <Modal
      open
      onClose={() => store.openDialog(null)}
      title={t('helpTitle')}
      id="helpDialog"
      testId="help-dialog"
    >
      {paragraphs.map((key) => (
        <p key={key}>{t(key)}</p>
      ))}
      <section aria-label={t('shortcutTitle')} className="shortcuts-help">
        <h3>{t('shortcutTitle')}</h3>
        {keyboard.map((key) => (
          <p key={key}>{t(key)}</p>
        ))}
        <p id="shortcutCurrentAdd" className="shortcut-current-add" aria-live="polite">
          {t('shortcutCurrentAdd', {
            support: displayShortcut(shortcuts.support),
            oppose: displayShortcut(shortcuts.oppose),
          })}
        </p>
        <p>{t('shortcutContext')}</p>
        <p>{t('shortcutOther')}</p>
        <p>{t('shortcutTable')}</p>
        <div className="shortcut-settings">
          <h4>{t('shortcutCustomize')}</h4>
          <p>{t('shortcutCustomizeHelp')}</p>
          <div id="shortcutSettings" className="shortcut-settings-grid">
            {(Object.keys(SHORTCUT_LABELS) as ShortcutAction[]).map((action) => (
              <label key={action} htmlFor={`shortcut-${action}`} style={{ display: 'contents' }}>
                <span>{t(SHORTCUT_LABELS[action])}</span>
                <select
                  id={`shortcut-${action}`}
                  aria-label={t(SHORTCUT_LABELS[action])}
                  value={shortcuts[action]}
                  onChange={(e) => change(action, e.target.value)}
                >
                  {SHORTCUT_CHOICES.map((choice) => (
                    <option key={choice} value={choice}>
                      {displayShortcut(choice)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button type="button" id="btnShortcutsReset" className="btn quiet" onClick={reset}>
            {t('shortcutReset')}
          </button>
          <p id="shortcutSettingsStatus" role="status">
            {status}
          </p>
        </div>
      </section>
      <p>{t('helpP2P')}</p>
      <div className="dialog-actions">
        <button
          type="button"
          className="btn primary"
          id="btnHelpClose"
          onClick={() => store.openDialog(null)}
        >
          {t('close')}
        </button>
      </div>
    </Modal>
  );
}
