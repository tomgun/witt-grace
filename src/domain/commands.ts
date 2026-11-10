// Every change to a document is a serializable Command applied by `applyCommand(project, command, ctx)`: pure, returns a
// new Project, throws without touching the input. Ids come from the caller (so a peer can replay the same log); `now`
// stamps timestamps; `actorId` tags who edited. The rules are the prototype's, pinned by tests/unit/commands.test.ts.
import {
  isAiProfile,
  isGate,
  isInfluenceStep,
  isUnrated,
  roundInfluence,
  isValue,
  truthAssessable,
  assessmentFields,
  TYPE_LABEL_MAX,
  SCORING_VERSIONS,
} from './model.ts';
import type {
  AssessmentWeighting,
  GateStatus,
  Link,
  Mode,
  Node,
  Position,
  Project,
  ReasonConcept,
  Role,
  ScoringVersion,
  SemanticType,
  SharedReason,
  SourceRef,
  Stance,
  SubjectType,
  Theme,
  VoteWeighting,
} from './model.ts';
import { childrenOf, descendants, graphHasCycle, reasonConcept, rootNode, sharedReason } from './graph.ts';
import { parseProject } from './parse.ts';
import { newNode, autoLayoutPositions } from './project.ts';
import { assessmentRelation } from './reviews.ts';

export interface CommandContext {
  /** ISO timestamp for every `updatedAt`/`createdAt` the command writes. */
  now: string;
  /** The local profile performing the edit; tags `lastEditedBy` and `createdBy` like the prototype's mutation wrapper. */
  actorId: string;
}

export type Command =
  | { type: 'project.setTitle'; title: string }
  | { type: 'project.setMode'; mode: Mode }
  | { type: 'project.setTheme'; theme: Theme }
  | { type: 'project.setAssessmentWeighting'; weighting: AssessmentWeighting }
  | { type: 'project.setVoteWeighting'; weighting: VoteWeighting }
  | { type: 'project.setShowAuthors'; showAuthors: boolean }
  | { type: 'project.setScoring'; scoring: ScoringVersion }
  | {
      type: 'node.add';
      id: string;
      parentId: string;
      relation: Exclude<Stance, 'root'>;
      title?: string;
      /** Only `value` for now: the `,` shortcut adds a value reason in one step. */
      semanticType?: 'value';
      /** The app starts a new neutral reason as an unrated note (owner 2026-11-10). */
      unrated?: boolean;
    }
  | {
      type: 'node.edit';
      id: string;
      title?: string;
      details?: string;
      semanticType?: SemanticType;
      constraintStatus?: GateStatus;
      authorVisibility?: 'named' | 'anonymous';
      sources?: SourceRef[];
      /** The person's own type name; `null` restores the built-in one. */
      typeLabel?: string | null;
      /** Not rated: no sliders, never scores; earlier reviews are kept and count again when switched back. */
      unrated?: boolean;
      /** The influence slider moves in 0.1 steps. */
      fineInfluence?: boolean;
    }
  | { type: 'node.move'; id: string; parentId: string }
  | { type: 'node.remove'; id: string }
  | { type: 'node.collapse'; id: string; collapsed: boolean }
  | { type: 'node.position'; positions: Record<string, Position> }
  | { type: 'node.template'; id: string; credence: number; influence: number | null }
  | { type: 'layout.auto' }
  | { type: 'layout.fourWay'; offsets: Record<string, Position> }
  | { type: 'review.credence'; id: string; nodeId: string; userId: string; credence: number }
  | {
      type: 'review.influence';
      id: string;
      subjectType: SubjectType;
      subjectId: string;
      userId: string;
      influence: number;
    }
  | {
      type: 'review.personal';
      voteId: string;
      assessmentId: string;
      nodeId: string;
      userId: string;
      credence: number | null;
      influence: number | null;
    }
  /** Owner 2026-11-10: "En arvioi (muut voivat)" on a reason, or `abstain: false` to take it back. */
  | { type: 'review.abstain'; nodeId: string; userId: string; abstain: boolean }
  | { type: 'link.add'; id: string; sourceId: string; targetId: string; value: number }
  | { type: 'link.update'; id: string; value: number }
  | { type: 'link.remove'; id: string }
  | {
      type: 'comment.add';
      id: string;
      nodeId: string;
      body: string;
      authorName: string;
      authorId: string | null;
    }
  | { type: 'comment.remove'; id: string }
  | { type: 'shared.add'; id: string; title: string; confidence: number; influence: number }
  | { type: 'shared.update'; id: string; title: string; confidence: number; influence: number }
  | { type: 'shared.attach'; id: string; parentId: string; nodeId: string }
  | { type: 'shared.detach'; nodeId: string }
  | { type: 'shared.remove'; id: string }
  | { type: 'concept.add'; id: string; title: string; semanticType?: ReasonConcept['semanticType'] }
  | { type: 'concept.promote'; nodeId: string; conceptId: string }
  | { type: 'concept.update'; id: string; title: string }
  | { type: 'concept.attach'; id: string; parentId: string; nodeId: string }
  | { type: 'concept.reuse'; sourceId: string; targetId: string; conceptId: string; nodeId: string }
  | { type: 'concept.detach'; nodeId: string }
  | { type: 'concept.remove'; id: string }
  | { type: 'user.add'; id: string; name: string; shares?: number; role?: Role; profileKind?: 'human' | 'ai' }
  | { type: 'user.rename'; id: string; name: string }
  | { type: 'user.setShares'; id: string; shares: number }
  | { type: 'user.remove'; id: string }
  | { type: 'round.start'; id: string; auditIds: string[]; anonymous?: boolean; hideResults?: boolean }
  | { type: 'round.close'; userId: string; auditId: string }
  | { type: 'ballot.cast'; id: string; auditId: string; optionId: string; userId: string; preference: number }
  | { type: 'ballot.retract'; auditId: string; optionId: string; userId: string };

export type CommandType = Command['type'];

