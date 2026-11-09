// Customisable single-key shortcuts (`witt-keybindings-v1`), ported from the prototype (inv-canvas §9.2).
import type { KeyValueStore } from '../lib/storage.ts';
import { readPreference, writePreference } from '../lib/storage.ts';
import type { MessageKey } from '../lib/i18n/i18n.ts';

export const SHORTCUT_STORAGE = 'witt-keybindings-v1';
export type ShortcutAction =
  'support' | 'oppose' | 'value' | 'option' | 'table' | 'focus' | 'assessment' | 'help' | 'arrange';
export type Shortcuts = Record<ShortcutAction, string>;
export const SHORTCUT_DEFAULTS: Readonly<Shortcuts> = Object.freeze({
  support: '+',
  oppose: '-',
  // Added after the prototype (owner 2026-11-09): a value judgment under the selected card.
  value: ',',
  option: '*',
  table: 'T',
  focus: 'F',
  assessment: 'R',
  help: '?',
  arrange: 'Alt+A',
});
export const SHORTCUT_CHOICES = [
  '+',
  '-',
  '*',
  ',',
  '.',
  'Ctrl+Enter',
  'Ctrl+Shift+Enter',
  'Ctrl+Alt+Enter',
  'Alt+1',
  'Alt+2',
  'Alt+3',
  'Alt+4',
  'Alt+5',
  'Alt+6',
  'Alt+A',
  'Alt+F',
  'Alt+H',
  'Alt+R',
  'Alt+T',
  'F',
  'H',
  'R',
  'T',
  '?',
];
export const SHORTCUT_LABELS: Record<ShortcutAction, MessageKey> = {
  support: 'supportAdd',
  oppose: 'opposeAdd',
  value: 'valueAdd',
  option: 'optionAdd',
  table: 'tableView',
  focus: 'focusTree',
  assessment: 'assessmentStart',
  help: 'shortcutsButton',
  arrange: 'arrange',
};
const ACTIONS = Object.keys(SHORTCUT_DEFAULTS) as ShortcutAction[];

/** Reads the saved bindings; an unchanged v0.10 default set is upgraded to `+`/`-`; invalid sets fall back. */
export function readShortcuts(store: KeyValueStore): Shortcuts {
  try {
    const raw: unknown = JSON.parse(readPreference(store, SHORTCUT_STORAGE) ?? 'null');
    const saved = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const candidate: Shortcuts = { ...SHORTCUT_DEFAULTS, ...(saved as Partial<Shortcuts>) };
    const oldDefaults: Partial<Shortcuts> = {
      support: 'Ctrl+Enter',
      oppose: 'Ctrl+Shift+Enter',
      table: 'T',
      focus: 'F',
      assessment: 'R',
      help: '?',
      arrange: 'Alt+A',
    };
    if (raw && (Object.keys(oldDefaults) as ShortcutAction[]).every((k) => saved[k] === oldDefaults[k])) {
      candidate.support = '+';
      candidate.oppose = '-';
    }
    const values = Object.values(candidate);
    if (
      ACTIONS.every((k) => SHORTCUT_CHOICES.includes(candidate[k])) &&
      new Set(values).size === values.length
    )
      return candidate;
  } catch {
    // storage is optional
  }
  return { ...SHORTCUT_DEFAULTS };
}
export function writeShortcuts(store: KeyValueStore, shortcuts: Shortcuts): void {
  writePreference(store, SHORTCUT_STORAGE, JSON.stringify(shortcuts));
}
export function resetShortcuts(store: KeyValueStore): void {
  try {
    store.removeItem(SHORTCUT_STORAGE);
  } catch {
    // optional
  }
}
/** `Ctrl` (or Cmd) + `Alt` + `Shift` (only with named keys) + the key, single characters upper-cased except `?`. */
export function shortcutEventName(event: KeyboardEvent): string {
  if (event.key === 'Control' || event.key === 'Meta' || event.key === 'Alt' || event.key === 'Shift')
    return '';
  const modifiers: string[] = [];
  if (event.ctrlKey || event.metaKey) modifiers.push('Ctrl');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey && event.key.length > 1) modifiers.push('Shift');
  modifiers.push(event.key.length === 1 && event.key !== '?' ? event.key.toUpperCase() : event.key);
  return modifiers.join('+');
}
export function shortcutFor(shortcuts: Shortcuts, event: KeyboardEvent): ShortcutAction | null {
  const key = shortcutEventName(event);
  return ACTIONS.find((action) => shortcuts[action] === key) ?? null;
}
export const displayShortcut = (key: string): string => (key ? key.replaceAll('Ctrl', 'Ctrl/Cmd') : '');
