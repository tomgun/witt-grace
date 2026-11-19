// The drop-down menus of the top bar and the toolbar (`<details class="toolbar-popover">`): one open at a time, and
// a press outside or Escape closes it (UI_INVENTORY S-15, 2026-11-19; the prototype closes on an outside press).
import { useEffect } from 'react';

/** The `name` shared by every menu: the browser closes the others when one opens. */
export const MENU_GROUP = 'toolbar-menu';

const openMenus = (): HTMLDetailsElement[] => [
  ...document.querySelectorAll<HTMLDetailsElement>('details.toolbar-popover[open]'),
];

/** Installed once, by the top bar, which is there whenever a menu can be. */
export function useMenuDismissal(): void {
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      for (const menu of openMenus())
        if (!(e.target instanceof Node && menu.contains(e.target))) menu.open = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      for (const menu of openMenus()) {
        const hadFocus = menu.contains(document.activeElement);
        menu.open = false;
        if (hadFocus) menu.querySelector('summary')?.focus();
        e.stopPropagation();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);
}
