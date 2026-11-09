// The header: home, brand/about, document title, zone toggles, language and theme (inv-panels §C).
import { APPEARANCES, getStore, useAppState, useTranslator } from './store.ts';
import type { Appearance, Zone } from './store.ts';
import { LANGUAGES, LANGUAGE_NAMES } from '../lib/i18n/i18n.ts';
import type { Language, MessageKey } from '../lib/i18n/i18n.ts';
import { displayShortcut } from './shortcuts.ts';
import type { Shortcuts } from './shortcuts.ts';

const ZONE_BUTTONS: { zone: Zone; id: string; glyph: string; key: MessageKey; shortcut: string }[] = [
  { zone: 'left', id: 'btnZoneLeft', glyph: '◧', key: 'zoneLeft', shortcut: 'Alt+1' },
  { zone: 'top', id: 'btnZoneTop', glyph: '▤', key: 'zoneTop', shortcut: 'Alt+2' },
  { zone: 'right', id: 'btnZoneRight', glyph: '◨', key: 'zoneRight', shortcut: 'Alt+3' },
  { zone: 'bottom', id: 'btnZoneBottom', glyph: '▥', key: 'zoneBottom', shortcut: 'Alt+4' },
];
export const APPEARANCE_KEYS: Record<Appearance, MessageKey> = {
  light: 'light',
  dark: 'dark',
  paper: 'paper',
  cosmos: 'cosmos',
  hologram: 'hologram',
  'manuscript-book': 'manuscriptBook',
  'manuscript-pen': 'manuscriptPen',
  bitberg: 'bitbergTheme',
  terminal: 'terminalTheme',
  ascii: 'asciiTheme',
  comic: 'comicTheme',
};
export const ACRONYMS =
  'WITT = Web Interactive Thinking Tool · GRACE = Günther’s Reflective Argumentation & Collaborative Evaluation Method';

export function LanguageSelect({ id }: { id: string }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  return (
    <>
      <label className="visually-hidden" htmlFor={id}>
        {t('language')}
      </label>
      <select
        id={id}
        data-testid="language-select"
        title={t('language')}
        aria-label={t('language')}
        value={state.language}
        onChange={(e) => store.setLanguage(e.target.value as Language)}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {LANGUAGE_NAMES[lang]}
          </option>
        ))}
      </select>
    </>
  );
}
export function ThemeSelect({ id }: { id: string }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  return (
    <>
      <label className="visually-hidden" htmlFor={id}>
        {t('theme')}
      </label>
      <select
        id={id}
        data-testid="theme-select"
        title={t('theme')}
        value={state.appearance}
        onChange={(e) => store.setAppearance(e.target.value as Appearance)}
      >
        {APPEARANCES.map((appearance) => (
          <option key={appearance} value={appearance}>
            {t(APPEARANCE_KEYS[appearance])}
          </option>
        ))}
      </select>
    </>
  );
}

/** The header stays reachable even when every other zone is hidden (UX-B01). */
export function TopBar({ shortcuts }: { shortcuts: Shortcuts }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  return (
    <header className="topbar" data-testid="topbar">
      <div className="brand" aria-label="WITT">
        <button
          type="button"
          className="btn icon-btn"
          id="btnBackHome"
          aria-label="Home"
          title={t('homeBack')}
          onClick={() => store.setHome(true)}
        >
          ⌂
        </button>
        <div className="logo" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <button
          type="button"
          className="brand-title"
          id="btnEditorAbout"
          title={ACRONYMS}
          onClick={() => store.openDialog('about')}
        >
          <strong>
            WITT<span className="brand-dot">.</span>
          </strong>
          <small>GRACE Method ⓘ</small>
        </button>
      </div>
      <div className="doc-header">
        <label className="visually-hidden" htmlFor="projectTitle">
          {t('docName')}
        </label>
        <input
          id="projectTitle"
          key={state.project.id + state.project.title}
          data-testid="project-title"
          maxLength={200}
          title={t('docName')}
          defaultValue={state.project.title}
          onChange={() => undefined}
          onBlur={(e) => {
            const title = e.target.value.trim();
            if (title && title !== state.project.title) store.dispatch({ type: 'project.setTitle', title });
            else e.target.value = state.project.title;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </div>
      <div className="header-right">
        <div
          className="zone-controls history-controls"
          id="historyControls"
          role="group"
          aria-label={`${t('undo')} / ${t('redo')}`}
        >
          <button
            type="button"
            id="btnUndoTop"
            className="zone-toggle"
            disabled={!state.canUndo}
            title={`${t('undo')} (Ctrl/Cmd+Z)`}
            aria-label={`${t('undo')} (Ctrl/Cmd+Z)`}
            onClick={() => store.undo()}
          >
            ↶
          </button>
          <button
            type="button"
            id="btnRedoTop"
            className="zone-toggle"
            disabled={!state.canRedo}
            title={`${t('redo')} (Ctrl/Cmd+Shift+Z)`}
            aria-label={`${t('redo')} (Ctrl/Cmd+Shift+Z)`}
            onClick={() => store.redo()}
          >
            ↷
          </button>
        </div>
        <div className="zone-controls" role="group" aria-label={t('zoneControls')}>
          {ZONE_BUTTONS.map(({ zone, id, glyph, key, shortcut }) => (
            <button
              key={zone}
              type="button"
              id={id}
              className={`zone-toggle${state.zones[zone] ? ' active' : ''}`}
              data-testid={`zone-${zone}`}
              aria-pressed={state.zones[zone]}
              title={`${t(key)} (${shortcut})`}
              aria-label={`${t(key)} (${shortcut})`}
              onClick={() => store.toggleZone(zone)}
            >
              {glyph}
            </button>
          ))}
        </div>
        <div className="zone-controls help-controls" role="group">
          <button
            type="button"
            id="btnHelpTop"
            className="zone-toggle"
            title={`${t('shortcutsButton')} (${displayShortcut(shortcuts.help)})`}
            aria-label={`${t('shortcutsButton')} (${displayShortcut(shortcuts.help)})`}
            onClick={() => store.openDialog('help')}
          >
            ?
          </button>
        </div>
        <LanguageSelect id="localeSelect" />
        <ThemeSelect id="themeSelect" />
      </div>
    </header>
  );
}
