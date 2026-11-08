/* WITT / GRACE Method: deterministic read-only table projection.
 * Every row is a claim, in primary-tree order. Secondary edges are details,
 * not duplicated rows. Collapsed children remain available for inspection.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WittTableModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const allowed = new Set(['all', 'support', 'oppose', 'option']);
  const fold = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase();

  function projectRows(project, filters = {}) {
    const stance = allowed.has(filters.stance) ? filters.stance : 'all';
    const query = fold(filters.query).trim();
    const byId = new Map(project.nodes.map(node => [node.id, node]));
    const children = new Map();
    for (const node of project.nodes) {
      const list = children.get(node.parentId) || [];
      list.push(node);
      children.set(node.parentId, list);
    }
    const roots = children.get(null) || [];
    const rows = [], visited = new Set();
    function walk(node, ancestors, polarity, anchor) {
      if (visited.has(node.id)) return;
      visited.add(node.id);
      const nextAnchor = node.relation === 'option' ? node : node.relation === 'group' ? null : anchor;
      const nextPolarity = ['option','group'].includes(node.relation) || node.parentId === null ? 0
        : (polarity || 1) * (node.relation === 'oppose' ? -1 : 1);
      const parent = byId.get(node.parentId) || null;
      const grandparent = parent ? byId.get(parent.parentId) || null : null;
      const path = [...ancestors, node];
      const relatives = ancestors.map(item => item.title).join(' › ');
      const matchesQuery = !query || fold([node.title, node.details, relatives].join(' ')).includes(query);
      const matchesStance = stance === 'all' || node.relation === stance;
      if (matchesQuery && matchesStance) {
        rows.push({ id: node.id, node, depth: ancestors.length, parent, grandparent,
          ancestors: ancestors.map(item => ({ id:item.id, title:item.title })),
          path: path.map(item => item.title), anchorId: nextAnchor?.id || null,
          anchorTitle: nextAnchor?.title || '', chainDirection: nextPolarity,
          relation: node.relation,
          isCollapsedDescendant: ancestors.some(item => item.collapsed === true) });
      }
      for (const child of children.get(node.id) || []) walk(child, path, nextPolarity, nextAnchor);
    }
    for (const root of roots) walk(root, [], 0, root.kind === 'decision' ? null : root);
    return rows;
  }

  function assessmentDetails(project, nodeId) {
    const users = new Map((project.users || []).map(user => [user.id, user]));
    const node = project.nodes.find(item => item.id === nodeId);
    if (!node) return null;
    const reviews = (project.votes || []).filter(v => v.nodeId === nodeId).map(v => ({
      id: v.id, userId: v.userId, name: users.get(v.userId)?.name || '',
      credence: v.confidence, updatedAt: v.updatedAt
    }));
    // Read-only projection: stale relationship reviews remain visible, but are
    // never silently presented as current after a claim or target is edited.
    const ratings = (project.edgeAssessments || []);
    function forRelation(type, id) {
      const subject = type === 'primary' ? project.nodes.find(n => n.id === id) : project.links.find(l => l.id === id);
      if (!subject) return [];
      const source = type === 'primary' ? subject : project.nodes.find(n => n.id === subject.sourceId);
      const target = type === 'primary' ? project.nodes.find(n => n.id === subject.parentId) : project.nodes.find(n => n.id === subject.targetId);
      const fingerprint = JSON.stringify([source.id, target.id, source.title, target.title, subject.relation]);
      return ratings.filter(a => a.subjectType === type && a.subjectId === id).map(a => ({
        ...a, name: users.get(a.userId)?.name || '', stale: a.fingerprint !== fingerprint
      }));
    }
    const impactReviews = node.kind==='claim' && node.parentId && node.relation !== 'option' ? forRelation('primary', nodeId) : [];
    const links = (project.links || []).filter(link => link.sourceId === nodeId || link.targetId === nodeId)
      .map(link => ({ ...link, direction: link.sourceId === nodeId ? 'outgoing' : 'incoming',
        otherId: link.sourceId === nodeId ? link.targetId : link.sourceId,
        otherTitle: project.nodes.find(item => item.id === (link.sourceId === nodeId ? link.targetId : link.sourceId))?.title || '',
        impactReviews: forRelation('secondary',link.id) }));
    return { node, reviews, impactReviews, links, comments: (project.comments || []).filter(c => c.nodeId === nodeId),
      credence: node.confidence };
  }
  return { projectRows, assessmentDetails };
});
