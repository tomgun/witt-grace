import { APPEARANCES, getStore, useAppState, useTranslator } from './store.ts';
import type { Appearance, Zone } from './store.ts';
import { LANGUAGES, LANGUAGE_NAMES } from '../lib/i18n/i18n.ts';
import type { Language } from '../lib/i18n/i18n.ts';

const ZONES: {
  zone: Zone;
  glyph: string;
  key: 'zoneLeft' | 'zoneTop' | 'zoneRight' | 'zoneBottom';
  shortcut: string;
}[] = [
  { zone: 'left', glyph: '◧', key: 'zoneLeft', shortcut: 'Alt+1' },
  { zone: 'top', glyph: '▤', key: 'zoneTop', shortcut: 'Alt+2' },
  { zone: 'right', glyph: '◨', key: 'zoneRight', shortcut: 'Alt+3' },
  { zone: 'bottom', glyph: '▥', key: 'zoneBottom', shortcut: 'Alt+4' },
];
const APPEARANCE_KEYS: Record<Appearance, 'light' | 'dark' | 'paper' | 'bitbergTheme'> = {
  light: 'light',
  dark: 'dark',
  paper: 'paper',
  bitberg: 'bitbergTheme',
};

/** The header stays reachable even when every other zone is hidden (UX-B01). */
export function TopBar() {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  return (
    <header className="topbar" data-testid="topbar">
      <div className="brand" aria-label="WITT">
        <div className="logo" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <strong>
            WITT<span className="brand-dot">.</span>
          </strong>
          <small>GRACE</small>
        </div>
      </div>
      <div className="doc-header">
        <label className="visually-hidden" htmlFor="projectTitle">
          {t('docName')}
        </label>
        <input
          id="projectTitle"
          data-testid="project-title"
          maxLength={200}
          title={t('docName')}
          value={state.project.title}
          onChange={(e) =>
            store.dispatch({ type: 'project.setTitle', title: e.target.value || state.project.title })
          }
        />
      </div>
      <div className="header-right">
        <div className="zone-controls" role="group" aria-label={t('zoneControls')}>
          {ZONES.map(({ zone, glyph, key, shortcut }) => (
            <button
              key={zone}
              type="button"
              className="zone-toggle"
              data-testid={`zone-${zone}`}
              aria-pressed={state.view.zones[zone]}
              title={`${t(key)} (${shortcut})`}
              aria-label={`${t(key)} (${shortcut})`}
              onClick={() => store.toggleZone(zone)}
            >
              {glyph}
            </button>
          ))}
        </div>
        <label className="visually-hidden" htmlFor="localeSelect">
          {t('language')}
        </label>
        <select
          id="localeSelect"
          data-testid="language-select"
          title={t('language')}
          value={state.language}
          onChange={(e) => store.setLanguage(e.target.value as Language)}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {LANGUAGE_NAMES[lang]}
            </option>
          ))}
        </select>
        <label className="visually-hidden" htmlFor="themeSelect">
          {t('theme')}
        </label>
        <select
          id="themeSelect"
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
      </div>
    </header>
  );
}