function fail(message: string): never {
  throw new Error(message);
}
const node = (p: Project, id: string): Node => p.nodes.find((n) => n.id === id) ?? fail('Solmua ei löytynyt');
const requireProfile = (p: Project, userId: string): void => {
  if (!p.users.some((u) => u.id === userId)) fail('Tuntematon arvioijaprofiili');
};
const checkInfluence = (value: number, message: string): void => {
  if (!Number.isFinite(value) || value < -5 || value > 5 || !isInfluenceStep(value)) fail(message);
};

// ---- nodes ----
function addChild(
  p: Project,
  id: string,
  parentId: string,
  relation: Exclude<Stance, 'root'>,
  actorId: string
): Node {
  const parent = p.nodes.find((n) => n.id === parentId) ?? fail('Vanhempaa ei löytynyt');
  if (parent.sharedReasonId) fail('Lukittuun yhteisperusteeseen ei voi lisätä alisolmuja');
  if (!['support', 'oppose', 'neutral', 'option', 'group'].includes(relation)) fail('Virheellinen suhde');
  if (parent.kind === 'group' && relation !== 'option' && relation !== 'group')
    fail('Vaihtoehtoryhmä voi sisältää vain ryhmiä ja konkreettisia vaihtoehtoja');
  if (
    (relation === 'option' || relation === 'group') &&
    (p.mode !== 'decision' || !['decision', 'group'].includes(parent.kind))
  )
    fail('Vaihtoehto tai vaihtoehtoryhmä tarvitsee päätöskysymyksen tai ryhmän vanhemmaksi');
  if ((relation === 'option' || relation === 'group') && p.votingRound?.status === 'open')
    fail('Vaihtoehtojen rakennetta ei voi muuttaa äänestyksen aikana');
  if (p.nodes.length >= 1000) fail('Solmuraja on 1000');
  if (p.nodes.some((n) => n.id === id)) fail('Päällekkäinen solmutunniste');
  const siblingCount = childrenOf(p, parentId).length;
  const created = newNode({
    id,
    parentId,
    relation,
    kind: relation === 'option' ? 'option' : relation === 'group' ? 'group' : 'claim',
    title:
      relation === 'option'
        ? 'Uusi päätösvaihtoehto'
        : relation === 'group'
          ? 'Uusi vaihtoehtoryhmä'
          : relation === 'support'
            ? 'Puoltava argumentti'
            : relation === 'oppose'
              ? 'Vastustava argumentti'
              : 'Neutraali peruste',
    impact: relation === 'neutral' || relation === 'group' ? 0 : 3,
    confidence: relation === 'option' || relation === 'group' ? 50 : 100,
    x: parent.position.x + 350,
    y: parent.position.y + siblingCount * 170,
    createdBy: actorId,
  });
  if (relation === 'group') {
    // A new structural group must not cover an already placed card; nothing else moves.
    const occupied = p.nodes.filter((other) => Math.abs(other.position.x - created.position.x) < 276);
    const baseY = created.position.y;
    const free = (y: number) => occupied.every((other) => Math.abs(other.position.y - y) >= 198);
    for (let step = 0; step < 150; step++) {
      const after = baseY + step * 198;
      if (free(after)) {
        created.position.y = after;
        break;
      }
      const before = baseY - step * 198;
      if (before >= 90 && free(before)) {
        created.position.y = before;
        break;
      }
    }
  }
  p.nodes.push(created);
  parent.collapsed = false;
  return created;
}
export function canReparent(p: Project, id: string, toParentId: string): boolean {
  const n = p.nodes.find((x) => x.id === id);
  const parent = p.nodes.find((x) => x.id === toParentId);
  if (!n || !parent || n.parentId === null || id === toParentId || descendants(p, id).includes(toParentId))
    return false;
  if (
    n.sharedReasonId &&
    (parent.kind === 'decision' ||
      parent.kind === 'group' ||
      !!parent.sharedReasonId ||
      p.nodes.some((x) => x.id !== id && x.parentId === toParentId && x.sharedReasonId === n.sharedReasonId))
  )
    return false;
  if (
    n.reasonConceptId &&
    (parent.kind === 'decision' ||
      parent.kind === 'group' ||
      p.nodes.some(
        (x) => x.id !== id && x.parentId === toParentId && x.reasonConceptId === n.reasonConceptId
      ))
  )
    return false;
  if (n.kind === 'group' || n.kind === 'option') {
    if (
      p.mode !== 'decision' ||
      p.votingRound?.status === 'open' ||
      !['decision', 'group'].includes(parent.kind)
    )
      return false;
  } else if (parent.kind === 'group') return false;
  return !graphHasCycle(p.nodes, p.links ?? [], { id, parentId: toParentId });
}
function removeSubtree(p: Project, id: string): void {
  const target = p.nodes.find((n) => n.id === id);
  if (!target || target.parentId === null) fail('Juurisolmua ei voi poistaa. Luo uusi asiakirja.');
  const round = p.votingRound;
  if (round?.status === 'open' && [id, ...descendants(p, id)].some((x) => round.optionIds.includes(x)))
    fail('Aanestysvaihtoehtoa ei voi poistaa avoimelta kierrokselta');
  const removed = new Set([id, ...descendants(p, id)]);
  p.nodes = p.nodes.filter((n) => !removed.has(n.id));
  p.votes = p.votes.filter((v) => !removed.has(v.nodeId));
  if (p.abstentions) {
    p.abstentions = p.abstentions.filter((a) => !removed.has(a.nodeId));
    if (!p.abstentions.length) delete p.abstentions;
  }
  const removedLinks = new Set(
    (p.links ?? []).filter((l) => removed.has(l.sourceId) || removed.has(l.targetId)).map((l) => l.id)
  );
  p.edgeAssessments = (p.edgeAssessments ?? []).filter((a) =>
    a.subjectType === 'primary' ? !removed.has(a.subjectId) : !removedLinks.has(a.subjectId)
  );
  p.ballots = p.ballots.filter((b) => !removed.has(b.optionId));
  p.comments = (p.comments ?? []).filter((c) => !removed.has(c.nodeId));
  p.links = (p.links ?? []).filter((l) => !removed.has(l.sourceId) && !removed.has(l.targetId));
  for (const nodeId of removed) delete p.layout.fourWayOffsets[nodeId];
}
/** The authored template (credence and signed influence) — a structural starting point, never a person's review. */
function applyTemplate(p: Project, id: string, credence: number, influence: number | null): void {
  const n = node(p, id);
  if (n.sharedReasonId) fail('Yhteisperusteen arvio on lukittu kirjastoon');
  if (!truthAssessable(n) && !isUnrated(n))
    fail('Tälle solmulle ei voi lisätä totuususkottavuuden arviota (arvo tai reunaehto)');
  if (typeof credence !== 'number' || !Number.isFinite(credence) || credence < 0 || credence > 100)
    fail('Uskottavuusarvion on oltava välillä 0–100');
  const isEdge = n.parentId !== null && n.relation !== 'option' && n.relation !== 'group';
  if (isEdge) {
    if (typeof influence !== 'number' || !Number.isFinite(influence) || influence < -5 || influence > 5)
      fail('Vaikutusarvion on oltava välillä −5…+5');
  } else if (influence !== null)
    fail('Päätöskysymyksellä tai vaihtoehdolla ei ole puolesta/vastaan-vaikutusta');
  n.confidence = credence;
  if (isEdge && influence !== null) {
    n.impact = Math.abs(influence);
    if (influence > 0) n.relation = 'support';
    if (influence < 0) n.relation = 'oppose';
    if (influence === 0) n.relation = 'neutral';
  }
}

