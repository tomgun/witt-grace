// The floating full-title tooltip shown for truncated titles in the outline and on cards (inv-canvas §3.6).
import { useLayoutEffect, useRef, useState } from 'react';
import { useAppState, useTranslator } from './store.ts';
import { relationLabel } from './derive.ts';
import type { Frame } from './projection.ts';

export function ClaimPreview({ frame }: { frame: Frame }) {
  const state = useAppState();
  const t = useTranslator();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 12, top: 12 });
  const preview = state.claimPreview;
  const node = preview ? state.project.nodes.find((n) => n.id === preview.nodeId) : undefined;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !preview) return;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    setPos({
      left: Math.max(12, Math.min(window.innerWidth - width - 12, preview.right + 12)),
      top: Math.max(12, Math.min(window.innerHeight - height - 12, preview.top)),
    });
  }, [preview]);
  if (!preview || !node || state.inlineEditId || state.modal || state.dialog) return null;
  const parent = node.parentId ? state.project.nodes.find((n) => n.id === node.parentId) : undefined;
  return (
    <div id="claimPreview" className="claim-preview" role="tooltip" ref={ref} style={pos}>
      <div id="claimPreviewText" className="claim-preview-text">
        {node.title}
      </div>
      <div id="claimPreviewContext" className="claim-preview-context">
        {parent ? `${t('parentNode')}: ${parent.title}` : relationLabel(frame, t, node)}
      </div>
    </div>
  );
}

/** Attach to an element whose text may be clipped: the preview opens only when the matching child actually is. */
export function previewHandlers(
  nodeId: string,
  textSelector: string,
  setPreview: (p: { nodeId: string; left: number; top: number; right: number } | null) => void
) {
  const reveal = (target: HTMLElement) => {
    const text = target.querySelector<HTMLElement>(textSelector);
    if (!text) return;
    const clipped = text.scrollHeight > text.clientHeight + 2 || text.scrollWidth > text.clientWidth + 2;
    if (!clipped) return;
    const rect = target.getBoundingClientRect();
    setPreview({ nodeId, left: rect.left, top: rect.top, right: rect.right });
  };
  return {
    onPointerEnter: (e: { currentTarget: HTMLElement }) => reveal(e.currentTarget),
    onFocus: (e: { currentTarget: HTMLElement }) => reveal(e.currentTarget),
    onPointerLeave: () => setPreview(null),
    onBlur: () => setPreview(null),
  };
}
