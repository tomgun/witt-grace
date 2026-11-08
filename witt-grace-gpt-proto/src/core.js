/* WITT / GRACE Method solo reference implementation v0.1: no DOM, network, or third-party dependencies.
 * The exported score is an argument index, NOT a calibrated probability.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.WittCore = api; root.PerusteCore = api; } // legacy alias for old embeds
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 8;
  const SEMANTIC_TYPES = ['unspecified','fact','value','assumption','constraint','prerequisite'];
  const GATE_STATUSES = ['unknown','met','unmet'];
  const isGate = n => n?.semanticType === 'constraint' || n?.semanticType === 'prerequisite';
  const isValue = n => n?.semanticType === 'value';
  const truthAssessable = n => !!n && n.kind === 'claim' && !isGate(n) && !isValue(n);
  // An option is a possible action, not a truth proposition. Its displayed
  // argument index starts at a neutral reference level, never a credence vote.
  const indexAssessable = n => !!n && (n.kind === 'option' || truthAssessable(n));
  const assessmentFields = node => ({
    credence: truthAssessable(node),
    impact: node?.kind === 'claim' && !!node.parentId && !isGate(node),
  });
  const STANCES = ['root', 'support', 'oppose', 'neutral', 'option', 'group'];
  const KINDS = ['claim', 'option', 'decision', 'group'];
  const MODES = ['argument', 'decision'];
  const THEMES = ['light', 'dark', 'paper'];
  const ROLES = ['owner', 'editor', 'viewer'];
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  // GRACE evidence-v2: a 50%-credible premise has half of its signed effect,
  // not zero effect. Multiple sufficiently strong premises can reach 0 or 100.
  // The resulting 0..100 value is a diagnostic argument balance, NOT probability.
  // Public presentation is a signed NET argument balance (-100..+100).
  // The inner evidence engine deliberately retains 0..100 to represent a
  // recursively reviewed premise's strength for its next parent. The affine
  // conversion is exact: it cannot change ranks or upward propagation.
  // A zero net result is neutral; missing ratings remain null, never zero.
  const argumentBalance = internal => Number.isFinite(internal)
    ? clamp(2 * internal - 100, -100, 100) : null;
  const evidenceFactor = score => clamp(score / 100, 0, 1);
  const evidenceScore = (base, positive, negative) => clamp(base + 5 * (positive - negative), 0, 100);
  const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const iso = () => new Date().toISOString();

  function newNode({ parentId = null, relation = 'root', kind = 'claim', title = 'Uusi argumentti', confidence = 100, impact = 3, x = 60, y = 130, createdBy = 'local' } = {}) {
    return {
      id: uid(), parentId, relation, kind, title, details: '', confidence,
      impact, collapsed: false, position: { x, y }, createdBy
    };
  }

  function createBlankProject(mode = 'argument') {
    if (!MODES.includes(mode)) throw Error('Virheellinen tila');
    const user = { id: uid(), name: 'Minä', shares: 1, role: 'owner' };
    const node = newNode({ kind: mode === 'decision' ? 'decision' : 'claim',
      title: mode === 'decision' ? 'Mikä on paras päätös?' : 'Mikä on tarkasteltava väite?', confidence: 50, createdBy: user.id });
    return { schemaVersion: VERSION, id: uid(), comments: [], links: [], title: 'Nimetön pohdinta', mode,
      theme: 'light', settings: { voteWeighting: 'equal', assessmentWeighting: 'equal', shareSnapshotDate: null, scoring: 'evidence-v3-links', showAuthors: true },
      users: [user], nodes: [node], sharedReasons: [], reasonConcepts: [], votes: [], edgeAssessments: [], ballots: [], votingRound:null, voteAudit:[], voteHistory:[], layout:{fourWayOffsets:{}}, createdAt: iso(), updatedAt: iso() };
  }

  function createDemoProject() {
    const project = createBlankProject('decision');
    // This is an intentionally authored preview; new documents default to human review mode.
    project.settings.assessmentWeighting='structural';
    project.title = 'Esimerkki: uuden tuotteen julkaisu';
    const root = project.nodes[0];
    root.title = 'Milloin uusi tuote kannattaa julkaista?';
    root.confidence = 50;
    const add = (parent, title, relation, confidence, impact, x, y) => {
      const node = newNode({ parentId: parent.id, relation, kind: relation === 'option' ? 'option' : 'claim', title, confidence, impact, x, y, createdBy: project.users[0].id });
      project.nodes.push(node);
      return node;
    };
    const a = add(root, 'Julkaistaan rajattu MVP', 'option', 50, 3, 440, 100);
    add(a, 'Saadaan asiakaspalautetta aikaisemmin', 'support', 85, 4, 800, 30);
    add(a, 'Ensivaikutelma voi olla keskeneräinen', 'oppose', 70, 3, 800, 210);
    const b = add(root, 'Rakennetaan laajempi versio ensin', 'option', 50, 3, 440, 490);
    add(b, 'Kokonaisuus on julkaistaessa valmiimpi', 'support', 75, 3, 800, 410);
    add(b, 'Oppiminen ja ensimmäiset tulot viivästyvät', 'oppose', 80, 4, 800, 590);
    return project;
  }

  function childrenOf(project, id) { return project.nodes.filter(n => n.parentId === id); }
  function rootNode(project) { return project.nodes.find(n => n.parentId === null); }
  function descendants(project, id) {
    const found = [], stack = [id], visited = new Set([id]);
    while (stack.length) {
      const next = stack.pop();
      for (const child of childrenOf(project, next)) {
        if (visited.has(child.id)) continue;
        visited.add(child.id); found.push(child.id); stack.push(child.id);
      }
    }
    return found;
  }
  function visibleNodes(project) {
    const hidden = new Set();
    for (const node of project.nodes) if (node.collapsed) for (const id of descendants(project, node.id)) hidden.add(id);
    return project.nodes.filter(node => !hidden.has(node.id));
  }
  /* View-only argument focus. A rebuttal of a rebuttal supports its ancestor.
   * Decision options are neutral branch boundaries; arguments below each option
   * are interpreted relative to that option, never as votes on the root decision.
   * Matching descendants are revealed even when an ancestor is collapsed, but
   * project.nodes[*].collapsed and all saved data remain unchanged.
   */
  function focusProjection(project, anchorId, stance = 'all') {
    if (!['all', 'support', 'oppose'].includes(stance)) throw Error('Tuntematon korostustila');
    const anchor = project.nodes.find(n => n.id === anchorId) || rootNode(project);
    const normalNodes = visibleNodes(project);
    const normalIds = new Set(normalNodes.map(n => n.id));
    const empty = () => new Set();
    if (stance === 'all') return { anchorId: anchor.id, stance,
      nodes: normalNodes, visibleIds: normalIds, matchIds: empty(), contextIds: empty(),
      peekIds: empty(), polarity: new Map(), matches: 0 };

    const byId = new Map(project.nodes.map(n => [n.id, n]));
    const children = new Map();
    for (const node of project.nodes) {
      if (!children.has(node.parentId)) children.set(node.parentId, []);
      children.get(node.parentId).push(node);
    }
    const polarity = new Map([[anchor.id, 0]]);
    const matchIds = new Set();
    const stack = [{ node: anchor, sign: 0 }];
    while (stack.length) {
      const { node, sign } = stack.pop();
      for (const child of children.get(node.id) || []) {
        // An option has no polarity towards the root decision; it starts a
        // separate line of argumentation for that particular alternative.
        const next = child.relation === 'option' ? 0
          : child.relation === 'support' ? (sign || 1)
          : child.relation === 'oppose' ? (sign ? -sign : -1) : 0;
        polarity.set(child.id, next);
        if ((stance === 'support' && next === 1) || (stance === 'oppose' && next === -1))
          matchIds.add(child.id);
        stack.push({ node: child, sign: next });
      }
    }

    const visibleIds = new Set(normalIds), contextIds = new Set([anchor.id]);
    // Always expose the anchor path, even when its parent is collapsed.
    function revealPath(id) {
      for (let node = byId.get(id); node; node = byId.get(node.parentId)) {
        visibleIds.add(node.id);
        contextIds.add(node.id);
      }
    }
    revealPath(anchor.id);
    for (const id of matchIds) revealPath(id);
    const peekIds = new Set([...visibleIds].filter(id => !normalIds.has(id)));
    return { anchorId: anchor.id, stance,
      nodes: project.nodes.filter(n => visibleIds.has(n.id)), visibleIds,
      matchIds, contextIds, peekIds, polarity, matches: matchIds.size };
  }

  /* Explicit user collapse must override view-only peeks from focus highlighting
   * and table navigation. This projection is purely visual: no persisted node
   * or saved collapse flag is changed by masking temporarily revealed paths.
   */
  function respectExplicitCollapse(project, projection, explicitlyClosedIds) {
    const hidden = new Set();
    for (const id of explicitlyClosedIds) {
      if (!project.nodes.some(n => n.id === id && n.collapsed)) continue;
      for (const childId of descendants(project, id)) hidden.add(childId);
    }
    if (!hidden.size) return projection;
    const filtered = ids => new Set([...ids].filter(id => !hidden.has(id)));
    const visibleIds = filtered(projection.visibleIds);
    const matchIds = filtered(projection.matchIds);
    return { ...projection,
      nodes: projection.nodes.filter(n => visibleIds.has(n.id)),
      visibleIds, matchIds, contextIds: filtered(projection.contextIds),
      peekIds: filtered(projection.peekIds), matches: matchIds.size };
  }

  function canReparent(project, id, toParentId) {
    const node = project.nodes.find(n => n.id === id);
    const parent = project.nodes.find(n => n.id === toParentId);
    if (!node || !parent || node.parentId === null || id === toParentId || descendants(project, id).includes(toParentId)) return false;
    if (node.sharedReasonId && (parent.kind === 'decision' || parent.kind === 'group' || !!parent.sharedReasonId || project.nodes.some(n => n.id!==id && n.parentId===toParentId && n.sharedReasonId===node.sharedReasonId))) return false;
    if (node.reasonConceptId && (parent.kind === 'decision' || parent.kind === 'group' || project.nodes.some(n=>n.id!==id && n.parentId===toParentId && n.reasonConceptId===node.reasonConceptId))) return false;
    if (node.kind === 'group' || node.kind === 'option') {
      if (project.mode !== 'decision' || project.votingRound?.status === 'open' || !['decision','group'].includes(parent.kind)) return false;
    } else if (parent.kind === 'group') return false;
    return !graphHasCycle(project, project.links || [], { id, parentId: toParentId });
  }
  function moveNode(project, id, newParentId) {
    if (!canReparent(project, id, newParentId)) throw Error('Uusi vanhempi on virheellinen (sykli tai väärä vaihtoehdon taso)');
    project.nodes.find(n => n.id === id).parentId = newParentId;
  }
  function removeSubtree(project, id) {
    const target = project.nodes.find(n => n.id === id);
    if (!target || target.parentId === null) throw Error('Juurisolmua ei voi poistaa. Luo uusi asiakirja.');
    if (project.votingRound?.status === 'open' && [target.id,...descendants(project,target.id)].some(id=>project.votingRound.optionIds.includes(id))) throw Error('Aanestysvaihtoehtoa ei voi poistaa avoimelta kierrokselta');
    const removed = new Set([id, ...descendants(project, id)]);
    project.nodes = project.nodes.filter(n => !removed.has(n.id));
    project.votes = project.votes.filter(v => !removed.has(v.nodeId));
    const removedLinks = new Set((project.links || []).filter(l => removed.has(l.sourceId) || removed.has(l.targetId)).map(l => l.id));
    project.edgeAssessments = (project.edgeAssessments || []).filter(a => a.subjectType === 'primary' ? !removed.has(a.subjectId) : !removedLinks.has(a.subjectId));
    project.ballots = project.ballots.filter(b => !removed.has(b.optionId));
    project.comments = (project.comments || []).filter(c => !removed.has(c.nodeId));
    project.links = (project.links || []).filter(l => !removed.has(l.sourceId) && !removed.has(l.targetId));
    if (project.layout?.fourWayOffsets) for (const nodeId of removed) delete project.layout.fourWayOffsets[nodeId];
  }
  /* Secondary relations connect an existing claim to another argument. The
   * primary parent still owns layout, tree focus and heuristic-v1 scoring.
   * Link direction is source (reason) -> target (claim it bears on).
   */
  function graphHasCycle(project, links = project.links || [], override = null) {
    const outgoing = new Map(project.nodes.map(n => [n.id, []]));
    for (const n of project.nodes) {
      const parent = override && n.id === override.id ? override.parentId : n.parentId;
      if (parent) outgoing.get(n.id).push(parent);
    }
    for (const link of links) outgoing.get(link.sourceId)?.push(link.targetId);
    const visiting = new Set(), visited = new Set();
    function visit(id) {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      for (const target of outgoing.get(id) || []) if (visit(target)) return true;
      visiting.delete(id); visited.add(id);
      return false;
    }
    return project.nodes.some(n => visit(n.id));
  }
  function canAddLink(project, sourceId, targetId) {
    const source = project.nodes.find(n => n.id === sourceId);
    const target = project.nodes.find(n => n.id === targetId);
    if (!source || !target || source.kind !== 'claim' || !!source.sharedReasonId || target.kind === 'group' || (target.kind === 'decision' && target.parentId !== null) ||
      sourceId === targetId || source.parentId === targetId || target.kind === 'group' ||
      (project.links || []).some(l => l.sourceId === sourceId && l.targetId === targetId) ||
      (project.links || []).length >= 2000) return false;
    return !graphHasCycle(project, [...(project.links || []), { sourceId, targetId }]);
  }
  function addLink(project, sourceId, targetId, relation = 'support', impact = 3) {
    if (!['support', 'oppose'].includes(relation) || !Number.isFinite(impact) || impact < 0 || impact > 5)
      throw Error('Virheellinen lisäyhteyden suhde tai vaikutusarvio');
    if (!canAddLink(project, sourceId, targetId)) throw Error('Lisäyhteys aiheuttaisi syklin tai on jo olemassa');
    const link = { id: uid(), sourceId, targetId, relation, impact };
    project.links = project.links || [];
    project.links.push(link);
    return link;
  }
  function updateLink(project, linkId, relation, impact) {
    const link = (project.links || []).find(l => l.id === linkId);
    if (!link || !['support', 'oppose'].includes(relation) || typeof impact !== 'number' ||
      !Number.isFinite(impact) || impact < 0 || impact > 5)
      throw Error('Virheellinen lisäyhteyden päivitys');
    link.relation = relation; link.impact = impact;
    return link;
  }
  // A signed slider is the single UI control for a cross-relation. The file
  // retains relation+magnitude for existing visual arrows and fingerprints.
  function signedLinkImpact(link) { return link.relation==='oppose' ? -link.impact : link.impact; }
  function checkSignedLinkValue(value) {
    if(!Number.isFinite(value)||value < -5||value>5||Math.round(value*2)!==value*2)
      throw Error('Lisäyhteyden vaikutuksen on oltava −5…+5 puolen pisteen askelin');
  }
  function addSignedLink(project,sourceId,targetId,value=3) {
    checkSignedLinkValue(value);
    return addLink(project,sourceId,targetId,value<0?'oppose':'support',Math.abs(value));
  }
  function updateSignedLink(project,linkId,value) {
    checkSignedLinkValue(value);
    return updateLink(project,linkId,value<0?'oppose':'support',Math.abs(value));
  }
  // Informational guard for two declared routes that may meet at a common
  // scored ancestor. It does not silently discard an explicitly entered edge.
  function secondaryOverlapWarning(project, link) {
    const byId=new Map(project.nodes.map(n=>[n.id,n]));
    function scoredAnchor(id) {
      let node=byId.get(id),seen=new Set();
      while(node&&!seen.has(node.id)) {
        seen.add(node.id);
        if(node.kind==='option')return node.id;
        if(node.parentId===null)return node.kind==='claim'?node.id:null;
        node=byId.get(node.parentId);
      }
      return null;
    }
    const sourceAnchor=scoredAnchor(link.sourceId),targetAnchor=scoredAnchor(link.targetId);
    return !!sourceAnchor && sourceAnchor===targetAnchor;
  }
  function removeLink(project, linkId) {
    const before = (project.links || []).length;
    project.links = (project.links || []).filter(l => l.id !== linkId);
    if (before === project.links.length) throw Error('Lisäyhteyttä ei löytynyt');
    project.edgeAssessments = (project.edgeAssessments || []).filter(a => a.subjectType !== 'secondary' || a.subjectId !== linkId);
  }
  function addComment(project, nodeId, body, authorName = 'Minä', authorId = null) {
    if (!project.nodes.some(n => n.id === nodeId)) throw Error('Kommentin solmua ei ole');
    if (typeof body !== 'string' || !body.trim() || body.length > 3000) throw Error('Kommentin pituus 1-3000 merkkiä');
    if (typeof authorName !== 'string' || authorName.length > 120) throw Error('Virheellinen tekijä');
    if (authorId !== null && !project.users.some(u=>u.id===authorId)) throw Error('Kommentin tekijätunniste puuttuu');
    if ((project.comments || []).length >= 10000) throw Error('Liikaa kommentteja');
    const comment = { id: uid(), nodeId, body: body.trim(), authorName, ...(authorId===null?{}:{authorId}), createdAt: iso() };
    project.comments = project.comments || [];
    project.comments.push(comment);
    return comment;
  }
  function deleteComment(project, commentId) {
    const before = (project.comments || []).length;
    project.comments = (project.comments || []).filter(c => c.id !== commentId);
    if (project.comments.length === before) throw Error('Kommenttia ei löytynyt');
  }
  function addChild(project, parentId, relation, actorId) {
    const parent = project.nodes.find(n => n.id === parentId);
    if (!parent) throw Error('Vanhempaa ei löytynyt');
    if (parent.sharedReasonId) throw Error('Lukittuun yhteisperusteeseen ei voi lisätä alisolmuja');
    if (!['support', 'oppose', 'neutral', 'option', 'group'].includes(relation)) throw Error('Virheellinen suhde');
    if (parent.kind === 'group' && !['option','group'].includes(relation)) throw Error('Vaihtoehtoryhmä voi sisältää vain ryhmiä ja konkreettisia vaihtoehtoja');
    if (['option','group'].includes(relation) && (project.mode !== 'decision' || !['decision','group'].includes(parent.kind)))
      throw Error('Vaihtoehto tai vaihtoehtoryhmä tarvitsee päätöskysymyksen tai ryhmän vanhemmaksi');
    if (['option','group'].includes(relation) && project.votingRound?.status === 'open') throw Error('Vaihtoehtojen rakennetta ei voi muuttaa äänestyksen aikana');
    if (project.nodes.length >= 1000) throw Error('Solmuraja on 1000');
    const siblingCount = childrenOf(project, parentId).length;
    const node = newNode({ parentId, relation, kind: relation === 'option' ? 'option' : relation === 'group' ? 'group' : 'claim',
      title: relation === 'option' ? 'Uusi päätösvaihtoehto' : relation === 'group' ? 'Uusi vaihtoehtoryhmä' : relation === 'support' ? 'Puoltava argumentti' : relation === 'oppose' ? 'Vastustava argumentti' : 'Neutraali peruste',
      impact:['neutral','group'].includes(relation) ? 0 : 3, confidence:['option','group'].includes(relation) ? 50 : 100,
      x: parent.position.x + 350, y: parent.position.y + siblingCount * 170,
      createdBy: actorId || project.users[0].id });
    // A newly added structural group must not cover an already placed option
    // or reason card. Do not move any existing manually positioned node.
    if(relation==='group') {
      const occupied=project.nodes.filter(other=>Math.abs(other.position.x-node.position.x)<276);
      const baseY=node.position.y;
      const free=y=>occupied.every(other=>Math.abs(other.position.y-y)>=198);
      for(let step=0;step<150;step++) {
        const after=baseY+step*198;
        if(free(after)){node.position.y=after;break;}
        const before=baseY-step*198;
        if(before>=90&&free(before)){node.position.y=before;break;}
      }
    }
    project.nodes.push(node);
    parent.collapsed = false;
    return node;
  }
  /* A shared reason is an explicitly locked project-wide premise template.
   * Each attached use is one ordinary PRIMARY leaf under exactly one target.
   * It reuses the existing two quantities; there is no additional criterion
   * bonus, no automatic inheritance from a group and no text deduplication.
   * A conditional probability that differs by target must be detached.
   */
  function sharedReason(project, id) {
    return (project.sharedReasons || []).find(reason => reason.id === id) || null;
  }
  function assertSharedInputs(title, confidence, influence) {
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 200)
      throw Error('Yhteisperusteen otsikon pituus on 1–200');
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 100)
      throw Error('Yhteisperusteen uskottavuuden on oltava 0–100 %');
    if (typeof influence !== 'number' || !Number.isFinite(influence) || influence < -5 || influence > 5 || Math.round(influence*2)!==influence*2)
      throw Error('Yhteisperusteen vaikutuksen on oltava −5…+5, 0,5 tarkkuudella');
  }
  function addSharedReason(project, title, confidence = 100, influence = 3) {
    assertSharedInputs(title, confidence, influence);
    project.sharedReasons ||= [];
    if (project.sharedReasons.length >= 200) throw Error('Yhteisperusteita voi olla enintään 200');
    const reason = {id:uid(), title:title.trim(), confidence, influence};
    project.sharedReasons.push(reason);
    return reason;
  }
  function updateSharedReason(project, id, title, confidence, influence) {
    const reason=sharedReason(project,id);
    if(!reason) throw Error('Yhteisperustetta ei löytynyt');
    assertSharedInputs(title,confidence,influence);
    reason.title=title.trim();reason.confidence=confidence;reason.influence=influence;
    for (const node of project.nodes) if(node.sharedReasonId===id){
      node.title=reason.title;
      node.confidence=reason.confidence;
      node.impact=Math.abs(reason.influence);
      node.relation=reason.influence>0?'support':reason.influence<0?'oppose':'neutral';
    }
    // No personal review can become stale because shared uses do not hold
    // independent personal ratings. Parent indices are recomputed on render.
    return reason;
  }
  function attachSharedReason(project, id, parentId, actorId) {
    const reason=sharedReason(project,id);
    const parent=project.nodes.find(n=>n.id===parentId);
    if(!reason || !parent) throw Error('Yhteisperuste tai kohdesolmu puuttuu');
    if (parent.kind==='decision' || parent.kind==='group') throw Error('Liitä yhteisperuste konkreettiseen vaihtoehtoon tai väitteeseen');
    if (parent.sharedReasonId) throw Error('Lukittu yhteisperuste on päätesolmu');
    if(project.nodes.some(n=>n.parentId===parentId && n.sharedReasonId===id))
      throw Error('Yhteisperuste on jo liitetty tähän kohteeseen');
    const relation=reason.influence>0?'support':reason.influence<0?'oppose':'neutral';
    const node=addChild(project,parentId,relation,actorId);
    node.sharedReasonId=id;
    node.title=reason.title;node.confidence=reason.confidence;
    node.impact=Math.abs(reason.influence);node.semanticType='fact';
    return node;
  }
  function detachSharedReason(project, nodeId) {
    const node=project.nodes.find(n=>n.id===nodeId);
    if(!node?.sharedReasonId) throw Error('Solmu ei ole yhteisperusteen liitos');
    delete node.sharedReasonId;
    // The detached node keeps its current text, probability, signed impact,
    // placement and comments. Independent assessments can now be entered.
    return node;
  }
  function removeSharedReason(project, id) {
    if(!sharedReason(project,id)) throw Error('Yhteisperustetta ei löytynyt');
    if(project.nodes.some(n=>n.sharedReasonId===id))
      throw Error('Irrota yhteisperuste kaikista kohteista ennen poistamista');
    project.sharedReasons=project.sharedReasons.filter(r=>r.id!==id);
  }

  /* A contextual reason concept identifies the SAME semantic reason in different
   * option/claim contexts; each explicit use remains a normal primary node.
   * Personal credence/impact belong to that use and are never propagated to
   * sibling uses. A concept has no p/w of its own, nor a score bonus. */
  function reasonConcept(project, id) { return (project.reasonConcepts || []).find(r=>r.id===id) || null; }
  function addReasonConcept(project, title, semanticType='fact') {
    if (typeof title!=='string' || !title.trim() || title.trim().length>200 || !['fact','assumption','value'].includes(semanticType))
      throw Error('Virheellinen kontekstiperusteen nimi tai semanttinen tyyppi');
    project.reasonConcepts ||= [];
    if (project.reasonConcepts.length>=200) throw Error('Kontekstiperusteiden enimmäismäärä on 200');
    const concept={id:uid(),title:title.trim(),semanticType};
    project.reasonConcepts.push(concept);return concept;
  }
  function promoteReasonConcept(project,nodeId) {
    const node=project.nodes.find(n=>n.id===nodeId);
    const parent=project.nodes.find(n=>n.id===node?.parentId);
    if(!node || node.kind!=='claim' || !parent || !['claim','option'].includes(parent.kind) || node.sharedReasonId)
      throw Error('Vain perustelusolmun voi lisätä toistuviin perusteluihin');
    if(node.reasonConceptId) return reasonConcept(project,node.reasonConceptId);
    const semanticType=['fact','assumption','value'].includes(node.semanticType) ? node.semanticType : 'fact';
    const concept=addReasonConcept(project,node.title,semanticType);
    node.reasonConceptId=concept.id;
    node.semanticType=semanticType;
    // Preserve this original relationship, node id, descendants, and every existing personal review.
    return concept;
  }
  function updateReasonConcept(project,id,title) {
    const concept=reasonConcept(project,id);
    if(!concept || typeof title!=='string' || !title.trim() || title.trim().length>200)
      throw Error('Virheellinen kontekstiperusteen muokkaus');
    concept.title=title.trim();
    for(const node of project.nodes)if(node.reasonConceptId===id)node.title=concept.title;
    // Existing impact review fingerprints become stale when the wording changes.
    return concept;
  }
  // A reusable reason's identity is shared, but each use is its own explicit
  // primary relationship, with independent per-person p and signed w. Never
  // also add a secondary edge for that same target: that would count twice.
  function canAttachReasonConcept(project,id,parentId) {
    if(!reasonConcept(project,id))return false;
    const byId=new Map(project.nodes.map(node=>[node.id,node]));
    const parent=byId.get(parentId);
    if(!parent || !['claim','option'].includes(parent.kind) || parent.sharedReasonId)return false;
    if(project.nodes.some(node=>node.parentId===parentId&&node.reasonConceptId===id))return false;
    // Repeating a proposition underneath itself is circular reasoning even
    // though technically the separate use node would not create a graph cycle.
    const visited=new Set();
    for(let cursor=parent;cursor && !visited.has(cursor.id);cursor=byId.get(cursor.parentId)) {
      if(cursor.reasonConceptId===id)return false;
      visited.add(cursor.id);
    }
    // Avoid a literal double edge when upgrading an old multi-target claim.
    const sources=new Set(project.nodes.filter(node=>node.reasonConceptId===id).map(node=>node.id));
    if((project.links||[]).some(link=>link.targetId===parentId&&sources.has(link.sourceId)))return false;
    return true;
  }
  function attachReasonConcept(project,id,parentId,actorId) {
    const concept=reasonConcept(project,id);
    const parent=project.nodes.find(n=>n.id===parentId);
    if(!concept||!parent||!['claim','option'].includes(parent.kind)||parent.sharedReasonId)
      throw Error('Kontekstiperuste tarvitsee olemassa olevan väitteen tai konkreettisen vaihtoehdon');
    if(project.nodes.some(node=>node.parentId===parentId&&node.reasonConceptId===id))
      throw Error('Kontekstiperuste on jo tässä kohteessa');
    if(!canAttachReasonConcept(project,id,parentId))
      throw Error('Perustelua ei voi liittää omaan perusteluketjuunsa tai jo olemassa olevan vaikutusreitin päälle');
    const use=addChild(project,parentId,'neutral',actorId);
    use.reasonConceptId=id;use.title=concept.title;use.semanticType=concept.semanticType;
    // No automatic personal assessments: p and w belong to this use, not the
    // previous use or the concept library entry.
    use.confidence=100;use.impact=0;
    return use;
  }
  // For the node-inspector workflow, promotion and attachment can share one
  // document mutation; callers must not create a second score-bearing edge.
  function reuseClaimAt(project,sourceId,targetId,actorId) {
    const concept=promoteReasonConcept(project,sourceId);
    return attachReasonConcept(project,concept.id,targetId,actorId);
  }
  function detachReasonConcept(project,nodeId) {
    const use=project.nodes.find(n=>n.id===nodeId);
    if(!use?.reasonConceptId)throw Error('Solmu ei ole kontekstiperusteen käyttö');
    delete use.reasonConceptId;return use;
  }
  function removeReasonConcept(project,id) {
    if(!reasonConcept(project,id))throw Error('Kontekstiperustetta ei löytynyt');
    if(project.nodes.some(n=>n.reasonConceptId===id))throw Error('Irrota kontekstiperuste liitoksista ennen poistoa');
    project.reasonConcepts=project.reasonConcepts.filter(r=>r.id!==id);
  }
  function optionGroupPath(project, id) {
    const byId=new Map(project.nodes.map(n=>[n.id,n]));
    let current=byId.get(id);if(!current)return [];
    const path=[],seen=new Set();
    while(current && !seen.has(current.id)) {
      seen.add(current.id);
      if(current.kind==='group')path.unshift(current);
      current=byId.get(current.parentId);
    }
    return path;
  }

  function upsertVote(project, nodeId, userId, confidence) {
    const node = project.nodes.find(n => n.id === nodeId);
    if (!node || !project.users.some(u => u.id === userId)) throw Error('Tuntematon käyttäjä tai solmu');
    if (node.sharedReasonId) throw Error('Yhteisperusteen arvio on lukittu kirjastoon');
    if (!truthAssessable(node)) throw Error('Tälle solmulle ei voi lisätä totuususkottavuuden arviota (arvo tai reunaehto)');
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 100) throw Error('Arvion on oltava välillä 0–100');
    const existing = project.votes.find(v => v.nodeId === nodeId && v.userId === userId);
    if (existing) { existing.confidence = confidence; existing.updatedAt = iso(); }
    else project.votes.push({ id: uid(), nodeId, userId, confidence, updatedAt: iso() });
  }
  /* A value is judged by the same signed relationship influence used for
   * ordinary reasons. It has no separate importance score or truth rating.
   * A single value node may affect several options via different links.
   */
  function optionValueProfile(project, optionId, userId) {
    const option=project.nodes.find(n=>n.id===optionId && n.relation==='option');
    if (!option) throw Error('Unknown decision option');
    requireProfile(project,userId);
    const byId=new Map(project.nodes.map(n=>[n.id,n])), items=[];
    function append(node, subjectType, subjectId, direction, indirect=false) {
      const own=personalInfluence(project,subjectType,subjectId,userId);
      const summary=influenceSummary(project,subjectType,subjectId);
      items.push({nodeId:node.id,title:node.title,source:subjectType,
        relationId:subjectId,direction,indirect,impact:own.current?own.record.influence:null,
        assessed:own.current,summary});
    }
    for (const node of project.nodes) {
      if(!isValue(node))continue;
      let cursor=node,direction=1,indirect=false;
      while(cursor && cursor.id!==optionId && cursor.parentId) {
        if(cursor.relation==='oppose')direction*=-1;
        if(cursor.relation==='neutral')direction=0;
        if(cursor.id!==node.id)indirect=true;
        cursor=byId.get(cursor.parentId);
      }
      if(cursor?.id===optionId)append(node,'primary',node.id,direction,indirect);
    }
    for(const link of project.links||[]) {
      if(link.targetId===optionId && isValue(byId.get(link.sourceId)))
        append(byId.get(link.sourceId),'secondary',link.id,link.relation==='oppose'?-1:1);
    }
    return {items,values:new Set(items.map(i=>i.nodeId)).size,
      assessed:items.filter(i=>i.assessed).length,missing:items.filter(i=>!i.assessed).length};
  }
  /* Local assessment identities are named document profiles, not authenticated people.
   * Claim credence belongs to the claim; signed influence belongs to the exact
   * relationship. A relation fingerprint makes an old answer visibly stale
   * after the claim, target or relationship changes. No individual influence
   * silently alters the shared primary tree or evidence-v2 score.
   */
  function requireProfile(project, userId) {
    if (!project.users.some(u => u.id === userId)) throw Error('Tuntematon arvioijaprofiili');
  }
  function assessmentRelation(project, subjectType, subjectId) {
    if (!['primary', 'secondary'].includes(subjectType)) throw Error('Tuntematon suhteen laji');
    const nodes = new Map(project.nodes.map(n => [n.id, n]));
    let source, target, relation, documentImpact;
    if (subjectType === 'primary') {
      source = nodes.get(subjectId);
      if (!source || source.kind!=='claim' || !source.parentId || ['option','group'].includes(source.relation)) throw Error('Väitteellä ei ole arvioitavaa suhdetta');
      target = nodes.get(source.parentId);
      relation = source.relation;
      documentImpact = source.impact;
    } else {
      const link = (project.links || []).find(l => l.id === subjectId);
      if (!link) throw Error('Lisäyhteyttä ei löydy');
      source = nodes.get(link.sourceId); target = nodes.get(link.targetId);
      relation = link.relation; documentImpact = link.impact;
    }
    if (!source || !target) throw Error('Arvioitavan suhteen solmu puuttuu');
    const fingerprint = JSON.stringify([source.id, target.id, source.title, target.title, relation]);
    return { subjectType, subjectId, source, target, relation, fingerprint,
      suggestedInfluence: relation === 'neutral' ? 0 : (relation === 'oppose' ? -1 : 1) * documentImpact };
  }
  function personalCredence(project, nodeId, userId) {
    return (project.votes || []).find(v => v.nodeId === nodeId && v.userId === userId) || null;
  }
  function personalInfluence(project, subjectType, subjectId, userId) {
    const relation = assessmentRelation(project, subjectType, subjectId);
    const record = (project.edgeAssessments || []).find(a => a.subjectType === subjectType && a.subjectId === subjectId && a.userId === userId) || null;
    return { record, current: !!record && record.fingerprint === relation.fingerprint, relation };
  }
  function upsertEdgeAssessment(project, subjectType, subjectId, userId, influence) {
    requireProfile(project, userId);
    if (subjectType==='primary' && project.nodes.some(n=>n.id===subjectId && n.sharedReasonId))
      throw Error('Yhteisperusteen vaikutus on lukittu kirjastoon');
    const relation = assessmentRelation(project, subjectType, subjectId);
    if (!Number.isFinite(influence) || influence < -5 || influence > 5 || Math.round(influence * 2) !== influence * 2)
      throw Error('Suhteen vaikutuksen on oltava −5…+5, puolen pisteen askelin');
    if (!Array.isArray(project.edgeAssessments)) project.edgeAssessments = [];
    const old = project.edgeAssessments.find(a => a.subjectType === subjectType && a.subjectId === subjectId && a.userId === userId);
    if (old) { old.influence = influence; old.fingerprint = relation.fingerprint; old.updatedAt = iso(); }
    else project.edgeAssessments.push({ id: uid(), userId, subjectType, subjectId,
      influence, fingerprint: relation.fingerprint, updatedAt: iso() });
  }
  function currentInfluenceReviews(project, subjectType, subjectId, includeAI = false) {
    const relation = assessmentRelation(project, subjectType, subjectId);
    const human = new Set(project.users.filter(u => includeAI || !isAIProfile(u)).map(u => u.id));
    return (project.edgeAssessments || []).filter(a => a.subjectType === subjectType && a.subjectId === subjectId && a.fingerprint === relation.fingerprint && human.has(a.userId));
  }
  /* A zero signed influence is an individual's neutral rating. Opposite
   * signs in different, CURRENT ratings are disagreement about direction,
   * never neutrality, even if their arithmetic mean is exactly zero. Missing
   * and stale responses are not zero ratings. This diagnostic summary is
   * read-only and must not affect the document's scoring heuristic. */
  function summarizeInfluenceReviews(rows) {
    const positive = rows.filter(a => a.influence > 0).length;
    const negative = rows.filter(a => a.influence < 0).length;
    const neutral = rows.filter(a => a.influence === 0).length;
    const count = rows.length;
    const mean = count ? rows.reduce((sum, a) => sum + a.influence, 0) / count : null;
    const status = !count ? 'unassessed' : positive && negative ? 'contradictory'
      : neutral === count ? 'neutral' : neutral ? 'mixed-neutral'
      : positive ? 'support' : 'oppose';
    return {count, mean,
      min: count ? Math.min(...rows.map(a => a.influence)) : null,
      max: count ? Math.max(...rows.map(a => a.influence)) : null,
      positive, negative, neutral, status, signConflict: Boolean(positive && negative)};
  }
  function influenceSummary(project, subjectType, subjectId, includeAI = false) {
    return summarizeInfluenceReviews(currentInfluenceReviews(project, subjectType, subjectId, includeAI));
  }
  function applyPersonalAssessment(project, nodeId, userId, credence, influence = null) {
    if (project.nodes.some(n=>n.id===nodeId && n.sharedReasonId)) throw Error('Yhteisperusteen arviot ovat lukittuja');
    const node = project.nodes.find(n => n.id === nodeId);
    if (!node) throw Error('Arvioitavaa perustetta ei löytynyt');
    requireProfile(project, userId);
    const fields = assessmentFields(node);
    if (!fields.credence && !fields.impact) throw Error('Tälle solmulle ei ole totuus- tai suhdearviota');
    if (fields.credence) {
      if (!Number.isInteger(credence) || credence < 0 || credence > 100)
        throw Error('Uskottavuusarvion on oltava välillä 0–100');
    } else if (credence !== null) {
      throw Error('Arvostukselle ei voi lisätä totuususkottavuuden arviota');
    }
    if (fields.impact) {
      assessmentRelation(project, 'primary', nodeId);
      if (!Number.isFinite(influence) || influence < -5 || influence > 5 || Math.round(influence * 2) !== influence * 2)
        throw Error('Vaikutusarvion on oltava −5…+5');
    } else if (influence !== null) {
      throw Error('Tällä perusteella ei ole arvioitavaa vanhempisuhdetta');
    }
    // Validate everything before touching either collection; values only get
    // a signed relationship assessment, never a synthetic truth-credence vote.
    if (fields.credence) upsertVote(project, nodeId, userId, credence);
    if (fields.impact) upsertEdgeAssessment(project, 'primary', nodeId, userId, influence);
  }
  function removeLocalProfile(project, userId) {
    const profile = project.users.find(u => u.id === userId);
    if (!profile || profile.role === 'owner') throw Error('Omistajaprofiilia ei voi poistaa');
    if (project.nodes.some(n => n.createdBy === userId)) throw Error('Väitteiden laatijaprofiilia ei voi poistaa; nimeä se uudelleen');
    if (project.nodes.some(n => n.lastEditedBy === userId) || (project.links||[]).some(l => l.createdBy === userId))
      throw Error('Muokkaajan tai yhteyden laatijan profiilia ei voi poistaa; nimeä se uudelleen');
    if ((project.comments||[]).some(c=>c.authorId===userId)) throw Error('Kommentin kirjoittajaprofiilia ei voi poistaa; nimeä se uudelleen');
    if (Object.hasOwn(project.votingRound?.weightByUser||{},userId) || (project.voteAudit||[]).some(a=>a.userId===userId) ||
        (project.voteHistory||[]).some(h=>Object.hasOwn(h.round.weightByUser,userId) || h.audit.some(a=>a.userId===userId)))
      throw Error('Aiemman äänestyskierroksen osallistujaa ei voi poistaa; nimeä hänet uudelleen');
    project.users = project.users.filter(u => u.id !== userId);
    project.votes = project.votes.filter(v => v.userId !== userId);
    project.edgeAssessments = (project.edgeAssessments || []).filter(a => a.userId !== userId);
    project.ballots = project.ballots.filter(v => v.userId !== userId);
  }
  function isAIProfile(user) { return user?.profileKind === 'ai'; }
  /* Three EXPLICIT collective reading modes, independent of the ballot round.
   * structural = optional authored-baseline preview (document impact + equal human credence).
   * equal/shares = signed CURRENT human impact reviews and human credence,
   * aggregated without inventing missing observations. No AI participants.
   * A weight changes the influence in an average, not a final score multiplier.
   */
  function assessmentWeighting(project) {
    return project.settings?.assessmentWeighting || 'equal';
  }
  function assessmentPower(project, userId) {
    const user=project.users.find(u=>u.id===userId);
    if(!user || isAIProfile(user))return 0;
    return assessmentWeighting(project)==='shares'?user.shares:1;
  }
  function weightedHumanMean(project, records, field) {
    let total=0,sum=0,effective=0;
    for(const record of records) {
      const power=assessmentPower(project,record.userId);
      if(power<=0)continue;
      total+=power;sum+=power*record[field];effective++;
    }
    return {mean:total>0?sum/total:null,totalPower:total,effectiveVotes:effective};
  }
  function getBaseConfidence(project, node) {
    if (node.kind === 'group'||node.kind==='decision') return {base:null,votesCount:0,effectiveVotes:0,totalPower:0};
    if (node.kind === 'option') return {base:50,votesCount:0,effectiveVotes:0,totalPower:0};
    const votes = project.votes.filter(v => v.nodeId === node.id && assessmentPower(project,v.userId)>0);
    const summary = weightedHumanMean(project,votes,'confidence');
    return {base:summary.mean===null && assessmentWeighting(project)==='structural'?node.confidence:summary.mean,
      votesCount:votes.length,effectiveVotes:summary.effectiveVotes,totalPower:summary.totalPower};
  }
  /* Local decision voting is distinct from credibility and argument impact.
   * This is a local document workflow, not authenticated or cryptographically
   * secret voting. Anonymous means names are hidden in the presentation only;
   * the exported JSON retains actor IDs for traceability.
   */
  function startVotingRound(project, {anonymous=false, hideResults=true}={}) {
    if(project.mode!=='decision' || project.votingRound?.status==='open') throw Error('Voting already open or not a decision');
    if(project.votingRound?.status==='closed') {
      if((project.voteHistory||[]).length>=20)throw Error('Vote history is full: export the document and create a fresh copy');
      if(!Array.isArray(project.voteHistory))project.voteHistory=[];
      const previous=project.votingRound;
      const titleByOption=Object.fromEntries(previous.optionIds.map(id=>[id,project.nodes.find(n=>n.id===id)?.title||id]));
      project.voteHistory.push({round:JSON.parse(JSON.stringify(previous)),
        ballots:JSON.parse(JSON.stringify(project.ballots)),audit:JSON.parse(JSON.stringify(project.voteAudit)),titleByOption});
      project.ballots=[];project.voteAudit=[];
    }
    const optionIds=project.nodes.filter(n=>n.relation==='option').map(n=>n.id);
    if(optionIds.length<2)throw Error('Voting requires at least two options');
    // Imported legacy ballots are included only after explicit UI confirmation.
    const weighting=project.settings.voteWeighting;
    const weightByUser=Object.fromEntries(project.users.filter(u=>!isAIProfile(u)).map(u=>[u.id,weighting==='shares'?u.shares:1]));
    project.votingRound={id:uid(),status:'open',anonymous:!!anonymous,hideResults:!!hideResults,
      weighting,weightByUser,optionIds,openedAt:iso(),closedAt:null};
    project.voteAudit=[];
    project.voteAudit.push({id:uid(),roundId:project.votingRound.id,action:'open',at:iso(),userId:project.users[0].id});
    for(const ballot of project.ballots)project.voteAudit.push({id:uid(),roundId:project.votingRound.id,action:'cast',at:iso(),userId:ballot.userId,optionId:ballot.optionId});
    return project.votingRound;
  }
  function closeVotingRound(project, userId) {
    const round=project.votingRound;
    if(!round || round.status!=='open')throw Error('No open voting round');
    if(!project.users.some(u=>u.id===userId && u.role==='owner'))throw Error('Only owner can close vote');
    round.status='closed';round.closedAt=iso();
    project.voteAudit.push({id:uid(),roundId:round.id,action:'close',at:iso(),userId});
    return round;
  }
  function upsertBallot(project, optionId, userId, preference) {
    if (!project.nodes.some(n => n.id === optionId && n.relation === 'option') || !project.users.some(u => u.id === userId)) throw Error('Tuntematon käyttäjä tai päätösvaihtoehto');
    if (isAIProfile(project.users.find(u => u.id === userId))) throw Error('AI-arvioijalle ei voi kirjata ihmisen päätösääntä');
    if (typeof preference !== 'number' || !Number.isFinite(preference) || preference < 0 || preference > 100) throw Error('Kannatuksen on oltava välillä 0–100');
    const round=project.votingRound;
    if(round?.status==='closed')throw Error('Voting closed');
    if(round && (round.status!=='open'||!round.optionIds.includes(optionId)||!Object.hasOwn(round.weightByUser,userId)))throw Error('Not eligible for round');
    const existing=project.ballots.find(b=>b.optionId===optionId && b.userId===userId);
    if(existing){existing.preference=preference;existing.updatedAt=iso();}
    else project.ballots.push({id:uid(),optionId,userId,preference,updatedAt:iso()});
    if(round)project.voteAudit.push({id:uid(),roundId:round.id,action:existing?'update':'cast',userId,optionId,at:iso()});
  }
  function removeBallot(project,optionId,userId) {
    const round=project.votingRound;
    if(round?.status==='closed')throw Error('Voting closed');
    if(round && round.status!=='open')throw Error('Voting not open');
    const before=project.ballots.length;
    project.ballots=project.ballots.filter(b=>!(b.optionId===optionId && b.userId===userId));
    if(project.ballots.length<before && round)project.voteAudit.push({id:uid(),roundId:round.id,action:'retract',userId,optionId,at:iso()});
  }
  function optionPreferenceForRound(round, ballots, optionId) {
    let weighted=0,totalPower=0,count=0;
    for(const ballot of ballots.filter(b=>b.optionId===optionId)){
      const power=round.weightByUser[ballot.userId]??0;
      if(power<=0)continue;
      weighted+=power*ballot.preference;totalPower+=power;count++;
    }
    return {preferenceScore:totalPower?weighted/totalPower:null,preferenceVoters:count,preferenceTotalPower:totalPower,weightedSum:weighted};
  }
  function optionPreference(project, optionId) {
    const round=project.votingRound;
    if(round)return optionPreferenceForRound(round,project.ballots,optionId);
    const preview={weightByUser:Object.fromEntries(project.users.filter(u=>!isAIProfile(u)).map(u=>[u.id,project.settings.voteWeighting==='shares'?u.shares:1]))};
    return optionPreferenceForRound(preview,project.ballots,optionId);
  }
  /* Transparent recursive evidence-v2. A child computed score moves upward:
   * strength(child) = clamp(score(child)/100,0,1). Positive and negative
   * assessed relation strengths add linearly, 5 points per impact unit.
   * Clamp the final score into [0,100]. No 85-point ceiling.
   * In 'structural' preview mode use authored strengths. In human modes
   * ONLY rated, current, eligible relationships enter the weighted consensus.
   * Missing reviews are NOT neutral votes; show incomplete/uncomputed states.
   */
  function evaluate(project) {
    const mode=assessmentWeighting(project);
    const human=new Map(project.users.filter(u=>!isAIProfile(u)).map(u=>[u.id,u]));
    const expectedHumanReviews=[...human.values()].filter(user=>mode!=='shares'||user.shares>0).length;
    const children=new Map(),incoming=new Map(),credence=new Map(),impacts=new Map();
    for(const node of project.nodes) {
      if(!children.has(node.parentId))children.set(node.parentId,[]);
      children.get(node.parentId).push(node);
    }
    for(const link of project.links||[]){
      if(!incoming.has(link.targetId))incoming.set(link.targetId,[]);
      incoming.get(link.targetId).push(link);
    }
    for(const v of project.votes) {
      const user=human.get(v.userId);
      if(!user || (mode==='shares' && user.shares===0))continue;
      if(!credence.has(v.nodeId))credence.set(v.nodeId,[]);
      credence.get(v.nodeId).push({value:v.confidence,weight:mode==='shares'?user.shares:1});
    }
    if(mode!=='structural')for(const a of project.edgeAssessments||[]) {
      const user=human.get(a.userId);
      if(!['primary','secondary'].includes(a.subjectType)||!user||(mode==='shares'&&user.shares===0))continue;
      const key=a.subjectType+':'+a.subjectId;
      if(!impacts.has(key))impacts.set(key,[]);
      impacts.get(key).push({value:a.influence,weight:mode==='shares'?user.shares:1,fingerprint:a.fingerprint});
    }
    const weighted=values=>{
      let count=0,totalPower=0,sum=0;
      for(const item of values||[])if(item.weight>0){count++;totalPower+=item.weight;sum+=item.value*item.weight;}
      return {value:totalPower?sum/totalPower:null,count,totalPower};
    };
    const memo=new Map(),active=new Set();
    function visit(node) {
      if(memo.has(node.id))return memo.get(node.id);
      if(active.has(node.id))throw Error('Argumenttipuussa on sykli');
      active.add(node.id);
      if(node.kind==='group'||node.kind==='decision') {
        const result={score:null,base:null,delta:null,positive:0,negative:0,contributions:[],votesCount:0,effectiveVotes:0,totalPower:0,incomplete:false};
        memo.set(node.id,result);active.delete(node.id);return result;
      }
      const info=weighted(credence.get(node.id));
      const shared=node.sharedReasonId?sharedReason(project,node.sharedReasonId):null;
      // In argument mode, the thesis is a RESULT of its reasons. It needs no
      // separate premise-credence vote before its children can be evaluated.
      // Its unassessed prior is neutral (50 internal => 0 signed), never a
      // synthetic human review. A deliberately entered root vote is respected.
      const thesis=project.mode==='argument' && node.parentId===null && node.kind==='claim';
      const baseValue=node.kind==='option'?50:shared?shared.confidence:info.value!==null?info.value:mode==='structural'?node.confidence:thesis?50:null;
      let positive=0,negative=0,incomplete=mode!=='structural' && !shared && node.kind!=='option' && (thesis ? info.count>0 && info.count<expectedHumanReviews : info.count<expectedHumanReviews);
      const contributions=[];
      for(const child of children.get(node.id)||[]) {
        if(child.relation==='option'||child.relation==='group'||isGate(child)||isValue(child))continue;
        const result=visit(child);
        let signed,missing=false;
        if(mode==='structural')signed=child.relation==='oppose'?-child.impact:child.relation==='neutral'?0:child.impact;
        else {
          const concept=child.sharedReasonId?sharedReason(project,child.sharedReasonId):null;
          if(concept)signed=concept.influence;
          else {
            const expected=JSON.stringify([child.id,node.id,child.title,node.title,child.relation]);
            const current=(impacts.get('primary:'+child.id)||[]).filter(row=>row.fingerprint===expected);
            const summary=weighted(current);
            signed=summary.value;
            if(summary.count<expectedHumanReviews)incomplete=true;
          }
          missing=signed===null||result.score===null;
          incomplete ||= missing||Boolean(result.incomplete);
        }
        if(missing) {
          contributions.push({id:child.id,title:child.title,strength:result.score,impact:null,magnitude:null,missing:true});
          continue;
        }
        const strength=evidenceFactor(result.score);
        const magnitude=Math.abs(signed)*strength;
        if(signed>0)positive+=magnitude;
        if(signed<0)negative+=magnitude;
        contributions.push({id:child.id,title:child.title,relation:child.relation,
          weight:Math.abs(signed),impact:signed,strength:result.score,magnitude,missing:false});
      }
      // Secondary links are explicit additional source->target relationships.
      // Reuse the source claim's ONE computed credibility, but assess each
      // relationship independently. A converging route may be non-independent;
      // diagnose it in the UI rather than silently omitting an entered edge.
      for(const link of incoming.get(node.id)||[]){
        const source=project.nodes.find(n=>n.id===link.sourceId);
        if(!source || isGate(source) || isValue(source))continue;
        const result=visit(source);
        let signed=mode==='structural'?signedLinkImpact(link):null;
        if(mode!=='structural'){
          const expected=JSON.stringify([source.id,node.id,source.title,node.title,link.relation]);
          const current=(impacts.get('secondary:'+link.id)||[]).filter(row=>row.fingerprint===expected);
          const summary=weighted(current);
          signed=summary.value;
          if(summary.count<expectedHumanReviews)incomplete=true;
        }
        const missing=signed===null||result.score===null;
        incomplete ||= missing||Boolean(result.incomplete);
        if(missing){contributions.push({id:link.id,sourceId:source.id,subjectType:'secondary',title:source.title,
          strength:result.score,impact:null,magnitude:null,missing:true});continue;}
        const magnitude=Math.abs(signed)*evidenceFactor(result.score);
        if(signed>0)positive+=magnitude;
        if(signed<0)negative+=magnitude;
        contributions.push({id:link.id,sourceId:source.id,subjectType:'secondary',title:source.title,
          relation:link.relation,impact:signed,weight:Math.abs(signed),strength:result.score,magnitude,missing:false,
          overlapWarning:secondaryOverlapWarning(project,link)});
      }
      const total=positive+negative;
      const delta=5*(positive-negative);
      const score=baseValue===null?null:evidenceScore(baseValue,positive,negative);
      const result={score,base:baseValue,delta:score===null?null:score-baseValue,
        positive,negative,contributions,votesCount:info.count,effectiveVotes:info.count,
        totalPower:info.totalPower,incomplete};
      memo.set(node.id,result);active.delete(node.id);return result;
    }
    for(const node of project.nodes)visit(node);
    return memo;
  }
  /* Explanatory per-person index: no fallback to another person's scores or
   * structural relation direction. Missing personal reviews remain explicit.
   * Secondary cross-links are separately rated and contribute to their target; overlap diagnostics are informational.
   */
  function evaluateAssessor(project, userId) {
    if (!project.users.some(u=>u.id===userId)) throw Error('Unknown assessor');
    const memo=new Map(), visiting=new Set(), children=new Map(),incoming=new Map();
    const ownVotes=new Map(project.votes.filter(v=>v.userId===userId).map(v=>[v.nodeId,v.confidence]));
    const ownEdges=new Map((project.edgeAssessments||[]).filter(a=>a.userId===userId).map(a=>[a.subjectType+':'+a.subjectId,a]));
    for(const n of project.nodes){
      if(!children.has(n.parentId))children.set(n.parentId,[]);
      children.get(n.parentId).push(n);
    }
    for(const link of project.links||[]){
      if(!incoming.has(link.targetId))incoming.set(link.targetId,[]);
      incoming.get(link.targetId).push(link);
    }
    function visit(node) {
      if(memo.has(node.id)) return memo.get(node.id);
      if(visiting.has(node.id)) throw Error('Cyclic argument graph');
      visiting.add(node.id);
      if(node.kind==='group') {
        const result={score:null,base:null,delta:null,positive:0,negative:0,incomplete:false,contributions:[]};
        memo.set(node.id,result);visiting.delete(node.id);return result;
      }
      const shared=node.sharedReasonId?sharedReason(project,node.sharedReasonId):null;
      const thesis=project.mode==='argument' && node.parentId===null && node.kind==='claim';
      const base=node.kind === 'option' ? 50 : shared?shared.confidence : ownVotes.has(node.id)?ownVotes.get(node.id):thesis?50:null;
      let positive=0,negative=0,total=0,incomplete=base===null;
      const contributions=[];
      for(const child of children.get(node.id)||[]) {
        if(child.relation==='option'||child.relation==='group'||isGate(child)||isValue(child))continue;
        const result=visit(child);
        const inherited=child.sharedReasonId?sharedReason(project,child.sharedReasonId):null;
        const edge=ownEdges.get('primary:'+child.id);
        const fingerprint=JSON.stringify([child.id,node.id,child.title,node.title,child.relation]);
        if(result.score===null||(!inherited && (!edge||edge.fingerprint!==fingerprint))) {
          incomplete=true;
          contributions.push({id:child.id,score:result.score,impact:null,missing:true});
          continue;
        }
        const impact=inherited?inherited.influence:edge.influence;
        const credibility=evidenceFactor(result.score);
        const magnitude=Math.abs(impact)*credibility;
        if(impact>=0)positive+=magnitude;else negative+=magnitude;
        total+=magnitude;
        if(result.incomplete) incomplete=true;
        contributions.push({id:child.id,score:result.score,impact,magnitude,missing:false,shared:!!inherited});
      }
      for(const link of incoming.get(node.id)||[]){
        const source=project.nodes.find(n=>n.id===link.sourceId);
        if(!source || isGate(source) || isValue(source))continue;
        const result=visit(source);
        const edge=ownEdges.get('secondary:'+link.id);
        const fingerprint=JSON.stringify([source.id,node.id,source.title,node.title,link.relation]);
        if(result.score===null||!edge||edge.fingerprint!==fingerprint){
          incomplete=true;
          contributions.push({id:link.id,sourceId:source.id,subjectType:'secondary',score:result.score,impact:null,missing:true});
          continue;
        }
        const impact=edge.influence,magnitude=Math.abs(impact)*evidenceFactor(result.score);
        if(impact>0)positive+=magnitude;
        if(impact<0)negative+=magnitude;
        total+=magnitude;
        incomplete ||= Boolean(result.incomplete);
        contributions.push({id:link.id,sourceId:source.id,subjectType:'secondary',score:result.score,
          impact,magnitude,missing:false,overlapWarning:secondaryOverlapWarning(project,link)});
      }
      const delta=5*(positive-negative);
      const score=base===null?null:evidenceScore(base,positive,negative);
      const answer={score,base,delta:score===null?null:score-base,positive,negative,incomplete,contributions};
      memo.set(node.id,answer);visiting.delete(node.id);return answer;
    }
    for(const node of project.nodes)visit(node);
    return memo;
  }
  /* Direct, leave-one-relationship-out change in the displayed parent index.
   * For each contributing PRIMARY child, hold all other evaluated children
   * fixed and recompute that parent's index without this one relationship.
   * This is neither an additive decomposition nor a causal estimate. It is
   * a local counterfactual under the current evidence-v2 formula.
   * Missing personal scores and invalid/stale personal influence reviews are
   * deliberately NOT filled with structural or collective values. Values, gates and decision-root/option boundaries never enter these sums.
   */
  function marginalIndexEffects(project, evaluated) {
    const effects = new Map();
    for (const parent of project.nodes) {
      if (!indexAssessable(parent)) continue;
      const result = evaluated.get(parent.id);
      if (!result || !Number.isFinite(result.score) || !Number.isFinite(result.base)) continue;
      if (!Number.isFinite(result.positive) || !Number.isFinite(result.negative)) continue;
      const denominator = result.positive + result.negative;
      if (denominator < 0) continue;
      for (const child of result.contributions || []) {
        if (child.missing || !Number.isFinite(child.magnitude) || child.magnitude <= 0) continue;
        const signed = Object.hasOwn(child,'impact')
          ? child.impact : child.relation === 'oppose' ? -child.weight : child.weight;
        if (!Number.isFinite(signed) || signed === 0) continue;
        const positive = Math.max(0, result.positive - (signed > 0 ? child.magnitude : 0));
        const negative = Math.max(0, result.negative - (signed < 0 ? child.magnitude : 0));
        const withoutScore = evidenceScore(result.base,positive,negative);
        const raw = result.score - withoutScore;
        const delta = Math.abs(raw) < 1e-9 ? 0 : raw;
        effects.set(child.id, {
          childId: child.id, parentId: parent.id, delta, magnitude: Math.abs(delta),
          currentScore: result.score, withoutScore, provisional: Boolean(result.incomplete)
        });
      }
    }
    return effects;
  }
  /* Ranked impact on the MAIN CLAIM, or on the nearest decision option.
   * Keep the immediate-parent counterfactual separately available, but a deep
   * rebuttal must not be ranked against a top-level reason using only its local
   * effect. Exactly recompute changed ancestors against their unchanged sibling
   * contributions: unlike the linear derivative, this respects clamps and the
   * current capped linear evidence formula. Only scored relations propagate through each parent.
   * No document change and no automatic argument merging occurs.
   */
  function marginalTargetEffects(project, evaluated, localEffects = marginalIndexEffects(project, evaluated)) {
    const result = new Map(), byId = new Map(project.nodes.map(n => [n.id, n]));
    for (const effect of localEffects.values()) {
      let currentId = effect.parentId;
      let afterScore = effect.withoutScore;
      let provisional = effect.provisional;
      let valid = true;
      const seen = new Set();
      while (true) {
        if (seen.has(currentId)) { valid = false; break; }
        seen.add(currentId);
        const changedNode = byId.get(currentId);
        if (!changedNode) { valid = false; break; }
        // Option is an independent decision branch. Never treat an option as
        // a supporting argument for the decision question itself.
        if (changedNode.parentId === null || changedNode.relation === 'option') break;
        if (isGate(changedNode) || isValue(changedNode)) { valid = false; break; }
        const parent = byId.get(changedNode.parentId);
        if (!indexAssessable(parent)) { valid = false; break; }
        const parentResult = evaluated.get(parent.id);
        const contribution = parentResult?.contributions?.find(c => c.id === changedNode.id);
        if (!parentResult || !Number.isFinite(parentResult.base) ||
            !Number.isFinite(parentResult.positive) || !Number.isFinite(parentResult.negative) ||
            !contribution || contribution.missing || !Number.isFinite(contribution.magnitude)) {
          valid = false; break;
        }
        const signed = Object.hasOwn(contribution, 'impact') ? contribution.impact
          : contribution.relation === 'oppose' ? -contribution.weight : contribution.weight;
        if (!Number.isFinite(signed) || signed === 0) { valid = false; break; }
        const afterMagnitude = Math.abs(signed) * evidenceFactor(afterScore);
        const change = afterMagnitude - contribution.magnitude;
        const positive = Math.max(0, parentResult.positive + (signed > 0 ? change : 0));
        const negative = Math.max(0, parentResult.negative + (signed < 0 ? change : 0));
        afterScore = evidenceScore(parentResult.base,positive,negative);
        provisional ||= Boolean(parentResult.incomplete);
        currentId = parent.id;
      }
      const target = evaluated.get(currentId);
      if (!valid || !target || !Number.isFinite(target.score) || !Number.isFinite(afterScore)) continue;
      const raw = target.score - afterScore;
      const delta = Math.abs(raw) < 1e-9 ? 0 : raw;
      result.set(effect.childId, {
        ...effect, localDelta: effect.delta, localMagnitude: effect.magnitude,
        localCurrentScore: effect.currentScore, localWithoutScore: effect.withoutScore,
        targetId: currentId, targetCurrentScore: target.score,
        targetWithoutScore: afterScore, delta, magnitude: Math.abs(delta), provisional
      });
    }
    return result;
  }
  /* Solo review queue is independent of canvas geometry, collapsed branches and
   * layer visibility. An inquiry/question has no meaningful truth probability.
   * Decision options are still reviewed, but their edge is neutral.
   */
  function assessmentOrder(project) {
    const byParent = new Map();
    for (const node of project.nodes) {
      if (!byParent.has(node.parentId)) byParent.set(node.parentId, []);
      byParent.get(node.parentId).push(node);
    }
    const result = [];
    function visit(node) {
      const fields = assessmentFields(node);
      if (!node.sharedReasonId && (fields.credence || fields.impact)) result.push(node.id);
      for (const child of byParent.get(node.id) || []) visit(child);
    }
    const root = rootNode(project);
    if (root) visit(root);
    return result;
  }
  function signedInfluence(node) {
    if (node.parentId === null || ['option','group'].includes(node.relation)) return null;
    return node.relation === 'neutral' ? 0 : node.relation === 'oppose' ? -node.impact : node.impact;
  }
  // The authored relation is only an initial proposal. Individual assessors
  // may disagree with it; the displayed stance follows the chosen assessment
  // without rewriting the shared graph or another assessor's review.
  function directionFromInfluence(influence, initialRelation='neutral') {
    if (influence === null || !Number.isFinite(influence)) return initialRelation;
    return influence > 0 ? 'support' : influence < 0 ? 'oppose' : 'neutral';
  }
  /* Signed edge influence is a UI shorthand for existing relation + magnitude.
   * Zero has no score influence, but keeps the relation for display/history.
   * Edge rating shorthand is independent of the evidence-v2 evaluator.
   */
  function applyAssessment(project, nodeId, credence, influence = null) {
    const node = project.nodes.find(n => n.id === nodeId);
    if (!node) throw Error('Arvioitavaa väitettä ei löytynyt');
    if (node.sharedReasonId) throw Error('Yhteisperusteen arvio on lukittu kirjastoon');
    if (!truthAssessable(node)) throw Error('Tälle solmulle ei voi lisätä totuususkottavuuden arviota (arvo tai reunaehto)');
    if (typeof credence !== 'number' || !Number.isFinite(credence) || credence < 0 || credence > 100)
      throw Error('Uskottavuusarvion on oltava välillä 0–100');
    const isEdge = node.parentId !== null && !['option','group'].includes(node.relation);
    if (isEdge) {
      if (typeof influence !== 'number' || !Number.isFinite(influence) || influence < -5 || influence > 5)
        throw Error('Vaikutusarvion on oltava välillä −5…+5');
    } else if (influence !== null) throw Error('Päätöskysymyksellä tai vaihtoehdolla ei ole puolesta/vastaan-vaikutusta');
    node.confidence = credence;
    if (isEdge) {
      node.impact = Math.abs(influence);
      if (influence > 0) node.relation = 'support';
      if (influence < 0) node.relation = 'oppose';
      if (influence === 0) node.relation = 'neutral';
    }
    return node;
  }
  function decisionRanking(project) {
    const scores = evaluate(project);
    // Mandatory requirements outrank heuristic scores: a blocked option must
    // never appear as the recommended winner solely because of high credence.
    // Unknown feasibility is different from known feasibility; do not imply a
    // verified, fully rational utility ranking between different options.
    const priority={feasible:0,unresolved:1,blocked:2};
    return project.nodes.filter(n => n.relation === 'option').map(n => ({ node: n,
      ...scores.get(n.id), ...optionPreference(project, n.id), feasibility:optionFeasibility(project,n.id) }))
      .sort((a,b) => priority[a.feasibility.status]-priority[b.feasibility.status] || Number(a.incomplete)-Number(b.incomplete) || (b.score??-Infinity)-(a.score??-Infinity) || a.node.title.localeCompare(b.node.title));
  }
  /* Personal decision comparison never borrows the group's heuristic or another
   * assessor's credence / impact rating. An unreviewed option is deliberately
   * unranked within its feasibility class, rather than assigned a low score.
   * This remains an explanatory index, NOT a decision recommendation. */
  function decisionRankingForAssessor(project, userId, existingScores = null) {
    const scores = existingScores || evaluateAssessor(project, userId);
    const priority = {feasible:0, unresolved:1, blocked:2};
    return project.nodes.filter(n => n.relation === 'option').map(node => {
      const opinion = scores.get(node.id) || {score:null,incomplete:true};
      return {node,...opinion,feasibility:optionFeasibility(project,node.id),
        complete:opinion.score !== null && !opinion.incomplete};
    }).sort((a,b) => priority[a.feasibility.status]-priority[b.feasibility.status] ||
      Number(b.complete)-Number(a.complete) ||
      (a.complete&&b.complete ? b.score-a.score : 0) ||
      a.node.title.localeCompare(b.node.title));
  }
  function autoLayout(project) {
    // Deterministic, side-by-side tidy tree. Keeps custom placement until explicitly called.
    const root = rootNode(project);
    if (!root) return;
    let leaf = 0;
    const spanY = 182;
    function walk(node, depth) {
      const children = childrenOf(project, node.id);
      const y = children.length ? children.map(c => walk(c, depth + 1)).reduce((a, b) => a + b, 0) / children.length : leaf++ * spanY;
      node.position = { x: 64 + depth * 340, y: 90 + y };
      return y;
    }
    walk(root, 0);
  }

  const isPlain = v => v && typeof v === 'object' && !Array.isArray(v);
  const str = (v, max, label, allowEmpty = true) => {
    if (typeof v !== 'string' || v.length > max || (!allowEmpty && !v.trim())) throw Error(`${label}: virheellinen teksti`);
    return v;
  };
  const num = (v, min, max, label) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw Error(`${label}: arvon oltava välillä ${min}–${max}`);
    return v;
  };
  /* Optional semantic kinds distinguish factual claims from subjective values
   * and mandatory constraints, without introducing a third rating dimension. */
  function readSemantic(node) {
    const result = {};
    if (node.semanticType !== undefined) {
      if (!SEMANTIC_TYPES.includes(node.semanticType)) throw Error('Virheellinen semanttinen luokitus');
      result.semanticType = node.semanticType;
    }
    if (node.constraintStatus !== undefined) {
      if (!isGate(node) || !GATE_STATUSES.includes(node.constraintStatus)) throw Error('Virheellinen reunaehdon tila');
      result.constraintStatus = node.constraintStatus;
    }
    if (node.sources !== undefined) {
      if (!Array.isArray(node.sources) || node.sources.length > 25) throw Error('Virheellinen lähteiden määrä');
      result.sources=node.sources.map(source => {
        if (!isPlain(source)) throw Error('Virheellinen lähde');
        const url=str(source.url,1000,'Lähteen URL',false);
        let parsed;
        try { parsed = new URL(url); } catch (_) { throw Error('Lähde tarvitsee kelvollisen http(s)-URL:n'); }
        if (!['http:','https:'].includes(parsed.protocol) || !parsed.hostname || url.match(/[\r\n\t]/)) throw Error('Lähde tarvitsee kelvollisen http(s)-URL:n');
        return {url,note:str(source.note,500,'Lähdemerkintä')};
      });
    }
    if (node.authorVisibility !== undefined) {
      if (!['named','anonymous'].includes(node.authorVisibility)) throw Error('Virheellinen tekijän näkyvyys');
      result.authorVisibility=node.authorVisibility;
    }
    return result;
  }
  function validateLayout(layout, nodeIds) {
    if (!isPlain(layout) || !isPlain(layout.fourWayOffsets)) throw Error('Nelisuuntaisen asettelun tiedot puuttuvat');
    const offsets={};
    for (const [nodeId, xy] of Object.entries(layout.fourWayOffsets)) {
      if (!nodeIds.has(nodeId) || !isPlain(xy) || Object.keys(xy).some(k=>!['x','y'].includes(k))) throw Error('Nelisuuntaisen asettelun tuntematon solmu');
      offsets[nodeId]={x:num(xy.x,-100000,100000,'Nelisuuntaisen X'),y:num(xy.y,-100000,100000,'Nelisuuntaisen Y')};
    }
    return {fourWayOffsets:offsets};
  }
  /* Hard constraints and prerequisites never become negative voting weights.
   * Only the active option subtree gates that option. An unknown gate prevents
   * a 'feasible' verdict; an unmet gate blocks irrespective of heuristic scores. */
  function optionFeasibility(project, optionId) {
    const option=project.nodes.find(n=>n.id===optionId && n.relation==='option');
    if(!option)throw Error('Päätösvaihtoehtoa ei löytynyt');
    const gates=descendants(project,optionId).map(id=>project.nodes.find(n=>n.id===id)).filter(isGate);
    const unmet=gates.filter(n=>n.constraintStatus==='unmet');
    const unknown=gates.filter(n=>!n.constraintStatus||n.constraintStatus==='unknown');
    return {status:unmet.length?'blocked':unknown.length?'unresolved':'feasible',
      gates:gates.map(n=>({nodeId:n.id,title:n.title,status:n.constraintStatus||'unknown',kind:n.semanticType})),
      unmet:unmet.length,unknown:unknown.length};
  }
  /* Diagnostic only: duplicate text/source flags preserve human judgment.
   * No automatic deletion, score correction or claim duplication. */
  function potentialEvidenceOverlap(project, nodeId) {
    const subject=project.nodes.find(n=>n.id===nodeId);
    if(!subject)throw Error('Väitettä ei löytynyt');
    const textKey=n=>n.title.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
    const urls=n=>new Set((n.sources||[]).map(s=>{
      try {const u=new URL(s.url);u.hash='';u.pathname=u.pathname.replace(/\/+$/,'')||'/';return u.toString();}catch(_){return s.url;}
    }));
    const key=textKey(subject), sourceUrls=urls(subject);
    return project.nodes.filter(n=>n.id!==nodeId).map(n=>{
      const reasons=[];
      if(key&&textKey(n)===key) reasons.push('same-text');
      if(sourceUrls.size&&[...urls(n)].some(x=>sourceUrls.has(x)))reasons.push('shared-source');
      return {nodeId:n.id,title:n.title,reasons};
    }).filter(row=>row.reasons.length);
  }
  function validateProject(raw) {
    if (!isPlain(raw) || raw.schemaVersion !== VERSION) throw Error('Tiedoston formaattiversiota ei tueta: vain nykyinen versio '+VERSION);
    if (!MODES.includes(raw.mode) || !THEMES.includes(raw.theme)) throw Error('Virheellinen tila tai teema');
    if (!isPlain(raw.settings) || !['equal', 'shares'].includes(raw.settings.voteWeighting) || !['structural','equal','shares'].includes(raw.settings.assessmentWeighting) || raw.settings.scoring !== 'evidence-v3-links') throw Error('Virheelliset laskenta-asetukset');
    if (raw.settings.shareSnapshotDate !== null && (typeof raw.settings.shareSnapshotDate !== 'string' || raw.settings.shareSnapshotDate.length > 32)) throw Error('Virheellinen osaketilannepäivä');
    if (!Array.isArray(raw.nodes) || raw.nodes.length === 0 || raw.nodes.length > 1000) throw Error('Solmuja on oltava 1–1000');
    if (raw.reasonConcepts!==undefined && (!Array.isArray(raw.reasonConcepts)||raw.reasonConcepts.length>200))throw Error('Virheellinen kontekstiperusteluettelo');
    if (!Array.isArray(raw.users) || raw.users.length === 0 || raw.users.length > 100) throw Error('Käyttäjiä on oltava 1–100');
    if (!Array.isArray(raw.votes) || raw.votes.length > 10000) throw Error('Liikaa väitearvioita');
    if (!Array.isArray(raw.ballots) || raw.ballots.length > 10000) throw Error('Liikaa päätösääniä');
    if (!Array.isArray(raw.comments) || raw.comments.length > 10000) throw Error('Liikaa kommentteja');
    if (!Array.isArray(raw.links) || raw.links.length > 2000) throw Error('Virheellinen lisäyhteyksien määrä');
    if (!Array.isArray(raw.edgeAssessments) || raw.edgeAssessments.length > 10000) throw Error('Liikaa suhdearvioita');
    const ids = new Set();
    const users = raw.users.map(u => {
      if (!isPlain(u)) throw Error('Virheellinen käyttäjä');
      const id = str(u.id, 100, 'Käyttäjätunniste', false);
      if (ids.has(id) || !ROLES.includes(u.role)) throw Error('Päällekkäinen käyttäjä tai virheellinen rooli');
      ids.add(id);
      if (u.profileKind !== undefined && !['human','ai'].includes(u.profileKind)) throw Error('Virheellinen arvioijan tyyppi');
      return { id, name: str(u.name, 120, 'Nimi', false), shares: num(u.shares, 0, 1e12, 'Osakkeet'), role: u.role, ...(u.profileKind ? {profileKind:u.profileKind} : {}) };
    });
    if (!users.some(u => u.role === 'owner')) throw Error('Asiakirjassa on oltava omistaja');
    const userIds = new Set(users.map(u => u.id));
    const sharedIds = new Set();
    const sharedReasons = (raw.sharedReasons || []).map(reason => {
      if(!isPlain(reason)) throw Error('Virheellinen yhteisperuste');
      const id=str(reason.id,100,'Yhteisperusteen ID',false);
      if(sharedIds.has(id)) throw Error('Päällekkäinen yhteisperuste');
      sharedIds.add(id);
      const title=str(reason.title,200,'Yhteisperusteen otsikko',false);
      const confidence=num(reason.confidence,0,100,'Yhteisperusteen uskottavuus');
      const influence=num(reason.influence,-5,5,'Yhteisperusteen vaikutus');
      if(Math.round(influence*2)!==influence*2)throw Error('Yhteisperusteen tarkkuus on 0,5');
      return {id,title,confidence,influence};
    });
    if(sharedReasons.length>200)throw Error('Liikaa yhteisperusteita');
    const sharedById=new Map(sharedReasons.map(r=>[r.id,r]));
    const conceptIds=new Set();
    const reasonConcepts=(raw.reasonConcepts||[]).map(reason=>{
      if(!isPlain(reason))throw Error('Virheellinen kontekstiperuste');
      const id=str(reason.id,100,'Kontekstiperusteen ID',false);
      if(conceptIds.has(id))throw Error('Kontekstiperusteen tunniste on päällekkäinen');
      conceptIds.add(id);
      if(!['fact','assumption','value'].includes(reason.semanticType))throw Error('Virheellinen kontekstiperusteen luokitus');
      return {id,title:str(reason.title,200,'Kontekstiperusteen otsikko',false),semanticType:reason.semanticType};
    });
    const conceptsById=new Map(reasonConcepts.map(r=>[r.id,r]));
    const nodeIds = new Set();
    const nodes = raw.nodes.map(n => {
      if (!isPlain(n) || !isPlain(n.position) || !STANCES.includes(n.relation) || !KINDS.includes(n.kind)) throw Error('Virheellinen solmu');
      const id = str(n.id, 100, 'Solmutunniste', false);
      if (nodeIds.has(id)) throw Error('Päällekkäinen solmutunniste');
      nodeIds.add(id);
      if (n.parentId !== null) str(n.parentId, 100, 'Vanhemman tunniste', false);
      if (typeof n.collapsed !== 'boolean') throw Error('Virheellinen näkyvyys');
      return { id, parentId: n.parentId, relation: n.relation, kind: n.kind,
        title: str(n.title, 200, 'Solmun otsikko', false), details: str(n.details, 5000, 'Kuvaus'),
        confidence: num(n.confidence, 0, 100, 'Uskottavuus'), impact: num(n.impact, 0, 5, 'Paino'),
        collapsed: n.collapsed, position: { x: num(n.position.x, -1e6, 1e6, 'X'), y: num(n.position.y, -1e6, 1e6, 'Y') },
        createdBy: str(n.createdBy, 100, 'Tekijä', false),
        ...(n.lastEditedBy ? {lastEditedBy:str(n.lastEditedBy,100,'Viimeinen muokkaaja',false)} : {}),
        ...readSemantic(n), ...(n.sharedReasonId ? {sharedReasonId:str(n.sharedReasonId,100,'Yhteisperusteen viite',false)} : {}),
        ...(n.reasonConceptId ? {reasonConceptId:str(n.reasonConceptId,100,'Kontekstiperusteen viite',false)} : {}) };
    });
    const roots = nodes.filter(n => n.parentId === null);
    if (roots.length !== 1 || roots[0].relation !== 'root') throw Error('Asiakirjassa on oltava täsmälleen yksi juuri');
    if (roots[0].kind !== (raw.mode === 'decision' ? 'decision' : 'claim')) throw Error('Juuren tyyppi ei vastaa asiakirjan tilaa');
    const nodesById = new Map(nodes.map(n => [n.id, n]));
    const sharedUses=new Set();
    for(const node of nodes)if(node.sharedReasonId){
      const reason=sharedById.get(node.sharedReasonId);
      if(!reason || node.kind!=='claim' || !node.parentId || node.semanticType!=='fact')
        throw Error('Virheellinen yhteisperusteen liitos');
      if(node.title!==reason.title || node.confidence!==reason.confidence || node.impact!==Math.abs(reason.influence) ||
         node.relation!==(reason.influence>0?'support':reason.influence<0?'oppose':'neutral'))
        throw Error('Yhteisperusteen lukitut arvot eivät vastaa kirjastoa');
      const key=JSON.stringify([node.sharedReasonId,node.parentId]);
      if(sharedUses.has(key))throw Error('Yhteisperuste on liitetty samaan kohteeseen kahdesti');
      sharedUses.add(key);
      if(nodes.some(n=>n.parentId===node.id))throw Error('Lukitulla yhteisperusteella ei voi olla alisolmuja');
    }
    const contextualUses=new Set();
    for(const node of nodes)if(node.reasonConceptId){
      const concept=conceptsById.get(node.reasonConceptId);
      if(!concept || node.sharedReasonId || node.kind!=='claim' || !node.parentId ||
         node.title!==concept.title || node.semanticType!==concept.semanticType)
        throw Error('Virheellinen kontekstisidonnainen perustekäyttö');
      const key=JSON.stringify([node.reasonConceptId,node.parentId]);
      if(contextualUses.has(key))throw Error('Kontekstiperuste on liitetty samaan kohteeseen kahdesti');
      contextualUses.add(key);
    }
    for (const n of nodes) {
      if (!userIds.has(n.createdBy)) throw Error('Solmun tekijä puuttuu');
      if (n.lastEditedBy && !userIds.has(n.lastEditedBy)) throw Error('Solmun viimeinen muokkaaja puuttuu');
      if (n.parentId === null) continue;
      if (!nodesById.has(n.parentId) || n.relation === 'root') throw Error('Solmun suhde tai vanhempi puuttuu');
      const parent=nodesById.get(n.parentId);
      if(n.kind==='group') {
        if(raw.mode!=='decision'||n.relation!=='group'||!['group','decision'].includes(parent.kind)||
           n.impact!==0||n.confidence!==50||n.semanticType!==undefined||n.constraintStatus!==undefined||n.sharedReasonId||n.reasonConceptId)
          throw Error('Vaihtoehtoryhmän rakenne tai neutraaliarvot ovat virheelliset');
      } else if(n.kind==='option') {
        if(raw.mode!=='decision'||n.relation!=='option'||!['decision','group'].includes(parent.kind)||n.sharedReasonId||n.reasonConceptId)
          throw Error('Päätösvaihtoehto on virheellisellä tasolla');
      } else if(n.kind!=='claim'||!['support','oppose','neutral'].includes(n.relation)||parent.kind==='group')
        throw Error('Tavallisen argumentin tyyppi tai vanhempi on virheellinen');
    }
    const explored = new Set();
    function check(id, visiting) {
      if (visiting.has(id)) throw Error('Solmuissa on sykli');
      if (explored.has(id)) return;
      visiting.add(id);
      const n = nodesById.get(id);
      if (n.parentId) check(n.parentId, visiting);
      visiting.delete(id); explored.add(id);
    }
    for (const n of nodes) check(n.id, new Set());
    const seenVotes = new Set();
    const votes = raw.votes.map(v => {
      if (!isPlain(v)) throw Error('Virheellinen arvio');
      const id = str(v.id, 100, 'Arviotunniste', false);
      const nodeId = str(v.nodeId, 100, 'Arvion solmu', false);
      const userId = str(v.userId, 100, 'Arvion käyttäjä', false);
      if (!nodeIds.has(nodeId) || nodesById.get(nodeId)?.sharedReasonId || !userIds.has(userId) || seenVotes.has(JSON.stringify([nodeId, userId]))) throw Error('Arvion kohde puuttuu tai arvio on päällekkäinen');
      if (!truthAssessable(nodesById.get(nodeId)) && nodesById.get(nodeId)?.kind !== 'option' && !(nodeId === roots[0].id && roots[0].kind === 'decision'))
        throw Error('Arvokäsitteelle tai reunaehdolle ei voi lisätä totuusarviota');
      // Switching to a decision is a UI-mode change, not permission to destroy
      // previously entered root claim ratings. They remain dormant until the
      // document is switched back to argument mode. New decision-root ratings
      // are still blocked by upsertVote().
      seenVotes.add(JSON.stringify([nodeId, userId]));
      return { id, nodeId, userId, confidence: num(v.confidence, 0, 100, 'Arvio'), updatedAt: str(v.updatedAt, 50, 'Aikaleima') };
    });
    const seenBallots = new Set();
    const ballots = raw.ballots.map(b => {
      if (!isPlain(b)) throw Error('Virheellinen päätösääni');
      const id = str(b.id, 100, 'Päätösäänen tunniste', false);
      const optionId = str(b.optionId, 100, 'Vaihtoehdon tunniste', false);
      const userId = str(b.userId, 100, 'Äänestäjän tunniste', false);
      if (!nodesById.has(optionId) || nodesById.get(optionId).relation !== 'option' || !userIds.has(userId) || seenBallots.has(JSON.stringify([optionId, userId]))) throw Error('Päätösääni on päällekkäinen tai sen kohde puuttuu');
      seenBallots.add(JSON.stringify([optionId, userId]));
      return { id, optionId, userId, preference: num(b.preference, 0, 100, 'Kannatus'), updatedAt: str(b.updatedAt, 50, 'Aikaleima') };
    });
    let votingRound=null;
    if(raw.votingRound!==undefined && raw.votingRound!==null) {
      const r=raw.votingRound;
      if(!isPlain(r)||!['open','closed'].includes(r.status)||typeof r.anonymous!=='boolean'||
         typeof r.hideResults!=='boolean'||!['equal','shares'].includes(r.weighting)||
         !Array.isArray(r.optionIds)||!isPlain(r.weightByUser))throw Error('Invalid voting round');
      const optionIds=r.optionIds.map(id=>str(id,100,'Voting option',false));
      if(new Set(optionIds).size!==optionIds.length||optionIds.some(id=>nodesById.get(id)?.relation!=='option'))throw Error('Invalid round options');
      const weightByUser={};
      for(const [id,value] of Object.entries(r.weightByUser)) {
        if(!userIds.has(id)||isAIProfile(users.find(u=>u.id===id)))throw Error('Invalid vote weight user');
        weightByUser[id]=num(value,0,1e12,'Vote weight');
      }
      if(r.status==='open'&&r.closedAt!==null)throw Error('Open round cannot be closed');
      if(r.status==='closed'&&typeof r.closedAt!=='string')throw Error('Closed round needs timestamp');
      votingRound={id:str(r.id,100,'Round ID',false),status:r.status,anonymous:r.anonymous,
        hideResults:r.hideResults,weighting:r.weighting,weightByUser,optionIds,
        openedAt:str(r.openedAt,50,'Round opened',false),closedAt:r.closedAt===null?null:str(r.closedAt,50,'Round closed',false)};
      if(ballots.some(b=>!optionIds.includes(b.optionId)||!Object.hasOwn(weightByUser,b.userId)))throw Error('Ballot outside voting snapshot');
    }
    const voteAudit=(raw.voteAudit||[]).map(a=>{
      if(!isPlain(a)||!['open','cast','update','retract','close'].includes(a.action))throw Error('Invalid vote audit');
      const userId=str(a.userId,100,'Audit actor',false);
      if(!userIds.has(userId))throw Error('Audit actor missing');
      const optionId=a.optionId===undefined?null:str(a.optionId,100,'Audit option',false);
      if(optionId && !nodeIds.has(optionId))throw Error('Audit option missing');
      return {id:str(a.id,100,'Audit ID',false),roundId:str(a.roundId,100,'Audit round ID',false),
        action:a.action,userId,at:str(a.at,50,'Audit timestamp',false),...(optionId?{optionId}:{})};
    });
    if(voteAudit.length>10000 || (voteAudit.length && !votingRound) ||
       voteAudit.some(a=>a.roundId!==votingRound?.id) ||
       new Set(voteAudit.map(a=>a.id)).size!==voteAudit.length)throw Error('Invalid voting audit trail');
    const voteHistory=(raw.voteHistory||[]).map(entry=>{
      if(!isPlain(entry)||!isPlain(entry.round)||!isPlain(entry.titleByOption)||
          !Array.isArray(entry.ballots)||!Array.isArray(entry.audit))throw Error('Invalid vote history');
      const r=entry.round;
      if(r.status!=='closed'||typeof r.closedAt!=='string'||r.closedAt.length>50||
         typeof r.anonymous!=='boolean'||typeof r.hideResults!=='boolean'||
         !['equal','shares'].includes(r.weighting)||!isPlain(r.weightByUser)||
         !Array.isArray(r.optionIds)||r.optionIds.length<2||r.optionIds.length>1000)throw Error('Invalid historic voting round');
      const ids=r.optionIds.map(id=>str(id,100,'History option id',false));
      if(new Set(ids).size!==ids.length)throw Error('Duplicate historic option');
      const weightByUser={};
      for(const [id,value] of Object.entries(r.weightByUser)){
        if(!userIds.has(id)||isAIProfile(users.find(u=>u.id===id)))throw Error('Invalid historic voter');
        weightByUser[id]=num(value,0,1e12,'Historic vote weight');
      }
      const archiveBallots=entry.ballots.map(b=>{
        if(!isPlain(b)||!ids.includes(b.optionId)||!Object.hasOwn(weightByUser,b.userId))throw Error('Invalid historic ballot');
        return {id:str(b.id,100,'Historic ballot id',false),optionId:b.optionId,userId:b.userId,
          preference:num(b.preference,0,100,'Historic preference'),updatedAt:str(b.updatedAt,50,'Historic ballot date',false)};
      });
      if(new Set(archiveBallots.map(b=>JSON.stringify([b.userId,b.optionId]))).size!==archiveBallots.length)throw Error('Duplicate historic ballot');
      const historyAudit=entry.audit.map(a=>{
        if(!isPlain(a)||!['open','cast','update','retract','close'].includes(a.action)||
           !userIds.has(a.userId)||a.roundId!==r.id||
           (a.optionId!==undefined&&!ids.includes(a.optionId)))throw Error('Invalid historic audit event');
        return {id:str(a.id,100,'Historic audit id',false),roundId:r.id,action:a.action,userId:a.userId,
          at:str(a.at,50,'Historic audit date',false),...(a.optionId?{optionId:a.optionId}:{})};
      });
      const titleByOption={};
      for(const id of ids){titleByOption[id]=str(entry.titleByOption[id],200,'Historic option title',false);}
      if(Object.keys(entry.titleByOption).length!==ids.length)throw Error('Invalid historic option names');
      return {round:{id:str(r.id,100,'Historic round id',false),status:'closed',anonymous:r.anonymous,
        hideResults:r.hideResults,weighting:r.weighting,weightByUser,optionIds:ids,
        openedAt:str(r.openedAt,50,'Historic open date',false),closedAt:r.closedAt},
        ballots:archiveBallots,audit:historyAudit,titleByOption};
    });
    if(voteHistory.length>20 || new Set(voteHistory.map(h=>h.round.id)).size!==voteHistory.length ||
       voteHistory.some(h=>h.round.id===votingRound?.id || h.audit.length>10000 ||
         new Set(h.audit.map(a=>a.id)).size!==h.audit.length ||
         !h.audit.some(a=>a.action==='close') || !h.audit.some(a=>a.action==='open')))throw Error('Invalid vote history');
    const commentIds = new Set();
    const comments = raw.comments.map(c => {
      if (!isPlain(c)) throw Error('Virheellinen kommentti');
      const id = str(c.id, 100, 'Kommentin tunniste', false);
      const nodeId = str(c.nodeId, 100, 'Kommentin solmu', false);
      if (commentIds.has(id) || !nodeIds.has(nodeId) || (c.authorId!==undefined&&!userIds.has(c.authorId))) throw Error('Kommentin tunniste, tekijä tai solmu on virheellinen');
      commentIds.add(id);
      return { id, nodeId, body: str(c.body, 3000, 'Kommentti', false),
        authorName: str(c.authorName, 120, 'Kommentin tekijä'),
        ...(c.authorId!==undefined?{authorId:str(c.authorId,100,'Kommentin tekijätunniste',false)}:{}),
        createdAt: str(c.createdAt, 50, 'Kommentin päiväys', false) };
    });
    const linkIds = new Set(), endpoints = new Set();
    const links = raw.links.map(l => {
      if (!isPlain(l)) throw Error('Virheellinen lisäyhteys');
      const id = str(l.id, 100, 'Lisäyhteyden tunniste', false);
      const sourceId = str(l.sourceId, 100, 'Lisäyhteyden lähtö', false);
      const targetId = str(l.targetId, 100, 'Lisäyhteyden kohde', false);
      const pair = JSON.stringify([sourceId, targetId]);
      if (linkIds.has(id) || endpoints.has(pair) || sourceId === targetId ||
        !nodesById.has(sourceId) || !nodesById.has(targetId) || nodesById.get(targetId).kind === 'group' ||
        nodesById.get(sourceId).parentId === targetId ||
        nodesById.get(sourceId).kind !== 'claim' ||
        (nodesById.get(targetId).kind === 'decision' && nodesById.get(targetId).parentId !== null) ||
        !['support', 'oppose'].includes(l.relation))
        throw Error('Lisäyhteys on päällekkäinen tai virheellinen');
      linkIds.add(id); endpoints.add(pair);
      return { id, sourceId, targetId, relation: l.relation,
        impact: num(l.impact, 0, 5, 'Lisäyhteyden vaikutus'),
        ...(l.createdBy ? {createdBy:str(l.createdBy,100,'Yhteyden tekijä',false)} : {}) };
    });
    if (links.some(l=>l.createdBy && !userIds.has(l.createdBy))) throw Error('Lisäyhteyden tekijä puuttuu');
    if (graphHasCycle({ nodes }, links)) throw Error('Lisäyhteys muodostaa syklin');
    const linkSet = new Set(links.map(l => l.id));
    const edgeRatingPairs = new Set(), edgeRatingIds = new Set();
    const edgeAssessments = raw.edgeAssessments.map(a => {
      if (!isPlain(a)) throw Error('Virheellinen suhdearvio');
      const id = str(a.id, 100, 'Suhdearvion ID', false);
      const userId = str(a.userId, 100, 'Suhdearvion käyttäjä', false);
      const subjectType = a.subjectType;
      const subjectId = str(a.subjectId, 100, 'Arvioitava suhde', false);
      const key = JSON.stringify([userId, subjectType, subjectId]);
      const source = nodesById.get(subjectId);
      if (!userIds.has(userId) || edgeRatingIds.has(id) || edgeRatingPairs.has(key) ||
        !['primary', 'secondary'].includes(subjectType) ||
        (subjectType === 'primary' ? (!source || source.kind!=='claim' || !source.parentId || source.relation === 'option' || source.sharedReasonId) : !linkSet.has(subjectId)))
        throw Error('Suhdearvio on virheellinen tai päällekkäinen');
      const influence = num(a.influence, -5, 5, 'Suhdearvion vaikutus');
      if (Math.round(influence * 2) !== influence * 2) throw Error('Suhdearvion tarkkuus on 0,5');
      edgeRatingIds.add(id); edgeRatingPairs.add(key);
      return { id, userId, subjectType, subjectId, influence,
        fingerprint: str(a.fingerprint, 850, 'Suhdearvion yhteystunniste', false),
        updatedAt: str(a.updatedAt, 50, 'Suhdearvion aika', false) };
    });

    return { schemaVersion: VERSION, id: str(raw.id, 100, 'Asiakirjan tunniste', false),
      title: str(raw.title, 200, 'Asiakirjan nimi', false), mode: raw.mode, theme: raw.theme,
      settings: { voteWeighting: raw.settings.voteWeighting, assessmentWeighting:raw.settings.assessmentWeighting, shareSnapshotDate: raw.settings.shareSnapshotDate, scoring: 'evidence-v3-links', showAuthors: raw.settings.showAuthors !== false },
      users, nodes, ...(raw.sharedReasons === undefined ? {} : {sharedReasons}), ...(raw.reasonConcepts===undefined?{}:{reasonConcepts}), votes, edgeAssessments, ballots, votingRound, voteAudit, voteHistory, comments, links, layout:validateLayout(raw.layout,nodeIds),
      createdAt: str(raw.createdAt, 50, 'Luontiaika'), updatedAt: str(raw.updatedAt, 50, 'Muutosaika') };
  }
  return { VERSION, clamp, argumentBalance, uid, newNode, createBlankProject, createDemoProject, childrenOf, rootNode, descendants, visibleNodes, focusProjection, respectExplicitCollapse,
    assessmentOrder, signedInfluence, directionFromInfluence, applyAssessment, canReparent, moveNode, removeSubtree, addChild, addComment, deleteComment,
    optionValueProfile, assessmentFields, indexAssessable, sharedReason, addSharedReason, updateSharedReason, attachSharedReason, detachSharedReason, removeSharedReason,
    reasonConcept, addReasonConcept, promoteReasonConcept, updateReasonConcept, canAttachReasonConcept, attachReasonConcept, reuseClaimAt, detachReasonConcept, removeReasonConcept, optionGroupPath,
    isAIProfile, isGate, isValue, truthAssessable, assessmentWeighting, assessmentPower, weightedHumanMean, optionFeasibility, potentialEvidenceOverlap, graphHasCycle, canAddLink, addLink, updateLink, addSignedLink, updateSignedLink, signedLinkImpact, secondaryOverlapWarning, removeLink, upsertVote, getBaseConfidence, personalCredence, assessmentRelation, personalInfluence, upsertEdgeAssessment, currentInfluenceReviews, summarizeInfluenceReviews, influenceSummary, applyPersonalAssessment, removeLocalProfile, startVotingRound, closeVotingRound, upsertBallot, removeBallot, optionPreference, optionPreferenceForRound, evaluate, evaluateAssessor, marginalIndexEffects, marginalTargetEffects, decisionRanking, decisionRankingForAssessor, autoLayout, validateProject };
});