// ---- links ----
export function canAddLink(p: Project, sourceId: string, targetId: string): boolean {
  const source = p.nodes.find((n) => n.id === sourceId);
  const target = p.nodes.find((n) => n.id === targetId);
  if (
    !source ||
    !target ||
    source.kind !== 'claim' ||
    !!source.sharedReasonId ||
    target.kind === 'group' ||
    (target.kind === 'decision' && target.parentId !== null) ||
    sourceId === targetId ||
    source.parentId === targetId ||
    (p.links ?? []).some((l) => l.sourceId === sourceId && l.targetId === targetId) ||
    (p.links ?? []).length >= 2000
  )
    return false;
  return !graphHasCycle(p.nodes, [
    ...(p.links ?? []),
    { id: '', sourceId, targetId, relation: 'support', impact: 0 },
  ]);
}
const checkSignedLinkValue = (value: number) =>
  checkInfluence(value, 'Lisäyhteyden vaikutuksen on oltava −5…+5 0,1 pisteen askelin');
function addSignedLink(
  p: Project,
  id: string,
  sourceId: string,
  targetId: string,
  value: number,
  actorId: string
): Link {
  checkSignedLinkValue(value);
  if (!canAddLink(p, sourceId, targetId)) fail('Lisäyhteys aiheuttaisi syklin tai on jo olemassa');
  if ((p.links ?? []).some((l) => l.id === id)) fail('Päällekkäinen lisäyhteyden tunniste');
  const link: Link = {
    id,
    sourceId,
    targetId,
    relation: value < 0 ? 'oppose' : 'support',
    impact: Math.abs(value),
    createdBy: actorId,
  };
  p.links = [...(p.links ?? []), link];
  return link;
}
function updateSignedLink(p: Project, id: string, value: number): void {
  checkSignedLinkValue(value);
  const link = (p.links ?? []).find((l) => l.id === id) ?? fail('Virheellinen lisäyhteyden päivitys');
  link.relation = value < 0 ? 'oppose' : 'support';
  link.impact = Math.abs(value);
}
function removeLink(p: Project, id: string): void {
  const before = (p.links ?? []).length;
  p.links = (p.links ?? []).filter((l) => l.id !== id);
  if (before === p.links.length) fail('Lisäyhteyttä ei löytynyt');
  p.edgeAssessments = (p.edgeAssessments ?? []).filter(
    (a) => a.subjectType !== 'secondary' || a.subjectId !== id
  );
}

// ---- reviews ----
function upsertVote(
  p: Project,
  id: string,
  nodeId: string,
  userId: string,
  credence: number,
  now: string
): void {
  const n = p.nodes.find((x) => x.id === nodeId);
  if (!n || !p.users.some((u) => u.id === userId)) fail('Tuntematon käyttäjä tai solmu');
  if (n.sharedReasonId) fail('Yhteisperusteen arvio on lukittu kirjastoon');
  if (!truthAssessable(n))
    fail('Tälle solmulle ei voi lisätä totuususkottavuuden arviota (arvo tai reunaehto)');
  if (typeof credence !== 'number' || !Number.isFinite(credence) || credence < 0 || credence > 100)
    fail('Arvion on oltava välillä 0–100');
  const existing = p.votes.find((v) => v.nodeId === nodeId && v.userId === userId);
  if (existing) {
    existing.confidence = credence;
    existing.updatedAt = now;
  } else p.votes.push({ id, nodeId, userId, confidence: credence, updatedAt: now });
}
function upsertEdgeAssessment(
  p: Project,
  id: string,
  subjectType: SubjectType,
  subjectId: string,
  userId: string,
  influence: number,
  now: string
): void {
  requireProfile(p, userId);
  if (subjectType === 'primary' && p.nodes.some((n) => n.id === subjectId && n.sharedReasonId))
    fail('Yhteisperusteen vaikutus on lukittu kirjastoon');
  const relation = assessmentRelation(p, subjectType, subjectId);
  checkInfluence(influence, 'Suhteen vaikutuksen on oltava −5…+5, 0,1 pisteen askelin');
  influence = roundInfluence(influence);
  const old = p.edgeAssessments.find(
    (a) => a.subjectType === subjectType && a.subjectId === subjectId && a.userId === userId
  );
  if (old) {
    old.influence = influence;
    old.fingerprint = relation.fingerprint;
    old.updatedAt = now;
  } else
    p.edgeAssessments.push({
      id,
      userId,
      subjectType,
      subjectId,
      influence,
      fingerprint: relation.fingerprint,
      updatedAt: now,
    });
}
function applyPersonalAssessment(
  p: Project,
  voteId: string,
  assessmentId: string,
  nodeId: string,
  userId: string,
  credence: number | null,
  influence: number | null,
  now: string
): void {
  if (p.nodes.some((n) => n.id === nodeId && n.sharedReasonId)) fail('Yhteisperusteen arviot ovat lukittuja');
  const n = p.nodes.find((x) => x.id === nodeId) ?? fail('Arvioitavaa perustetta ei löytynyt');
  requireProfile(p, userId);
  const fields = assessmentFields(n);
  if (!fields.credence && !fields.impact) fail('Tälle solmulle ei ole totuus- tai suhdearviota');
  if (fields.credence) {
    if (!Number.isInteger(credence) || (credence as number) < 0 || (credence as number) > 100)
      fail('Uskottavuusarvion on oltava välillä 0–100');
  } else if (credence !== null) fail('Arvostukselle ei voi lisätä totuususkottavuuden arviota');
  if (fields.impact) {
    assessmentRelation(p, 'primary', nodeId);
    if (
      influence === null ||
      !Number.isFinite(influence) ||
      influence < -5 ||
      influence > 5 ||
      !isInfluenceStep(influence)
    )
      fail('Vaikutusarvion on oltava −5…+5');
  } else if (influence !== null) fail('Tällä perusteella ei ole arvioitavaa vanhempisuhdetta');
  if (fields.credence) upsertVote(p, voteId, nodeId, userId, credence as number, now);
  if (fields.impact)
    upsertEdgeAssessment(p, assessmentId, 'primary', nodeId, userId, influence as number, now);
}

