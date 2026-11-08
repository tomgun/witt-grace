// The node context menu (right click, Shift+F10) with the prototype's items, order and predicates (inv-canvas §2).
import { useEffect, useRef } from 'react';
import { childrenOf } from '../domain/index.ts';
import {
  addNode,
  arrangeTree,
  canEdit,
  deleteNode,
  reuseFromTreeNode,
  setSubtreeCollapsed,
  startInlineEdit,
} from './actions.ts';
import type { Frame } from './projection.ts';
import { displayShortcut } from './shortcuts.ts';
import type { Shortcuts } from './shortcuts.ts';
import { getStore, useAppState, useTranslator } from './store.ts';

interface Item {
  label: string;
  action: () => void;
  disabled?: boolean;
  danger?: boolean;
  key?: string;
}

export function ContextMenu({
  frame,
  nodeId,
  x,
  y,
  shortcuts,
  onClose,
}: {
  frame: Frame;
  nodeId: string;
  x: number;
  y: number;
  shortcuts: Shortcuts;
  onClose: (restoreFocus?: boolean) => void;
}) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const ref = useRef<HTMLDivElement>(null);
  const { project } = state;
  const node = project.nodes.find((n) => n.id === nodeId);
  useEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const left = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - 270));
    const top = Math.min(Math.max(8, y), Math.max(8, window.innerHeight - menu.offsetHeight - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!menu.contains(e.target as Node)) onClose(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [x, y, onClose]);
  if (!node) return null;
  const editable = canEdit(state);
  const items: Item[] = [];
  const add = (item: Item) => items.push(item);
  add({
    label: t('editSelected'),
    action: () => startInlineEdit(nodeId),
    disabled: !editable || !!node.sharedReasonId || !!node.reasonConceptId,
    key: 'F2',
  });
  if (node.sharedReasonId)
    add({
      label: t('sharedDetach'),
      action: () => store.dispatch({ type: 'shared.detach', nodeId }),
      disabled: !editable,
    });
  if (node.reasonConceptId)
    add({
      label: t('contextDetach'),
      action: () => store.dispatch({ type: 'concept.detach', nodeId }),
      disabled: !editable,
    });
  if (node.kind === 'claim' && node.parentId && !node.sharedReasonId)
    add({
      label: t('repeatLinkOtherTargets'),
      action: () => reuseFromTreeNode(nodeId),
      disabled: !editable && !node.reasonConceptId,
    });
  if ((project.links ?? []).some((l) => l.sourceId === nodeId || l.targetId === nodeId))
    add({ label: t('repeatLegacyConnections'), action: () => store.openModal({ kind: 'links', nodeId }) });
  const addDisabled = !editable || !!node.sharedReasonId || node.kind === 'group';
  add({
    label: t('supportAdd'),
    action: () => addNode('support', nodeId),
    disabled: addDisabled,
    key: displayShortcut(shortcuts.support),
  });
  add({
    label: t('opposeAdd'),
    action: () => addNode('oppose', nodeId),
    disabled: addDisabled,
    key: displayShortcut(shortcuts.oppose),
  });
  add({ label: t('neutralAdd'), action: () => addNode('neutral', nodeId), disabled: addDisabled });
  if (project.mode === 'decision' && node.parentId === null)
    add({
      label: t('optionAdd'),
      action: () => addNode('option', nodeId),
      disabled: !editable,
      key: displayShortcut(shortcuts.option),
    });
  if (childrenOf(project, nodeId).length)
    add({
      label: t(frame.isNodeCollapsed(node) ? 'expandSubtree' : 'collapseSubtree'),
      action: () => setSubtreeCollapsed(nodeId),
      disabled: state.view.depthLimit === null && !editable,
      key: t('shortcutSpace'),
    });
  if (node.parentId !== null) {
    add({
      label: t('moveSubtree'),
      action: () => store.openModal({ kind: 'move', nodeId }),
      disabled: !editable,
    });
    add({
      label: t('deleteSubtree'),
      action: () => void deleteNode(nodeId),
      disabled: !editable,
      danger: true,
      key: 'Delete',
    });
  }
  add({
    label: t('arrange'),
    action: arrangeTree,
    disabled: !editable,
    key: displayShortcut(shortcuts.arrange),
  });
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next =
        e.key === 'ArrowDown' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      buttons[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      buttons[buttons.length - 1]?.focus();
    }
  };
  return (
    <div
      id="nodeContextMenu"
      className="node-context-menu"
      role="menu"
      aria-label={t('contextMenu')}
      ref={ref}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`node-menu-action${item.danger ? ' danger' : ''}`}
          disabled={item.disabled}
          aria-label={item.key ? `${item.label} (${item.key})` : undefined}
          onClick={() => {
            onClose(false);
            item.action();
          }}
        >
          <span className="node-menu-label">{item.label}</span>
          {item.key ? <kbd className="node-menu-shortcut">{item.key}</kbd> : null}
        </button>
      ))}
    </div>
  );
}
