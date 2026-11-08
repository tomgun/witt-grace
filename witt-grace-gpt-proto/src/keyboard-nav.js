/* WITT tree keyboard navigation. Follows the logical tree for horizontal and
 * vertical layouts and the visible geometry for a four-way layout.
 * It never mutates the document or view state; callers apply actions.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WittKeyboard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const NAV_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', ' ', 'Spacebar'];

  function visibleOrder(nodes, rootId, visibleIds) {
    const byParent = new Map();
    for (const node of nodes) {
      if (!byParent.has(node.parentId)) byParent.set(node.parentId, []);
      byParent.get(node.parentId).push(node);
    }
    const output = [];
    const visited = new Set();
    function visit(id) {
      if (visited.has(id) || !visibleIds.has(id)) return;
      visited.add(id);
      output.push(id);
      for (const child of byParent.get(id) || []) visit(child.id);
    }
    visit(rootId);
    return output;
  }

  function spatialNeighbor(order, selectedId, key, positions) {
    if (!positions || !positions.has(selectedId)) return null;
    const from = positions.get(selectedId);
    const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
    const sign = (key === 'ArrowRight' || key === 'ArrowDown') ? 1 : -1;
    let bestId = null, bestScore = Infinity;
    for (const candidateId of order) {
      if (candidateId === selectedId || !positions.has(candidateId)) continue;
      const candidate = positions.get(candidateId);
      const forward = sign * (horizontal ? candidate.x - from.x : candidate.y - from.y);
      if (forward <= 1) continue;
      const perpendicular = Math.abs(horizontal ? candidate.y - from.y : candidate.x - from.x);
      // Favor a card in the chosen direction over a nearby but strongly
      // diagonal card. Break ties by stable visible-order traversal.
      const score = forward + 1.4 * perpendicular * perpendicular / (forward + 80);
      if (score < bestScore) { bestScore = score; bestId = candidateId; }
    }
    return bestId;
  }

  function navigate(nodes, rootId, visibleIds, selectedId, key, orientation = 'horizontal', positions) {
    if (!NAV_KEYS.includes(key)) return { action: 'none' };
    const byId = new Map(nodes.map(node => [node.id, node]));
    const order = visibleOrder(nodes, rootId, visibleIds);
    if (!order.length) return { action: 'none' };
    const id = visibleIds.has(selectedId) ? selectedId : order[0];
    const node = byId.get(id);
    if (!node) return { action: 'select', id: order[0] };
    if (key === 'Home') return { action: 'select', id: order[0] };
    if (key === 'End') return { action: 'select', id: order[order.length - 1] };
    const children = nodes.filter(n => n.parentId === id);
    if (key === ' ' || key === 'Spacebar') {
      return children.length ? { action: node.collapsed ? 'expand' : 'collapse', id } : { action: 'none' };
    }

    if (orientation === 'four-way') {
      const target = spatialNeighbor(order, id, key, positions);
      return target ? { action: 'select', id: target } : { action: 'none' };
    }
    const vertical = orientation === 'vertical';
    const intoChildren = vertical ? 'ArrowDown' : 'ArrowRight';
    const towardParent = vertical ? 'ArrowUp' : 'ArrowLeft';
    const beforeSibling = vertical ? 'ArrowLeft' : 'ArrowUp';
    const afterSibling = vertical ? 'ArrowRight' : 'ArrowDown';

    if (key === intoChildren) {
      if (children.length && node.collapsed) return { action: 'expand', id };
      const first = children.find(child => visibleIds.has(child.id));
      return first ? { action: 'select', id: first.id } : { action: 'none' };
    }
    if (key === towardParent) {
      if (children.length && !node.collapsed) return { action: 'collapse', id };
      return node.parentId && visibleIds.has(node.parentId)
        ? { action: 'select', id: node.parentId } : { action: 'none' };
    }
    if (key === beforeSibling || key === afterSibling) {
      const siblings = nodes.filter(other => other.parentId === node.parentId && visibleIds.has(other.id));
      const index = siblings.findIndex(other => other.id === id);
      const next = index + (key === afterSibling ? 1 : -1);
      return index !== -1 && next >= 0 && next < siblings.length
        ? { action: 'select', id: siblings[next].id } : { action: 'none' };
    }
    return { action: 'none' };
  }
  return { NAV_KEYS, visibleOrder, spatialNeighbor, navigate };
});
