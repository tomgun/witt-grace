/* WITT view layout: display projections are independent of document graph data.
 * Horizontal/vertical positions are reversible; four-way positions are derived
 * from the immutable tree structure and may have per-device visual offsets.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WittViewLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const BASE_X = 64, BASE_Y = 90;
  const HORIZONTAL_DEPTH = 340, HORIZONTAL_LEAF = 182;
  const VERTICAL_DEPTH = 242, VERTICAL_LEAF = 310;
  const ORIENTATIONS = ['horizontal', 'vertical', 'four-way'];
  function viewPosition(position, orientation = 'horizontal') {
    if (orientation !== 'vertical') return { x: position.x, y: position.y };
    return {
      x: BASE_X + (position.y - BASE_Y) * VERTICAL_LEAF / HORIZONTAL_LEAF,
      y: BASE_Y + (position.x - BASE_X) * VERTICAL_DEPTH / HORIZONTAL_DEPTH
    };
  }
  function documentPosition(position, orientation = 'horizontal') {
    if (orientation !== 'vertical') return { x: position.x, y: position.y };
    return {
      x: BASE_X + (position.y - BASE_Y) * HORIZONTAL_DEPTH / VERTICAL_DEPTH,
      y: BASE_Y + (position.x - BASE_X) * HORIZONTAL_LEAF / VERTICAL_LEAF
    };
  }
  function fourWayProjection(nodes, rootId, cardWidth = 252, cardHeight = 154) {
    const byId = new Map(nodes.map(n => [n.id, n]));
    if (!byId.has(rootId)) throw new Error('Four-way layout needs a root node');
    const children = new Map(nodes.map(n => [n.id, []]));
    for (const node of nodes) if (node.parentId !== null && children.has(node.parentId)) children.get(node.parentId).push(node);
    const leafCounts = new Map();
    function leaves(node, visiting = new Set()) {
      if (leafCounts.has(node.id)) return leafCounts.get(node.id);
      if (visiting.has(node.id)) throw new Error('Cycle detected in argument tree');
      visiting.add(node.id);
      const kids = children.get(node.id) || [];
      const count = kids.length ? kids.reduce((sum, child) => sum + leaves(child, visiting), 0) : 1;
      visiting.delete(node.id);
      leafCounts.set(node.id, count);
      return count;
    }
    leaves(byId.get(rootId));
    const directions = ['right', 'left', 'down', 'up'];
    const buckets = Object.fromEntries(directions.map(d => [d, { roots: [], weight: 0 }]));
    const first = [...(children.get(rootId) || [])];
    const indexed = first.map((node, index) => ({ node, index, weight: leaves(node) }));
    indexed.sort((a, b) => b.weight - a.weight || a.index - b.index);
    for (const entry of indexed) {
      const direction = [...directions].sort((a, b) => buckets[a].weight - buckets[b].weight || directions.indexOf(a) - directions.indexOf(b))[0];
      buckets[direction].roots.push(entry);
      buckets[direction].weight += entry.weight;
    }
    for (const direction of directions) buckets[direction].roots.sort((a, b) => a.index - b.index);
    const center = { x: 4000 + cardWidth / 2, y: 4000 + cardHeight / 2 };
    const positions = new Map([[rootId, { x: 4000, y: 4000 }]]);
    const groups = new Map([[rootId, 'root']]);
    const depthStepX = cardWidth + 132;
    const depthStepY = cardHeight + 152;
    const leafStepX = cardWidth + 82;
    const leafStepY = cardHeight + 94;
    for (const direction of directions) {
      const group = buckets[direction];
      if (!group.roots.length) continue;
      const totalSlots = group.weight;
      let slot = 0;
      const radial = direction === 'right' || direction === 'left';
      function place(node, depth) {
        const kids = children.get(node.id) || [];
        let lane;
        if (!kids.length) lane = slot++;
        else {
          const positionsOfChildren = kids.map(child => place(child, depth + 1));
          lane = (positionsOfChildren[0] + positionsOfChildren[positionsOfChildren.length - 1]) / 2;
        }
        const across = (lane - (totalSlots - 1) / 2) * (radial ? leafStepY : leafStepX);
        const x = radial
          ? center.x + (direction === 'right' ? 1 : -1) * depth * depthStepX - cardWidth / 2
          : center.x + across - cardWidth / 2;
        const y = radial
          ? center.y + across - cardHeight / 2
          : center.y + (direction === 'down' ? 1 : -1) * depth * depthStepY - cardHeight / 2;
        positions.set(node.id, { x, y });
        groups.set(node.id, direction);
        return lane;
      }
      for (const entry of group.roots) place(entry.node, 1);
    }
    // A large tree can spread across adjacent cardinal sectors. Push whole
    // sectors outward until rectangles no longer collide; preserve ancestry.
    const rectsOverlap = (a, b, padding = 12) => a.x < b.x + cardWidth + padding && a.x + cardWidth + padding > b.x && a.y < b.y + cardHeight + padding && a.y + cardHeight + padding > b.y;
    const directionsPresent = directions.filter(d => buckets[d].roots.length);
    for (let k = 1; k < directionsPresent.length; k++) {
      const dir = directionsPresent[k];
      const ids = [...groups].filter(([, d]) => d === dir).map(([id]) => id);
      const other = [...groups].filter(([, d]) => d !== dir && (d === 'root' || directionsPresent.indexOf(d) < k)).map(([id]) => id);
      for (let attempts = 0; attempts < 80; attempts++) {
        const collision = ids.some(id => other.some(otherId => rectsOverlap(positions.get(id), positions.get(otherId))));
        if (!collision) break;
        const dx = dir === 'right' ? 130 : dir === 'left' ? -130 : 0;
        const dy = dir === 'down' ? 110 : dir === 'up' ? -110 : 0;
        for (const id of ids) {
          const p = positions.get(id);
          positions.set(id, { x: p.x + dx, y: p.y + dy });
        }
      }
    }
    return { positions, groups, buckets };
  }
  function edgeGeometry(parent, child, orientation, cardWidth, cardHeight, positions, groups) {
    const from = positions?.get(parent.id) || viewPosition(parent.position, orientation);
    const to = positions?.get(child.id) || viewPosition(child.position, orientation);
    let direction = orientation;
    if (orientation === 'four-way') {
      const dx = (to.x + cardWidth / 2) - (from.x + cardWidth / 2);
      const dy = (to.y + cardHeight / 2) - (from.y + cardHeight / 2);
      // All edges within one branch follow its cardinal direction; a visual
      // offset should not reverse the semantic/edge-anchor direction.
      direction = groups?.get(child.id) || (Math.abs(dx) > Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up'));
    }
    if (direction === 'vertical' || direction === 'down') {
      const sx = from.x + cardWidth / 2, sy = from.y + cardHeight - 1;
      const ex = to.x + cardWidth / 2, ey = to.y + 1;
      const bend = Math.max(34, Math.abs(ey - sy) * .46);
      return `M ${sx} ${sy} C ${sx} ${sy + bend}, ${ex} ${ey - bend}, ${ex} ${ey}`;
    }
    if (direction === 'up') {
      const sx = from.x + cardWidth / 2, sy = from.y + 1;
      const ex = to.x + cardWidth / 2, ey = to.y + cardHeight - 1;
      const bend = Math.max(34, Math.abs(sy - ey) * .46);
      return `M ${sx} ${sy} C ${sx} ${sy - bend}, ${ex} ${ey + bend}, ${ex} ${ey}`;
    }
    if (direction === 'left') {
      const sx = from.x + 1, sy = from.y + cardHeight / 2;
      const ex = to.x + cardWidth - 1, ey = to.y + cardHeight / 2;
      const bend = Math.max(50, Math.abs(sx - ex) * .46);
      return `M ${sx} ${sy} C ${sx - bend} ${sy}, ${ex + bend} ${ey}, ${ex} ${ey}`;
    }
    const sx = from.x + cardWidth - 1, sy = from.y + cardHeight / 2;
    const ex = to.x + 1, ey = to.y + cardHeight / 2;
    const bend = Math.max(50, Math.abs(ex - sx) * .46);
    return `M ${sx} ${sy} C ${sx + bend} ${sy}, ${ex - bend} ${ey}, ${ex} ${ey}`;
  }
  // Directed, dashed cross-connection between two already laid-out claims.
  // Choose nearby cardinal ports independently of the primary tree direction.
  function secondaryLinkPath(from, to, width = 252, height = 154) {
    const dx = (to.x + width / 2) - (from.x + width / 2);
    const dy = (to.y + height / 2) - (from.y + height / 2);
    if (Math.abs(dx) >= Math.abs(dy)) {
      const direction = dx >= 0 ? 1 : -1;
      const sx = from.x + (direction > 0 ? width : 0);
      const ex = to.x + (direction > 0 ? 0 : width);
      const sy = from.y + height / 2, ey = to.y + height / 2;
      const bend = Math.max(44, Math.abs(ex - sx) * 0.35);
      // When a relation skips a claim on a nearly straight row, arch below
      // the row instead of running through the intermediate claim card.
      const detour = Math.abs(dx) > width * 1.8 && Math.abs(dy) < height * 0.6;
      const arc = detour ? height * 2.35 : 0;
      return `M ${sx} ${sy} C ${sx + direction * bend} ${sy + arc}, ${ex - direction * bend} ${ey + arc}, ${ex} ${ey}`;
    }
    const direction = dy >= 0 ? 1 : -1;
    const sx = from.x + width / 2, ex = to.x + width / 2;
    const sy = from.y + (direction > 0 ? height : 0);
    const ey = to.y + (direction > 0 ? 0 : height);
    const bend = Math.max(35, Math.abs(ey - sy) * 0.35);
    const detour = Math.abs(dy) > height * 2.2 && Math.abs(dx) < width * 0.65;
    const arc = detour ? width * 1.6 : 0;
    return `M ${sx} ${sy} C ${sx + arc} ${sy + direction * bend}, ${ex + arc} ${ey - direction * bend}, ${ex} ${ey}`;
  }
  // Derive branch directions from the *actual* visible positions instead of
  // trusting the balancing algorithm's new buckets after every insertion.
  function fourWayVisualDirections(nodes, rootId, positions) {
    const byId=new Map(nodes.map(n=>[n.id,n]));
    const result=new Map([[rootId,'root']]);
    function directionFor(id) {
      if(result.has(id))return result.get(id);
      const node=byId.get(id);
      if(!node||node.parentId===null)return 'root';
      if(node.parentId!==rootId) {
        const dir=directionFor(node.parentId);result.set(id,dir);return dir;
      }
      const from=positions.get(rootId),to=positions.get(id);
      if(!from||!to)return 'right';
      const dx=to.x-from.x,dy=to.y-from.y;
      const dir=Math.abs(dx)>=Math.abs(dy)?(dx>=0?'right':'left'):(dy>=0?'down':'up');
      result.set(id,dir);return dir;
    }
    for(const n of nodes)directionFor(n.id);
    return result;
  }
  // Do not recenter existing cards when a child is added in the radial view.
  // Find a free location near the parent; return concrete positions for the
  // original nodes unchanged. The caller stores offsets from the new baseline
  // in one undoable history entry together with the added node.
  function stableFourWayAddition(nodes,oldPositions,oldDirections,newBaseline,parentId,newId,width=252,height=154) {
    const stable=new Map([...oldPositions].map(([id,pos])=>[id,{x:pos.x,y:pos.y}]));
    const parent=stable.get(parentId);
    if(!parent)throw new Error('Stable layout requires an existing parent');
    const root=nodes.find(n=>n.parentId===null);
    if(!root)throw new Error('Stable layout requires a root');
    const cardinal=['right','left','down','up'];
    let dir=oldDirections.get(parentId);
    if(parentId===root.id || !cardinal.includes(dir)) {
      const counts=new Map(cardinal.map(x=>[x,0]));
      for(const node of nodes) if(node.parentId===root.id && node.id!==newId) {
        const d=oldDirections.get(node.id);
        if(counts.has(d))counts.set(d,counts.get(d)+1);
      }
      dir=[...cardinal].sort((a,b)=>counts.get(a)-counts.get(b)||cardinal.indexOf(a)-cardinal.indexOf(b))[0];
    }
    const spacingX=width+132, spacingY=height+138;
    const isHorizontal=dir==='right'||dir==='left';
    const initial={
      x:parent.x+(dir==='right'?spacingX:dir==='left'?-spacingX:0),
      y:parent.y+(dir==='down'?spacingY:dir==='up'?-spacingY:0)
    };
    const overlaps=p=>[...stable.values()].some(q=>p.x<q.x+width+22 && p.x+width+22>q.x && p.y<q.y+height+22 && p.y+height+22>q.y);
    const stride=isHorizontal?height+56:width+50;
    let choice=null;
    for(let offset=0;offset<250;offset++) {
      const step=offset===0?0:(offset%2?1:-1)*Math.ceil(offset/2);
      const position={x:initial.x+(isHorizontal?0:step*stride),y:initial.y+(isHorizontal?step*stride:0)};
      if(!overlaps(position)){choice=position;break;}
    }
    // Defensive fallback: still never move old cards, even on dense maps.
    stable.set(newId,choice||{x:initial.x,y:initial.y+30000});
    if(stable.size!==newBaseline.size)throw new Error('Stable layout expected one new node');
    return stable;
  }
  /* Compact only the currently displayed projection, never saved positions.
   * Folding a large option branch should free its space rather than retain
   * invisible descendants' original leaf slots. Each visible node occurs once.
   * Layout is deliberately recomputed from the visible IDs for fit, export
   * and the live canvas, so all three surfaces agree about the bounds.
   */
  function compactVisibleProjection(allNodes, visibleIds, orientation='horizontal', width=252, height=154) {
    const visible = new Set(visibleIds);
    const nodes=allNodes.filter(n=>visible.has(n.id));
    const root=nodes.find(n=>n.parentId===null);
    if(!root)throw Error('Compact layout requires a visible root');
    if(orientation==='four-way')return fourWayProjection(nodes,root.id,width,height);
    const children=new Map(nodes.map(n=>[n.id,[]]));
    for(const node of nodes)if(node.parentId!==null&&children.has(node.parentId))children.get(node.parentId).push(node);
    const positions=new Map();let slot=0;
    const sideways=orientation!=='vertical';
    const depthStep=sideways?width+88:height+96;
    const leafStep=sideways?height+42:width+46;
    const walk=(node,depth)=>{
      const kids=children.get(node.id)||[];
      let lane;
      if(kids.length){
        const lanes=kids.map(kid=>walk(kid,depth+1));
        lane=(lanes[0]+lanes[lanes.length-1])/2;
      }else lane=slot++;
      positions.set(node.id,sideways?{x:64+depth*depthStep,y:90+lane*leafStep}:{x:64+lane*leafStep,y:90+depth*depthStep});
      return lane;
    };
    walk(root,0);
    return {positions,groups:new Map()};
  }
  /* Narrative depth is a *view-only* projection. Depth 0 shows only the
   * decision/question root; each step reveals one more generation. A manual
   * branch override can open the whole subtree (false) or close it (true),
   * without mutating persisted node.collapsed or document geometry. */
  function depthProjection(allNodes, limit, overrides = new Map()) {
    const children = new Map(allNodes.map(node => [node.id, []]));
    const root = allNodes.find(node => node.parentId === null);
    if (!root) throw Error('Depth view requires a root');
    for (const node of allNodes) if (node.parentId !== null && children.has(node.parentId))
      children.get(node.parentId).push(node);
    const depths = new Map(), visibleIds = new Set(), visited = new Set();
    function traverse(node, depth, visible, forceOpen) {
      if (visited.has(node.id)) throw Error('Cycle or duplicate tree node in depth projection');
      visited.add(node.id); depths.set(node.id, depth);
      if (visible) visibleIds.add(node.id);
      const override = overrides.get(node.id);
      const expand = visible && override !== true && (override === false || forceOpen || depth < limit);
      for (const child of children.get(node.id) || [])
        traverse(child, depth + 1, expand, override === false || (forceOpen && override !== true));
    }
    traverse(root, 0, true, false);
    return {nodes:allNodes.filter(node=>visibleIds.has(node.id)),visibleIds,
      depths,maxDepth:Math.max(...depths.values()),
      collapsedIds:new Set(allNodes.filter(node=>visibleIds.has(node.id) &&
        (children.get(node.id)||[]).some(child=>!visibleIds.has(child.id))).map(node=>node.id))};
  }
  function maxTreeDepth(nodes) {
    if(!nodes.length)return 0;
    return depthProjection(nodes, Number.MAX_SAFE_INTEGER).maxDepth;
  }
  return { ORIENTATIONS, viewPosition, documentPosition, fourWayProjection, edgeGeometry, secondaryLinkPath, fourWayVisualDirections, stableFourWayAddition, compactVisibleProjection, depthProjection, maxTreeDepth };
});
