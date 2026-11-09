// Owner decision 2026-11-09 (UI_INVENTORY S-15): a deleted card fades out where it stood, so a slip of the Delete
// key is seen. The document changes at once (undo works immediately); only a detached copy of the card animates.
export const FADE_MS = 1000;

export function fadeOutCards(ids: string[]): void {
  const layer = document.getElementById('nodeGhosts');
  if (!layer || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  for (const id of ids) {
    const card = document.querySelector<HTMLElement>(`#world .node[data-id="${CSS.escape(id)}"]`);
    if (!card) continue;
    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('data-id');
    ghost.dataset.ghostOf = id;
    ghost.removeAttribute('id');
    ghost.removeAttribute('tabindex');
    ghost.removeAttribute('data-testid');
    ghost.removeAttribute('role');
    ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    ghost.querySelectorAll('button, textarea, input').forEach((el) => el.setAttribute('tabindex', '-1'));
    ghost.setAttribute('aria-hidden', 'true');
    ghost.classList.remove('selected');
    ghost.classList.add('node-ghost');
    layer.appendChild(ghost);
    window.setTimeout(() => ghost.remove(), FADE_MS);
  }
}

/** A card restored by undo while its copy still fades must not show twice. */
export function dropRestoredGhosts(): void {
  document.querySelectorAll<HTMLElement>('#nodeGhosts .node-ghost').forEach((ghost) => {
    const id = ghost.dataset.ghostOf ?? '';
    if (document.querySelector(`#nodesLayer .node[data-id="${CSS.escape(id)}"]`)) ghost.remove();
  });
}
