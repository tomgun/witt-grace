// Mutation primitives the AI flows need while building a document: the prototype's Core.addChild, addLink,
// addComment, upsertVote, upsertEdgeAssessment, addSharedReason and attachSharedReason with the id and the clock
// passed in. They edit the draft they are given (the callers own a private copy and re-validate with parseProject
// at the end, as the prototype does with Core.validateProject). commands.ts owns the same rules for interactive
// edits; this file exists because a draft import or a contribution merge must call the primitives in exactly the
// prototype's order to reproduce its ids, which the Command log cannot express.
import { isHalfStep, truthAssessable } from '../model.ts';
import type { Link, LinkRelation, Node, Project, SharedReason, Stance, SubjectType } from '../model.ts';
import { childrenOf, graphHasCycle, sharedReason } from '../graph.ts';
import { newNode } from '../project.ts';
import { assessmentRelation } from '../reviews.ts';

/** The clock and id source every conversion takes; nothing in src/domain reads Date or crypto. */
export interface Clock {
  now: string;
  newId: () => string;
}

function fail(message: string): never {
  throw new Error(message);
}

export function addChild(
  p: Project,
  parentId: string,
  relation: Exclude<Stance, 'root'>,
  actorId: string,
  newId: () => string
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
  const siblingCount = childrenOf(p, parentId).length;
  const created = newNode({
    id: newId(),
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

function canAddLink(p: Project, sourceId: string, targetId: string): boolean {
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

/** A structural link with an unsigned impact (the AI flows always pass 0: the opinion lives in edgeAssessments). */
export function addLink(
  p: Project,
  sourceId: string,
  targetId: string,
  relation: LinkRelation,
  impact: number,
  newId: () => string
): Link {
  if (!['support', 'oppose'].includes(relation) || !Number.isFinite(impact) || impact < 0 || impact > 5)
    fail('Virheellinen lisäyhteyden suhde tai vaikutusarvio');
  if (!canAddLink(p, sourceId, targetId)) fail('Lisäyhteys aiheuttaisi syklin tai on jo olemassa');
  const link: Link = { id: newId(), sourceId, targetId, relation, impact };
  p.links = [...(p.links ?? []), link];
  return link;
}

export function addComment(
  p: Project,
  nodeId: string,
  body: string,
  authorName: string,
  authorId: string | null,
  clock: Clock
): void {
  if (!p.nodes.some((n) => n.id === nodeId)) fail('Kommentin solmua ei ole');
  if (typeof body !== 'string' || !body.trim() || body.length > 3000) fail('Kommentin pituus 1-3000 merkkiä');
  if (typeof authorName !== 'string' || authorName.length > 120) fail('Virheellinen tekijä');
  if (authorId !== null && !p.users.some((u) => u.id === authorId)) fail('Kommentin tekijätunniste puuttuu');
  if ((p.comments ?? []).length >= 10000) fail('Liikaa kommentteja');
  p.comments = [
    ...(p.comments ?? []),
    {
      id: clock.newId(),
      nodeId,
      body: body.trim(),
      authorName,
      ...(authorId === null ? {} : { authorId }),
      createdAt: clock.now,
    },
  ];
}

export function upsertVote(
  p: Project,
  nodeId: string,
  userId: string,
  confidence: number,
  clock: Clock
): void {
  const n = p.nodes.find((x) => x.id === nodeId);
  if (!n || !p.users.some((u) => u.id === userId)) fail('Tuntematon käyttäjä tai solmu');
  if (n.sharedReasonId) fail('Yhteisperusteen arvio on lukittu kirjastoon');
  if (!truthAssessable(n))
    fail('Tälle solmulle ei voi lisätä totuususkottavuuden arviota (arvo tai reunaehto)');
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 100)
    fail('Arvion on oltava välillä 0–100');
  const existing = p.votes.find((v) => v.nodeId === nodeId && v.userId === userId);
  if (existing) {
    existing.confidence = confidence;
    existing.updatedAt = clock.now;
  } else p.votes.push({ id: clock.newId(), nodeId, userId, confidence, updatedAt: clock.now });
}

export function upsertEdgeAssessment(
  p: Project,
  subjectType: SubjectType,
  subjectId: string,
  userId: string,
  influence: number,
  clock: Clock
): void {
  if (!p.users.some((u) => u.id === userId)) fail('Tuntematon arvioijaprofiili');
  if (subjectType === 'primary' && p.nodes.some((n) => n.id === subjectId && n.sharedReasonId))
    fail('Yhteisperusteen vaikutus on lukittu kirjastoon');
  const relation = assessmentRelation(p, subjectType, subjectId);
  if (!Number.isFinite(influence) || influence < -5 || influence > 5 || !isHalfStep(influence))
    fail('Suhteen vaikutuksen on oltava −5…+5, puolen pisteen askelin');
  const old = p.edgeAssessments.find(
    (a) => a.subjectType === subjectType && a.subjectId === subjectId && a.userId === userId
  );
  if (old) {
    old.influence = influence;
    old.fingerprint = relation.fingerprint;
    old.updatedAt = clock.now;
  } else
    p.edgeAssessments.push({
      id: clock.newId(),
      userId,
      subjectType,
      subjectId,
      influence,
      fingerprint: relation.fingerprint,
      updatedAt: clock.now,
    });
}

const stanceOf = (influence: number): 'support' | 'oppose' | 'neutral' =>
  influence > 0 ? 'support' : influence < 0 ? 'oppose' : 'neutral';

export function addSharedReason(
  p: Project,
  title: string,
  confidence: number,
  influence: number,
  newId: () => string
): SharedReason {
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200)
    fail('Yhteisperusteen otsikon pituus on 1–200');
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 100)
    fail('Yhteisperusteen uskottavuuden on oltava 0–100 %');
  if (
    typeof influence !== 'number' ||
    !Number.isFinite(influence) ||
    influence < -5 ||
    influence > 5 ||
    !isHalfStep(influence)
  )
    fail('Yhteisperusteen vaikutuksen on oltava −5…+5, 0,5 tarkkuudella');
  p.sharedReasons ??= [];
  if (p.sharedReasons.length >= 200) fail('Yhteisperusteita voi olla enintään 200');
  const reason: SharedReason = { id: newId(), title: title.trim(), confidence, influence };
  p.sharedReasons.push(reason);
  return reason;
}

export function attachSharedReason(
  p: Project,
  id: string,
  parentId: string,
  actorId: string,
  newId: () => string
): Node {
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
  const created = addChild(p, parentId, stanceOf(r.influence), actorId, newId);
  created.sharedReasonId = id;
  created.title = r.title;
  created.confidence = r.confidence;
  created.impact = Math.abs(r.influence);
  created.semanticType = 'fact';
  return created;
}
