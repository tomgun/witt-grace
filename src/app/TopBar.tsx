// The header: home, brand/about, document title, zone toggles, language and theme (inv-panels §C).
import { EditionBadge } from './EditionBadge.tsx';
import type { Mode } from '../domain/index.ts';
import { APPEARANCES, getStore, useAppState, useTranslator } from './store.ts';
import type { Appearance, Zone } from './store.ts';
import { LANGUAGES, LANGUAGE_NAMES } from '../lib/i18n/i18n.ts';
import type { Language, MessageKey } from '../lib/i18n/i18n.ts';
import { toggleFocus } from './actions.ts';
import { displayShortcut } from './shortcuts.ts';
import type { Shortcuts } from './shortcuts.ts';
import { CollabChip } from './CollabDialog.tsx';
import { MENU_GROUP, useMenuDismissal } from './menus.ts';

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
  grove: 'groveTheme',
  obsidian: 'obsidianTheme',
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
  const inSession = state.collab !== null && state.collab.phase !== 'ended';
  useMenuDismissal();
  const setMode = (mode: Mode) => {
    if (mode === state.project.mode) return;
    if (
      mode === 'argument' &&
      state.project.nodes.some((n) => n.relation === 'option' || n.relation === 'group')
    ) {
      store.showMessage(t('optionsPreventArgumentMode'));
      return;
    }
    store.dispatch({ type: 'project.setMode', mode });
  };
  return (
    <header className="topbar" data-testid="topbar">
      {/* First in the tab order, seen only with the focus on it: past the two rows of controls to the selected card
          or the table (accessibility check 2026-11-20, S-15). */}
      <button
        type="button"
        className="skip-link"
        id="btnSkipToContent"
        onClick={() =>
          // The selected card of the tree, or the table's search field: the main area itself is not made
          // focusable, because a press on a card's text would then move the focus to it and away from the card.
          document
            .querySelector<HTMLElement>('#nodesLayer .node.selected, #tableSearch')
            ?.focus({ preventScroll: false })
        }
      >
        {t('skipToContent')}
      </button>
      {/* The page's heading for a screen reader: the workspace has no visible one (accessibility check 2026-11-20). */}
      <h1 className="visually-hidden" id="workspaceHeading">{`WITT: ${state.project.title}`}</h1>
      <div className="brand" aria-label="WITT">
        <button
          type="button"
          className="btn icon-btn"
          id="btnBackHome"
          aria-label={t('homeBack')}
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
      <EditionBadge />
      <div className="doc-header">
        <label className="visually-hidden" htmlFor="projectTitle">
          {t('docName')}
        </label>
        <input
          id="projectTitle"
          key={state.project.id + state.project.title}
          data-testid="project-title"
          maxLength={200}
          // As wide as its text (styles.css uses field-sizing where the browser has it; `size` elsewhere).
          size={Math.max(16, Math.min(80, state.project.title.length + 2))}
          title={`${t('docName')}: ${state.project.title}`}
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
        {/* The document's type beside its name: both choices in sight, the current one lit, no list to open
            (owner 2026-11-19, S-15: first a toolbar switch, then a menu entry, then a chip with a list). */}
        <div
          id="docTypeMenu"
          className="mode-switch doc-type-switch"
          role="group"
          aria-label={t('docTypeLabel')}
          title={t('docTypeHelp')}
        >
          <button
            type="button"
            id="modeArgument"
            data-testid="mode-argument"
            className={state.project.mode === 'argument' ? 'active' : ''}
            aria-pressed={state.project.mode === 'argument'}
            onClick={() => setMode('argument')}
          >
            {t('modeArgument')}
          </button>
          <button
            type="button"
            id="modeDecision"
            data-testid="mode-decision"
            className={state.project.mode === 'decision' ? 'active' : ''}
            aria-pressed={state.project.mode === 'decision'}
            onClick={() => setMode('decision')}
          >
            {t('modeDecision')}
          </button>
        </div>
        <CollabChip />
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
            title={inSession ? t('collabNoUndo') : `${t('undo')} (Ctrl/Cmd+Z)`}
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
            title={inSession ? t('collabNoUndo') : `${t('redo')} (Ctrl/Cmd+Shift+Z)`}
            aria-label={`${t('redo')} (Ctrl/Cmd+Shift+Z)`}
            onClick={() => store.redo()}
          >
            ↷
          </button>
          <button
            type="button"
            id="btnHistoryTop"
            className="zone-toggle"
            disabled={inSession}
            title={inSession ? t('historyInSession') : t('historyDialogTitle')}
            aria-label={t('historyDialogTitle')}
            onClick={() => store.openDialog('history')}
          >
            ≣
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
          {/* Tree only, beside the panel toggles it belongs with (owner 2026-11-19, S-15): everything off at once. */}
          <button
            type="button"
            id="btnFocusTop"
            className="zone-toggle zone-focus"
            title={`${t('focusTree')} (${shortcuts.focus})`}
            aria-label={`${t('focusTree')} (${shortcuts.focus})`}
            onClick={() => toggleFocus(true)}
          >
            ⛶
          </button>
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
        {/* Language and theme are set once in a while: behind one button, not two selects in the best place of the
            screen (S-15, 2026-11-19). The home screen keeps its own two selects. */}
        <details id="settingsMenu" name={MENU_GROUP} className="toolbar-popover topbar-settings">
          <summary aria-label={t('settingsMenu')} title={t('settingsMenu')}>
            ⚙
          </summary>
          <div className="toolbar-popup">
            <span className="menu-label">{t('language')}</span>
            <LanguageSelect id="localeSelect" />
            <span className="menu-label">{t('theme')}</span>
            <ThemeSelect id="themeSelect" />
          </div>
        </details>
      </div>
    </header>
  );
}