// ---- comments ----
function addComment(
  p: Project,
  id: string,
  nodeId: string,
  body: string,
  authorName: string,
  authorId: string | null,
  now: string
): void {
  if (!p.nodes.some((n) => n.id === nodeId)) fail('Kommentin solmua ei ole');
  if (typeof body !== 'string' || !body.trim() || body.length > 3000) fail('Kommentin pituus 1-3000 merkkiä');
  if (typeof authorName !== 'string' || authorName.length > 120) fail('Virheellinen tekijä');
  if (authorId !== null && !p.users.some((u) => u.id === authorId)) fail('Kommentin tekijätunniste puuttuu');
  if ((p.comments ?? []).length >= 10000) fail('Liikaa kommentteja');
  p.comments = [
    ...(p.comments ?? []),
    { id, nodeId, body: body.trim(), authorName, ...(authorId === null ? {} : { authorId }), createdAt: now },
  ];
}
function deleteComment(p: Project, id: string): void {
  const before = (p.comments ?? []).length;
  p.comments = (p.comments ?? []).filter((c) => c.id !== id);
  if (p.comments.length === before) fail('Kommenttia ei löytynyt');
}

// ---- locked shared reasons ----
function assertSharedInputs(title: string, confidence: number, influence: number): void {
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200)
    fail('Yhteisperusteen otsikon pituus on 1–200');
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 100)
    fail('Yhteisperusteen uskottavuuden on oltava 0–100 %');
  checkInfluence(influence, 'Yhteisperusteen vaikutuksen on oltava −5…+5, 0,1 tarkkuudella');
}
const stanceOf = (influence: number): 'support' | 'oppose' | 'neutral' =>
  influence > 0 ? 'support' : influence < 0 ? 'oppose' : 'neutral';
function addSharedReason(
  p: Project,
  id: string,
  title: string,
  confidence: number,
  influence: number
): SharedReason {
  assertSharedInputs(title, confidence, influence);
  p.sharedReasons ??= [];
  if (p.sharedReasons.length >= 200) fail('Yhteisperusteita voi olla enintään 200');
  const reason = { id, title: title.trim(), confidence, influence };
  p.sharedReasons.push(reason);
  return reason;
}
function updateSharedReason(
  p: Project,
  id: string,
  title: string,
  confidence: number,
  influence: number
): void {
  const reason = sharedReason(p, id) ?? fail('Yhteisperustetta ei löytynyt');
  assertSharedInputs(title, confidence, influence);
  reason.title = title.trim();
  reason.confidence = confidence;
  reason.influence = influence;
  for (const n of p.nodes)
    if (n.sharedReasonId === id) {
      n.title = reason.title;
      n.confidence = reason.confidence;
      n.impact = Math.abs(reason.influence);
      n.relation = stanceOf(reason.influence);
    }
}
function attachSharedReason(p: Project, id: string, parentId: string, nodeId: string, actorId: string): Node {
  const reason = sharedReason(p, id);
  const parent = p.nodes.find((n) => n.id === parentId);
  if (!reason || !parent) fail('Yhteisperuste tai kohdesolmu puuttuu');
  const r = reason as SharedReason;
  const par = parent as Node;
  if (par.kind === 'decision' || par.kind === 'group')
    fail('Liitä yhteisperuste konkreettiseen vaihtoehtoon tai väitteeseen');
  if (par.sharedReasonId) fail('Lukittu yhteisperuste on päätesolmu');
  if (p.nodes.some((n) => n.parentId === parentId && n.sharedReasonId === id))
    fail('Yhteisperuste on jo liitetty tähän kohteeseen');
  const created = addChild(p, nodeId, parentId, stanceOf(r.influence), actorId);
  created.sharedReasonId = id;
  created.title = r.title;
  created.confidence = r.confidence;
  created.impact = Math.abs(r.influence);
  created.semanticType = 'fact';
  return created;
}
function detachSharedReason(p: Project, nodeId: string): void {
  const n = p.nodes.find((x) => x.id === nodeId);
  if (!n?.sharedReasonId) fail('Solmu ei ole yhteisperusteen liitos');
  delete (n as Node).sharedReasonId;
}
function removeSharedReason(p: Project, id: string): void {
  if (!sharedReason(p, id)) fail('Yhteisperustetta ei löytynyt');
  if (p.nodes.some((n) => n.sharedReasonId === id))
    fail('Irrota yhteisperuste kaikista kohteista ennen poistamista');
  p.sharedReasons = (p.sharedReasons ?? []).filter((r) => r.id !== id);
}

// ---- contextual reason concepts ----
function addReasonConcept(
  p: Project,
  id: string,
  title: string,
  semanticType: ReasonConcept['semanticType'] = 'fact'
): ReasonConcept {
  if (
    typeof title !== 'string' ||
    !title.trim() ||
    title.trim().length > 200 ||
    !['fact', 'assumption', 'value'].includes(semanticType)
  )
    fail('Virheellinen kontekstiperusteen nimi tai semanttinen tyyppi');
  p.reasonConcepts ??= [];
  if (p.reasonConcepts.length >= 200) fail('Kontekstiperusteiden enimmäismäärä on 200');
  const concept = { id, title: title.trim(), semanticType };
  p.reasonConcepts.push(concept);
  return concept;
}
function promoteReasonConcept(p: Project, nodeId: string, conceptId: string): ReasonConcept {
  const n = p.nodes.find((x) => x.id === nodeId);
  const parent = n?.parentId ? p.nodes.find((x) => x.id === n.parentId) : undefined;
  if (!n || n.kind !== 'claim' || !parent || !['claim', 'option'].includes(parent.kind) || n.sharedReasonId)
    fail('Vain perustelusolmun voi lisätä toistuviin perusteluihin');
  const nn = n as Node;
  if (nn.reasonConceptId) return reasonConcept(p, nn.reasonConceptId) as ReasonConcept;
  const semanticType = (
    ['fact', 'assumption', 'value'].includes(nn.semanticType ?? '') ? nn.semanticType : 'fact'
  ) as ReasonConcept['semanticType'];
  const concept = addReasonConcept(p, conceptId, nn.title, semanticType);
  nn.reasonConceptId = concept.id;
  nn.semanticType = semanticType;
  return concept;
}
function updateReasonConcept(p: Project, id: string, title: string): void {
  const concept = reasonConcept(p, id);
  if (!concept || typeof title !== 'string' || !title.trim() || title.trim().length > 200)
    fail('Virheellinen kontekstiperusteen muokkaus');
  const c = concept as ReasonConcept;
  c.title = title.trim();
  for (const n of p.nodes) if (n.reasonConceptId === id) n.title = c.title;
}
export function canAttachReasonConcept(p: Project, id: string, parentId: string): boolean {
  if (!reasonConcept(p, id)) return false;
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const parent = byId.get(parentId);
  if (!parent || !['claim', 'option'].includes(parent.kind) || parent.sharedReasonId) return false;
  if (p.nodes.some((n) => n.parentId === parentId && n.reasonConceptId === id)) return false;
  const visited = new Set<string>();
  for (
    let cursor: Node | undefined = parent;
    cursor && !visited.has(cursor.id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
  ) {
    if (cursor.reasonConceptId === id) return false;
    visited.add(cursor.id);
  }
  const sources = new Set(p.nodes.filter((n) => n.reasonConceptId === id).map((n) => n.id));
  if ((p.links ?? []).some((link) => link.targetId === parentId && sources.has(link.sourceId))) return false;
  return true;
}
/** Would `concept.reuse` of `sourceId` at `targetId` succeed? The source may or may not be a concept yet. */
export function canReuseClaimAt(p: Project, sourceId: string, targetId: string): boolean {
  const source = p.nodes.find((n) => n.id === sourceId);
  const parent = source?.parentId ? p.nodes.find((n) => n.id === source.parentId) : undefined;
  if (
    !source ||
    source.kind !== 'claim' ||
    !parent ||
    !['claim', 'option'].includes(parent.kind) ||
    source.sharedReasonId
  )
    return false;
  if (sourceId === targetId || source.parentId === targetId) return false;
  const target = p.nodes.find((n) => n.id === targetId);
  if (!target || !['claim', 'option'].includes(target.kind) || target.sharedReasonId) return false;
  if (source.reasonConceptId) return canAttachReasonConcept(p, source.reasonConceptId, targetId);
  // Not yet a concept: simulate the promotion on a clone and ask the real predicate.
  const draft = structuredClone(p);
  const conceptId = '__probe__';
  draft.reasonConcepts = [
    ...(draft.reasonConcepts ?? []),
    { id: conceptId, title: source.title, semanticType: 'fact' },
  ];
  const probe = draft.nodes.find((n) => n.id === sourceId) as Node;
  probe.reasonConceptId = conceptId;
  return canAttachReasonConcept(draft, conceptId, targetId);
}
function attachReasonConcept(
  p: Project,
  id: string,
  parentId: string,
  nodeId: string,
  actorId: string
): Node {
  const concept = reasonConcept(p, id);
  const parent = p.nodes.find((n) => n.id === parentId);
  if (!concept || !parent || !['claim', 'option'].includes(parent.kind) || parent.sharedReasonId)
    fail('Kontekstiperuste tarvitsee olemassa olevan väitteen tai konkreettisen vaihtoehdon');
  if (p.nodes.some((n) => n.parentId === parentId && n.reasonConceptId === id))
    fail('Kontekstiperuste on jo tässä kohteessa');
  if (!canAttachReasonConcept(p, id, parentId))
    fail('Perustelua ei voi liittää omaan perusteluketjuunsa tai jo olemassa olevan vaikutusreitin päälle');
  const c = concept as ReasonConcept;
  const use = addChild(p, nodeId, parentId, 'neutral', actorId);
  use.reasonConceptId = id;
  use.title = c.title;
  use.semanticType = c.semanticType;
  use.confidence = 100;
  use.impact = 0;
  return use;
}
function detachReasonConcept(p: Project, nodeId: string): void {
  const use = p.nodes.find((n) => n.id === nodeId);
  if (!use?.reasonConceptId) fail('Solmu ei ole kontekstiperusteen käyttö');
  delete (use as Node).reasonConceptId;
}
function removeReasonConcept(p: Project, id: string): void {
  if (!reasonConcept(p, id)) fail('Kontekstiperustetta ei löytynyt');
  if (p.nodes.some((n) => n.reasonConceptId === id))
    fail('Irrota kontekstiperuste liitoksista ennen poistoa');
  p.reasonConcepts = (p.reasonConcepts ?? []).filter((r) => r.id !== id);
}

// ---- people ----
function removeLocalProfile(p: Project, userId: string): void {
  const profile = p.users.find((u) => u.id === userId);
  if (!profile || profile.role === 'owner') fail('Omistajaprofiilia ei voi poistaa');
  if (p.nodes.some((n) => n.createdBy === userId))
    fail('Väitteiden laatijaprofiilia ei voi poistaa; nimeä se uudelleen');
  if (p.nodes.some((n) => n.lastEditedBy === userId) || (p.links ?? []).some((l) => l.createdBy === userId))
    fail('Muokkaajan tai yhteyden laatijan profiilia ei voi poistaa; nimeä se uudelleen');
  if ((p.comments ?? []).some((c) => c.authorId === userId))
    fail('Kommentin kirjoittajaprofiilia ei voi poistaa; nimeä se uudelleen');
  if (
    Object.hasOwn(p.votingRound?.weightByUser ?? {}, userId) ||
    (p.voteAudit ?? []).some((a) => a.userId === userId) ||
    (p.voteHistory ?? []).some(
      (h) => Object.hasOwn(h.round.weightByUser, userId) || h.audit.some((a) => a.userId === userId)
    )
  )
    fail('Aiemman äänestyskierroksen osallistujaa ei voi poistaa; nimeä hänet uudelleen');
  p.users = p.users.filter((u) => u.id !== userId);
  p.votes = p.votes.filter((v) => v.userId !== userId);
  if (p.abstentions) {
    p.abstentions = p.abstentions.filter((a) => a.userId !== userId);
    if (!p.abstentions.length) delete p.abstentions;
  }
  p.edgeAssessments = (p.edgeAssessments ?? []).filter((a) => a.userId !== userId);
  p.ballots = p.ballots.filter((b) => b.userId !== userId);
}

// ---- ballots ----
function startVotingRound(
  p: Project,
  id: string,
  auditIds: string[],
  anonymous: boolean,
  hideResults: boolean,
  now: string
): void {
  if (p.mode !== 'decision' || p.votingRound?.status === 'open')
    fail('Voting already open or not a decision');
  if (p.votingRound?.status === 'closed') {
    if ((p.voteHistory ?? []).length >= 20)
      fail('Vote history is full: export the document and create a fresh copy');
    p.voteHistory ??= [];
    const previous = p.votingRound;
    const titleByOption = Object.fromEntries(
      previous.optionIds.map((o) => [o, p.nodes.find((n) => n.id === o)?.title ?? o])
    );
    p.voteHistory.push({
      round: structuredClone(previous),
      ballots: structuredClone(p.ballots),
      audit: structuredClone(p.voteAudit),
      titleByOption,
    });
    p.ballots = [];
    p.voteAudit = [];
  }
  const optionIds = p.nodes.filter((n) => n.relation === 'option').map((n) => n.id);
  if (optionIds.length < 2) fail('Voting requires at least two options');
  if (auditIds.length < 1 + p.ballots.length)
    fail('Äänestyskierros tarvitsee tunnisteen avaukselle ja jokaiselle aiemmalle äänelle');
  const weighting = p.settings.voteWeighting;
  const weightByUser = Object.fromEntries(
    p.users.filter((u) => !isAiProfile(u)).map((u) => [u.id, weighting === 'shares' ? u.shares : 1])
  );
  p.votingRound = {
    id,
    status: 'open',
    anonymous,
    hideResults,
    weighting,
    weightByUser,
    optionIds,
    openedAt: now,
    closedAt: null,
  };
  const owner = p.users[0] as { id: string };
  p.voteAudit = [{ id: auditIds[0] as string, roundId: id, action: 'open', at: now, userId: owner.id }];
  p.ballots.forEach((ballot, index) =>
    p.voteAudit.push({
      id: auditIds[index + 1] as string,
      roundId: id,
      action: 'cast',
      at: now,
      userId: ballot.userId,
      optionId: ballot.optionId,
    })
  );
}
function closeVotingRound(p: Project, userId: string, auditId: string, now: string): void {
  const round = p.votingRound;
  if (!round || round.status !== 'open') fail('No open voting round');
  const r = round as NonNullable<Project['votingRound']>;
  if (!p.users.some((u) => u.id === userId && u.role === 'owner')) fail('Only owner can close vote');
  r.status = 'closed';
  r.closedAt = now;
  p.voteAudit.push({ id: auditId, roundId: r.id, action: 'close', at: now, userId });
}
function upsertBallot(
  p: Project,
  id: string,
  auditId: string,
  optionId: string,
  userId: string,
  preference: number,
  now: string
): void {
  if (
    !p.nodes.some((n) => n.id === optionId && n.relation === 'option') ||
    !p.users.some((u) => u.id === userId)
  )
    fail('Tuntematon käyttäjä tai päätösvaihtoehto');
  if (isAiProfile(p.users.find((u) => u.id === userId)))
    fail('AI-arvioijalle ei voi kirjata ihmisen päätösääntä');
  if (typeof preference !== 'number' || !Number.isFinite(preference) || preference < 0 || preference > 100)
    fail('Kannatuksen on oltava välillä 0–100');
  const round = p.votingRound;
  if (round?.status === 'closed') fail('Voting closed');
  if (
    round &&
    (round.status !== 'open' ||
      !round.optionIds.includes(optionId) ||
      !Object.hasOwn(round.weightByUser, userId))
  )
    fail('Not eligible for round');
  const existing = p.ballots.find((b) => b.optionId === optionId && b.userId === userId);
  if (existing) {
    existing.preference = preference;
    existing.updatedAt = now;
  } else p.ballots.push({ id, optionId, userId, preference, updatedAt: now });
  if (round)
    p.voteAudit.push({
      id: auditId,
      roundId: round.id,
      action: existing ? 'update' : 'cast',
      userId,
      optionId,
      at: now,
    });
}
function removeBallot(p: Project, auditId: string, optionId: string, userId: string, now: string): void {
  const round = p.votingRound;
  if (round?.status === 'closed') fail('Voting closed');
  if (round && round.status !== 'open') fail('Voting not open');
  const before = p.ballots.length;
  p.ballots = p.ballots.filter((b) => !(b.optionId === optionId && b.userId === userId));
  if (p.ballots.length < before && round)
    p.voteAudit.push({ id: auditId, roundId: round.id, action: 'retract', userId, optionId, at: now });
}

// ---- dispatcher ----
function run(p: Project, c: Command, ctx: CommandContext): void {
  switch (c.type) {
    case 'project.setTitle':
      if (typeof c.title !== 'string' || !c.title.trim() || c.title.length > 200)
        fail('Asiakirjan nimi: virheellinen teksti');
      p.title = c.title.trim();
      return;
    case 'project.setMode': {
      const root = rootNode(p) ?? fail('Asiakirjassa on oltava juuri');
      p.mode = c.mode;
      root.kind = c.mode === 'decision' ? 'decision' : 'claim';
      return;
    }
    case 'project.setTheme':
      p.theme = c.theme;
      return;
    case 'project.setAssessmentWeighting':
      p.settings.assessmentWeighting = c.weighting;
      return;
    case 'project.setScoring':
      if (!SCORING_VERSIONS.includes(c.scoring)) fail('Tuntematon laskentatapa');
      p.settings.scoring = c.scoring;
      return;
    case 'project.setVoteWeighting':
      p.settings.voteWeighting = c.weighting;
      return;
    case 'project.setShowAuthors':
      p.settings.showAuthors = c.showAuthors;
      return;
    case 'node.add': {
      const created = addChild(p, c.id, c.parentId, c.relation, ctx.actorId);
      if (c.title !== undefined) created.title = c.title;
      if (c.semanticType !== undefined) {
        if (c.semanticType !== 'value' || created.kind !== 'claim') fail('Virheellinen semanttinen luokitus');
        created.semanticType = 'value';
      }
      if (c.unrated) {
        if (created.kind !== 'claim') fail('Vain perustelu voi olla arvioimaton huomio');
        created.unrated = true;
      }
      // A new option, group or value takes the type name its siblings of the same kind use, so naming one
      // "Kriteeri" names the next one too.
      const sibling = p.nodes
        .filter(
          (n) =>
            n.parentId === c.parentId &&
            n.id !== created.id &&
            n.typeLabel &&
            n.kind === created.kind &&
            (created.kind !== 'claim' || (isValue(n) && isValue(created)))
        )
        .at(-1);
      if (sibling && (created.kind !== 'claim' || isValue(created))) created.typeLabel = sibling.typeLabel;
      return;
    }
    case 'node.edit': {
      const n = node(p, c.id);
      if (n.sharedReasonId && (c.title !== undefined || c.semanticType !== undefined))
        fail('Yhteisperusteen teksti on lukittu kirjastoon');
      if (n.reasonConceptId && c.title !== undefined) fail('Toistuvan perustelun teksti muokataan kortista');
      if (c.title !== undefined) n.title = c.title;
      if (c.details !== undefined) n.details = c.details;
      if (c.semanticType !== undefined) {
        n.semanticType = c.semanticType;
        if (isGate(n)) n.constraintStatus = n.constraintStatus ?? 'unknown';
        else delete n.constraintStatus;
        if (['value', 'constraint', 'prerequisite'].includes(c.semanticType))
          p.votes = p.votes.filter((v) => v.nodeId !== n.id);
      }
      if (c.constraintStatus !== undefined) {
        if (!isGate(n)) fail('Virheellinen reunaehdon tila');
        n.constraintStatus = c.constraintStatus;
      }
      if (c.authorVisibility !== undefined) n.authorVisibility = c.authorVisibility;
      if (c.sources !== undefined) n.sources = c.sources;
      if (c.typeLabel !== undefined) {
        const label = c.typeLabel?.trim() ?? '';
        if (label.length > TYPE_LABEL_MAX) fail('Tyyppinimi on liian pitkä');
        if (label) n.typeLabel = label;
        else delete n.typeLabel;
      }
      if (c.unrated !== undefined) {
        if (c.unrated && (n.kind !== 'claim' || n.parentId === null))
          fail('Vain perustelu voi olla arvioimaton huomio');
        if (c.unrated) n.unrated = true;
        else delete n.unrated;
      }
      if (c.fineInfluence !== undefined) {
        if (c.fineInfluence) n.fineInfluence = true;
        else delete n.fineInfluence;
      }
      return;
    }
    case 'node.move':
      if (!canReparent(p, c.id, c.parentId))
        fail('Uusi vanhempi on virheellinen (sykli tai väärä vaihtoehdon taso)');
      node(p, c.id).parentId = c.parentId;
      return;
    case 'node.remove':
      removeSubtree(p, c.id);
      return;
    case 'node.collapse':
      node(p, c.id).collapsed = c.collapsed;
      return;
    case 'node.position':
      for (const [id, position] of Object.entries(c.positions)) node(p, id).position = { ...position };
      return;
    case 'node.template':
      applyTemplate(p, c.id, c.credence, c.influence);
      return;
    case 'layout.auto':
      for (const [id, position] of autoLayoutPositions(p)) node(p, id).position = position;
      return;
    case 'layout.fourWay':
      p.layout.fourWayOffsets = structuredClone(c.offsets);
      return;
    case 'review.credence':
      upsertVote(p, c.id, c.nodeId, c.userId, c.credence, ctx.now);
      return;
    case 'review.influence':
      upsertEdgeAssessment(p, c.id, c.subjectType, c.subjectId, c.userId, c.influence, ctx.now);
      return;
    case 'review.abstain': {
      requireProfile(p, c.userId);
      const n = node(p, c.nodeId);
      if (n.kind !== 'claim' || n.parentId === null || n.sharedReasonId)
        fail('Vain perustelun arvioinnista voi pidättäytyä');
      const others = (p.abstentions ?? []).filter((a) => !(a.nodeId === c.nodeId && a.userId === c.userId));
      if (c.abstain) p.abstentions = [...others, { userId: c.userId, nodeId: c.nodeId, updatedAt: ctx.now }];
      else if (others.length === (p.abstentions ?? []).length) fail('Pidättäytymistä ei ole');
      else if (others.length) p.abstentions = others;
      else delete p.abstentions;
      return;
    }
    case 'review.personal':
      applyPersonalAssessment(
        p,
        c.voteId,
        c.assessmentId,
        c.nodeId,
        c.userId,
        c.credence,
        c.influence,
        ctx.now
      );
      return;
    case 'link.add':
      addSignedLink(p, c.id, c.sourceId, c.targetId, c.value, ctx.actorId);
      return;
    case 'link.update':
      updateSignedLink(p, c.id, c.value);
      return;
    case 'link.remove':
      removeLink(p, c.id);
      return;
    case 'comment.add':
      addComment(p, c.id, c.nodeId, c.body, c.authorName, c.authorId, ctx.now);
      return;
    case 'comment.remove':
      deleteComment(p, c.id);
      return;
    case 'shared.add':
      addSharedReason(p, c.id, c.title, c.confidence, c.influence);
      return;
    case 'shared.update':
      updateSharedReason(p, c.id, c.title, c.confidence, c.influence);
      return;
    case 'shared.attach':
      attachSharedReason(p, c.id, c.parentId, c.nodeId, ctx.actorId);
      return;
    case 'shared.detach':
      detachSharedReason(p, c.nodeId);
      return;
    case 'shared.remove':
      removeSharedReason(p, c.id);
      return;
    case 'concept.add':
      addReasonConcept(p, c.id, c.title, c.semanticType);
      return;
    case 'concept.promote':
      promoteReasonConcept(p, c.nodeId, c.conceptId);
      return;
    case 'concept.update':
      updateReasonConcept(p, c.id, c.title);
      return;
    case 'concept.attach':
      attachReasonConcept(p, c.id, c.parentId, c.nodeId, ctx.actorId);
      return;
    case 'concept.reuse': {
      const concept = promoteReasonConcept(p, c.sourceId, c.conceptId);
      attachReasonConcept(p, concept.id, c.targetId, c.nodeId, ctx.actorId);
      return;
    }
    case 'concept.detach':
      detachReasonConcept(p, c.nodeId);
      return;
    case 'concept.remove':
      removeReasonConcept(p, c.id);
      return;
    case 'user.add': {
      const name = c.name.trim();
      if (p.users.length >= 100) fail('Käyttäjiä on oltava 1–100');
      if (
        !name ||
        name.length > 120 ||
        p.users.some((u) => u.name.toLocaleLowerCase() === name.toLocaleLowerCase())
      )
        fail('Nimi on jo käytössä tai virheellinen');
      if (p.users.some((u) => u.id === c.id)) fail('Päällekkäinen käyttäjä tai virheellinen rooli');
      p.users.push({
        id: c.id,
        name,
        shares: c.shares ?? (c.profileKind === 'ai' ? 0 : 1),
        role: c.role ?? (c.profileKind === 'ai' ? 'viewer' : 'editor'),
        ...(c.profileKind ? { profileKind: c.profileKind } : {}),
      });
      return;
    }
    case 'user.rename': {
      const user = p.users.find((u) => u.id === c.id) ?? fail('Tuntematon arvioijaprofiili');
      const name = c.name.trim();
      if (!name || name.length > 120) fail('Nimi: virheellinen teksti');
      user.name = name;
      return;
    }
    case 'user.setShares': {
      const user = p.users.find((u) => u.id === c.id) ?? fail('Tuntematon arvioijaprofiili');
      if (!Number.isFinite(c.shares) || c.shares < 0 || c.shares > 1e12)
        fail('Osakkeet: arvon oltava välillä 0–1000000000000');
      if (p.votingRound?.status === 'open') fail('Painoja ei voi muuttaa avoimen äänestyksen aikana');
      user.shares = c.shares;
      return;
    }
    case 'user.remove':
      removeLocalProfile(p, c.id);
      return;
    case 'round.start':
      startVotingRound(p, c.id, c.auditIds, c.anonymous ?? false, c.hideResults ?? true, ctx.now);
      return;
    case 'round.close':
      closeVotingRound(p, c.userId, c.auditId, ctx.now);
      return;
    case 'ballot.cast':
      upsertBallot(p, c.id, c.auditId, c.optionId, c.userId, c.preference, ctx.now);
      return;
    case 'ballot.retract':
      removeBallot(p, c.auditId, c.optionId, c.userId, ctx.now);
      return;
    default: {
      const never: never = c;
      fail(`Tuntematon komento ${JSON.stringify(never)}`);
    }
  }
}

/**
 * Apply one command. The input is never mutated. Like the prototype's mutation wrapper: nodes whose title, details,
 * semantic type or gate status changed get `lastEditedBy = actorId`; new links get `createdBy`; the result is
 * re-validated by `parseProject` and stamped with `updatedAt = now`. Returns the same object when nothing changed.
 */
export function applyCommand(project: Project, command: Command, ctx: CommandContext): Project {
  if (!project.users.some((u) => u.id === ctx.actorId)) throw new Error('Tuntematon arvioijaprofiili');
  const draft = structuredClone(project);
  run(draft, command, ctx);
  const previous = new Map(project.nodes.map((n) => [n.id, n]));
  for (const n of draft.nodes) {
    const prev = previous.get(n.id);
    if (
      prev &&
      (['title', 'details', 'semanticType', 'constraintStatus'] as const).some((k) => n[k] !== prev[k])
    )
      n.lastEditedBy = ctx.actorId;
  }
  const previousLinks = new Set(project.links.map((l) => l.id));
  for (const link of draft.links)
    if (!previousLinks.has(link.id) && !link.createdBy) link.createdBy = ctx.actorId;
  const next = parseProject(draft);
  if (JSON.stringify({ ...next, updatedAt: project.updatedAt }) === JSON.stringify(project)) return project;
  next.updatedAt = ctx.now;
  return next;
}
/** Apply a log of commands in order; the first failure aborts and the input stays untouched. */
export function applyCommands(project: Project, commands: Command[], ctx: CommandContext): Project {
  return commands.reduce((acc, command) => applyCommand(acc, command, ctx), project);
}
