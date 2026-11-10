// The boundary: unknown JSON becomes a typed v8 Project here, once, or is refused with a message naming the reason.
// Messages are the prototype's Finnish user-facing texts; the golden tests pin the accepted shape.
import {
  ASSESSMENT_WEIGHTINGS,
  GATE_STATUSES,
  KINDS,
  MODES,
  ROLES,
  SCHEMA_VERSION,
  SCORING_VERSIONS,
  SEMANTIC_TYPES,
  STANCES,
  THEMES,
  VOTE_WEIGHTINGS,
  isAiProfile,
  isGate,
  TYPE_LABEL_MAX,
  isInfluenceStep,
  isUnrated,
  truthAssessable,
} from './model.ts';
import type {
  Ballot,
  Comment,
  EdgeAssessment,
  GateStatus,
  Layout,
  Link,
  Node,
  Project,
  ReasonConcept,
  SemanticType,
  SharedReason,
  SourceRef,
  User,
  Vote,
  VoteAuditEntry,
  VoteHistoryEntry,
  VotingRound,
  Abstention,
} from './model.ts';
import { graphHasCycle } from './graph.ts';

export class ParseError extends Error {
  override readonly name = 'ParseError';
}
function refuse(message: string): never {
  throw new ParseError(message);
}

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => !!v && typeof v === 'object' && !Array.isArray(v);
const includes = <T extends string>(set: readonly T[], v: unknown): v is T => set.includes(v as T);
const str = (v: unknown, max: number, label: string, allowEmpty = true): string => {
  if (typeof v !== 'string' || v.length > max || (!allowEmpty && !v.trim()))
    refuse(`${label}: virheellinen teksti`);
  return v as string;
};
const num = (v: unknown, min: number, max: number, label: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
    refuse(`${label}: arvon oltava välillä ${min}–${max}`);
  return v as number;
};

function readSemantic(node: Plain): Partial<Node> {
  const result: Partial<Node> = {};
  if (node.semanticType !== undefined) {
    if (!includes(SEMANTIC_TYPES, node.semanticType)) refuse('Virheellinen semanttinen luokitus');
    result.semanticType = node.semanticType as SemanticType;
  }
  if (node.constraintStatus !== undefined) {
    if (!isGate(result as Node) || !includes(GATE_STATUSES, node.constraintStatus))
      refuse('Virheellinen reunaehdon tila');
    result.constraintStatus = node.constraintStatus as GateStatus;
  }
  if (node.sources !== undefined) {
    if (!Array.isArray(node.sources) || node.sources.length > 25) refuse('Virheellinen lähteiden määrä');
    result.sources = (node.sources as unknown[]).map((source): SourceRef => {
      if (!isPlain(source)) refuse('Virheellinen lähde');
      const s = source as Plain;
      const url = str(s.url, 1000, 'Lähteen URL', false);
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return refuse('Lähde tarvitsee kelvollisen http(s)-URL:n');
      }
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || /[\r\n\t]/.test(url))
        refuse('Lähde tarvitsee kelvollisen http(s)-URL:n');
      return { url, note: str(s.note, 500, 'Lähdemerkintä') };
    });
  }
  if (node.authorVisibility !== undefined) {
    if (node.authorVisibility !== 'named' && node.authorVisibility !== 'anonymous')
      refuse('Virheellinen tekijän näkyvyys');
    result.authorVisibility = node.authorVisibility as 'named' | 'anonymous';
  }
  return result;
}

function validateLayout(layout: unknown, nodeIds: Set<string>): Layout {
  if (!isPlain(layout) || !isPlain(layout.fourWayOffsets))
    refuse('Nelisuuntaisen asettelun tiedot puuttuvat');
  const offsets: Layout['fourWayOffsets'] = {};
  for (const [nodeId, xy] of Object.entries((layout as Plain).fourWayOffsets as Plain)) {
    if (!nodeIds.has(nodeId) || !isPlain(xy) || Object.keys(xy).some((k) => k !== 'x' && k !== 'y'))
      refuse('Nelisuuntaisen asettelun tuntematon solmu');
    const p = xy as Plain;
    offsets[nodeId] = {
      x: num(p.x, -100000, 100000, 'Nelisuuntaisen X'),
      y: num(p.y, -100000, 100000, 'Nelisuuntaisen Y'),
    };
  }
  return { fourWayOffsets: offsets };
}

/** Parse an untrusted document. Throws ParseError; never mutates the input; the result is a fresh, normalized Project. */
export function parseProject(input: unknown): Project {
  if (!isPlain(input) || input.schemaVersion !== SCHEMA_VERSION)
    refuse('Tiedoston formaattiversiota ei tueta: vain nykyinen versio ' + SCHEMA_VERSION);
  const raw = input as Plain;
  if (!includes(MODES, raw.mode) || !includes(THEMES, raw.theme)) refuse('Virheellinen tila tai teema');
  const mode = raw.mode as Project['mode'];
  const settings = raw.settings;
  if (
    !isPlain(settings) ||
    !includes(VOTE_WEIGHTINGS, settings.voteWeighting) ||
    !includes(ASSESSMENT_WEIGHTINGS, settings.assessmentWeighting) ||
    !includes(SCORING_VERSIONS, settings.scoring)
  )
    refuse('Virheelliset laskenta-asetukset');
  const s = settings as Plain;
  if (
    s.shareSnapshotDate !== null &&
    (typeof s.shareSnapshotDate !== 'string' || s.shareSnapshotDate.length > 32)
  )
    refuse('Virheellinen osaketilannepäivä');
  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0 || raw.nodes.length > 1000)
    refuse('Solmuja on oltava 1–1000');
  if (
    raw.reasonConcepts !== undefined &&
    (!Array.isArray(raw.reasonConcepts) || raw.reasonConcepts.length > 200)
  )
    refuse('Virheellinen kontekstiperusteluettelo');
  if (!Array.isArray(raw.users) || raw.users.length === 0 || raw.users.length > 100)
    refuse('Käyttäjiä on oltava 1–100');
  if (!Array.isArray(raw.votes) || raw.votes.length > 10000) refuse('Liikaa väitearvioita');
  if (!Array.isArray(raw.ballots) || raw.ballots.length > 10000) refuse('Liikaa päätösääniä');
  if (!Array.isArray(raw.comments) || raw.comments.length > 10000) refuse('Liikaa kommentteja');
  if (!Array.isArray(raw.links) || raw.links.length > 2000) refuse('Virheellinen lisäyhteyksien määrä');
  if (!Array.isArray(raw.edgeAssessments) || raw.edgeAssessments.length > 10000)
    refuse('Liikaa suhdearvioita');

  const ids = new Set<string>();
  const users: User[] = (raw.users as unknown[]).map((u) => {
    if (!isPlain(u)) refuse('Virheellinen käyttäjä');
    const p = u as Plain;
    const id = str(p.id, 100, 'Käyttäjätunniste', false);
    if (ids.has(id) || !includes(ROLES, p.role)) refuse('Päällekkäinen käyttäjä tai virheellinen rooli');
    ids.add(id);
    if (p.profileKind !== undefined && p.profileKind !== 'human' && p.profileKind !== 'ai')
      refuse('Virheellinen arvioijan tyyppi');
    return {
      id,
      name: str(p.name, 120, 'Nimi', false),
      shares: num(p.shares, 0, 1e12, 'Osakkeet'),
      role: p.role as User['role'],
      ...(p.profileKind ? { profileKind: p.profileKind as User['profileKind'] } : {}),
    };
  });
  if (!users.some((u) => u.role === 'owner')) refuse('Asiakirjassa on oltava omistaja');
  const userIds = new Set(users.map((u) => u.id));
  const userById = new Map(users.map((u) => [u.id, u]));

  const sharedIds = new Set<string>();
  const sharedReasons: SharedReason[] = ((raw.sharedReasons as unknown[] | undefined) ?? []).map((reason) => {
    if (!isPlain(reason)) refuse('Virheellinen yhteisperuste');
    const p = reason as Plain;
    const id = str(p.id, 100, 'Yhteisperusteen ID', false);
    if (sharedIds.has(id)) refuse('Päällekkäinen yhteisperuste');
    sharedIds.add(id);
    const title = str(p.title, 200, 'Yhteisperusteen otsikko', false);
    const confidence = num(p.confidence, 0, 100, 'Yhteisperusteen uskottavuus');
    const influence = num(p.influence, -5, 5, 'Yhteisperusteen vaikutus');
    if (!isInfluenceStep(influence)) refuse('Yhteisperusteen tarkkuus on 0,1');
    return { id, title, confidence, influence };
  });
  if (sharedReasons.length > 200) refuse('Liikaa yhteisperusteita');
  const sharedById = new Map(sharedReasons.map((r) => [r.id, r]));
  const conceptIds = new Set<string>();
  const reasonConcepts: ReasonConcept[] = ((raw.reasonConcepts as unknown[] | undefined) ?? []).map(
    (reason) => {
      if (!isPlain(reason)) refuse('Virheellinen kontekstiperuste');
      const p = reason as Plain;
      const id = str(p.id, 100, 'Kontekstiperusteen ID', false);
      if (conceptIds.has(id)) refuse('Kontekstiperusteen tunniste on päällekkäinen');
      conceptIds.add(id);
      if (p.semanticType !== 'fact' && p.semanticType !== 'assumption' && p.semanticType !== 'value')
        refuse('Virheellinen kontekstiperusteen luokitus');
      return {
        id,
        title: str(p.title, 200, 'Kontekstiperusteen otsikko', false),
        semanticType: p.semanticType as ReasonConcept['semanticType'],
      };
    }
  );
  const conceptsById = new Map(reasonConcepts.map((r) => [r.id, r]));

  const nodeIds = new Set<string>();
  const nodes: Node[] = (raw.nodes as unknown[]).map((n) => {
    if (!isPlain(n) || !isPlain(n.position) || !includes(STANCES, n.relation) || !includes(KINDS, n.kind))
      refuse('Virheellinen solmu');
    const p = n as Plain;
    const pos = p.position as Plain;
    const id = str(p.id, 100, 'Solmutunniste', false);
    if (nodeIds.has(id)) refuse('Päällekkäinen solmutunniste');
    nodeIds.add(id);
    if (p.parentId !== null) str(p.parentId, 100, 'Vanhemman tunniste', false);
    if (typeof p.collapsed !== 'boolean') refuse('Virheellinen näkyvyys');
    return {
      id,
      parentId: p.parentId as string | null,
      relation: p.relation as Node['relation'],
      kind: p.kind as Node['kind'],
      title: str(p.title, 200, 'Solmun otsikko', false),
      details: str(p.details, 5000, 'Kuvaus'),
      confidence: num(p.confidence, 0, 100, 'Uskottavuus'),
      impact: num(p.impact, 0, 5, 'Paino'),
      collapsed: p.collapsed as boolean,
      position: { x: num(pos.x, -1e6, 1e6, 'X'), y: num(pos.y, -1e6, 1e6, 'Y') },
      createdBy: str(p.createdBy, 100, 'Tekijä', false),
      ...(p.lastEditedBy ? { lastEditedBy: str(p.lastEditedBy, 100, 'Viimeinen muokkaaja', false) } : {}),
      ...readSemantic(p),
      ...(p.sharedReasonId
        ? { sharedReasonId: str(p.sharedReasonId, 100, 'Yhteisperusteen viite', false) }
        : {}),
      ...(p.reasonConceptId
        ? { reasonConceptId: str(p.reasonConceptId, 100, 'Kontekstiperusteen viite', false) }
        : {}),
      ...(p.typeLabel !== undefined
        ? { typeLabel: str(p.typeLabel, TYPE_LABEL_MAX, 'Tyyppinimi', false) }
        : {}),
      ...(p.unrated === true ? { unrated: true as const } : {}),
      ...(p.fineInfluence === true ? { fineInfluence: true as const } : {}),
    };
  });
  const roots = nodes.filter((n) => n.parentId === null);
  const root = roots[0];
  if (roots.length !== 1 || !root || root.relation !== 'root')
    refuse('Asiakirjassa on oltava täsmälleen yksi juuri');
  if (root.kind !== (mode === 'decision' ? 'decision' : 'claim'))
    refuse('Juuren tyyppi ei vastaa asiakirjan tilaa');
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const sharedUses = new Set<string>();
  for (const node of nodes)
    if (node.sharedReasonId) {
      const reason = sharedById.get(node.sharedReasonId);
      if (!reason || node.kind !== 'claim' || !node.parentId || node.semanticType !== 'fact')
        refuse('Virheellinen yhteisperusteen liitos');
      const r = reason as SharedReason;
      if (
        node.title !== r.title ||
        node.confidence !== r.confidence ||
        node.impact !== Math.abs(r.influence) ||
        node.relation !== (r.influence > 0 ? 'support' : r.influence < 0 ? 'oppose' : 'neutral')
      )
        refuse('Yhteisperusteen lukitut arvot eivät vastaa kirjastoa');
      const key = JSON.stringify([node.sharedReasonId, node.parentId]);
      if (sharedUses.has(key)) refuse('Yhteisperuste on liitetty samaan kohteeseen kahdesti');
      sharedUses.add(key);
      if (nodes.some((n) => n.parentId === node.id))
        refuse('Lukitulla yhteisperusteella ei voi olla alisolmuja');
    }
  const contextualUses = new Set<string>();
  for (const node of nodes)
    if (node.reasonConceptId) {
      const concept = conceptsById.get(node.reasonConceptId);
      if (
        !concept ||
        node.sharedReasonId ||
        node.kind !== 'claim' ||
        !node.parentId ||
        node.title !== concept.title ||
        node.semanticType !== concept.semanticType
      )
        refuse('Virheellinen kontekstisidonnainen perustekäyttö');
      const key = JSON.stringify([node.reasonConceptId, node.parentId]);
      if (contextualUses.has(key)) refuse('Kontekstiperuste on liitetty samaan kohteeseen kahdesti');
      contextualUses.add(key);
    }
  for (const n of nodes) {
    if (!userIds.has(n.createdBy)) refuse('Solmun tekijä puuttuu');
    if (n.lastEditedBy && !userIds.has(n.lastEditedBy)) refuse('Solmun viimeinen muokkaaja puuttuu');
    if (n.parentId === null) continue;
    const parent = nodesById.get(n.parentId);
    if (!parent || n.relation === 'root') refuse('Solmun suhde tai vanhempi puuttuu');
    const par = parent as Node;
    if (n.kind === 'group') {
      if (
        mode !== 'decision' ||
        n.relation !== 'group' ||
        (par.kind !== 'group' && par.kind !== 'decision') ||
        n.impact !== 0 ||
        n.confidence !== 50 ||
        n.semanticType !== undefined ||
        n.constraintStatus !== undefined ||
        n.sharedReasonId ||
        n.reasonConceptId
      )
        refuse('Vaihtoehtoryhmän rakenne tai neutraaliarvot ovat virheelliset');
    } else if (n.kind === 'option') {
      if (
        mode !== 'decision' ||
        n.relation !== 'option' ||
        (par.kind !== 'decision' && par.kind !== 'group') ||
        n.sharedReasonId ||
        n.reasonConceptId
      )
        refuse('Päätösvaihtoehto on virheellisellä tasolla');
    } else if (
      n.kind !== 'claim' ||
      (n.relation !== 'support' && n.relation !== 'oppose' && n.relation !== 'neutral') ||
      par.kind === 'group'
    )
      refuse('Tavallisen argumentin tyyppi tai vanhempi on virheellinen');
  }
  const explored = new Set<string>();
  function check(id: string, visiting: Set<string>): void {
    if (visiting.has(id)) refuse('Solmuissa on sykli');
    if (explored.has(id)) return;
    visiting.add(id);
    const n = nodesById.get(id) as Node;
    if (n.parentId) check(n.parentId, visiting);
    visiting.delete(id);
    explored.add(id);
  }
  for (const n of nodes) check(n.id, new Set());

  const seenVotes = new Set<string>();
  const votes: Vote[] = (raw.votes as unknown[]).map((v) => {
    if (!isPlain(v)) refuse('Virheellinen arvio');
    const p = v as Plain;
    const id = str(p.id, 100, 'Arviotunniste', false);
    const nodeId = str(p.nodeId, 100, 'Arvion solmu', false);
    const userId = str(p.userId, 100, 'Arvion käyttäjä', false);
    const target = nodesById.get(nodeId);
    if (
      !target ||
      target.sharedReasonId ||
      !userIds.has(userId) ||
      seenVotes.has(JSON.stringify([nodeId, userId]))
    )
      refuse('Arvion kohde puuttuu tai arvio on päällekkäinen');
    const t = target as Node;
    // An unrated note keeps the reviews given before it was switched off (owner 2026-11-10).
    if (
      !truthAssessable(t) &&
      !isUnrated(t) &&
      t.kind !== 'option' &&
      !(nodeId === root.id && root.kind === 'decision')
    )
      refuse('Arvokäsitteelle tai reunaehdolle ei voi lisätä totuusarviota');
    seenVotes.add(JSON.stringify([nodeId, userId]));
    return {
      id,
      nodeId,
      userId,
      confidence: num(p.confidence, 0, 100, 'Arvio'),
      updatedAt: str(p.updatedAt, 50, 'Aikaleima'),
    };
  });
  const seenBallots = new Set<string>();
  const ballots: Ballot[] = (raw.ballots as unknown[]).map((b) => {
    if (!isPlain(b)) refuse('Virheellinen päätösääni');
    const p = b as Plain;
    const id = str(p.id, 100, 'Päätösäänen tunniste', false);
    const optionId = str(p.optionId, 100, 'Vaihtoehdon tunniste', false);
    const userId = str(p.userId, 100, 'Äänestäjän tunniste', false);
    if (
      nodesById.get(optionId)?.relation !== 'option' ||
      !userIds.has(userId) ||
      seenBallots.has(JSON.stringify([optionId, userId]))
    )
      refuse('Päätösääni on päällekkäinen tai sen kohde puuttuu');
    seenBallots.add(JSON.stringify([optionId, userId]));
    return {
      id,
      optionId,
      userId,
      preference: num(p.preference, 0, 100, 'Kannatus'),
      updatedAt: str(p.updatedAt, 50, 'Aikaleima'),
    };
  });

  let votingRound: VotingRound | null = null;
  if (raw.votingRound !== undefined && raw.votingRound !== null) {
    const r = raw.votingRound;
    if (
      !isPlain(r) ||
      (r.status !== 'open' && r.status !== 'closed') ||
      typeof r.anonymous !== 'boolean' ||
      typeof r.hideResults !== 'boolean' ||
      !includes(VOTE_WEIGHTINGS, r.weighting) ||
      !Array.isArray(r.optionIds) ||
      !isPlain(r.weightByUser)
    )
      refuse('Invalid voting round');
    const rp = r as Plain;
    const optionIds = (rp.optionIds as unknown[]).map((id) => str(id, 100, 'Voting option', false));
    if (
      new Set(optionIds).size !== optionIds.length ||
      optionIds.some((id) => nodesById.get(id)?.relation !== 'option')
    )
      refuse('Invalid round options');
    const weightByUser: Record<string, number> = {};
    for (const [id, value] of Object.entries(rp.weightByUser as Plain)) {
      if (!userIds.has(id) || isAiProfile(userById.get(id))) refuse('Invalid vote weight user');
      weightByUser[id] = num(value, 0, 1e12, 'Vote weight');
    }
    if (rp.status === 'open' && rp.closedAt !== null) refuse('Open round cannot be closed');
    if (rp.status === 'closed' && typeof rp.closedAt !== 'string') refuse('Closed round needs timestamp');
    votingRound = {
      id: str(rp.id, 100, 'Round ID', false),
      status: rp.status as VotingRound['status'],
      anonymous: rp.anonymous as boolean,
      hideResults: rp.hideResults as boolean,
      weighting: rp.weighting as VotingRound['weighting'],
      weightByUser,
      optionIds,
      openedAt: str(rp.openedAt, 50, 'Round opened', false),
      closedAt: rp.closedAt === null ? null : str(rp.closedAt, 50, 'Round closed', false),
    };
    if (ballots.some((b) => !optionIds.includes(b.optionId) || !Object.hasOwn(weightByUser, b.userId)))
      refuse('Ballot outside voting snapshot');
  }
  const voteAudit: VoteAuditEntry[] = ((raw.voteAudit as unknown[] | undefined) ?? []).map((a) => {
    if (!isPlain(a) || !['open', 'cast', 'update', 'retract', 'close'].includes(a.action as string))
      refuse('Invalid vote audit');
    const p = a as Plain;
    const userId = str(p.userId, 100, 'Audit actor', false);
    if (!userIds.has(userId)) refuse('Audit actor missing');
    const optionId = p.optionId === undefined ? null : str(p.optionId, 100, 'Audit option', false);
    if (optionId && !nodeIds.has(optionId)) refuse('Audit option missing');
    return {
      id: str(p.id, 100, 'Audit ID', false),
      roundId: str(p.roundId, 100, 'Audit round ID', false),
      action: p.action as VoteAuditEntry['action'],
      userId,
      at: str(p.at, 50, 'Audit timestamp', false),
      ...(optionId ? { optionId } : {}),
    };
  });
  if (
    voteAudit.length > 10000 ||
    (voteAudit.length && !votingRound) ||
    voteAudit.some((a) => a.roundId !== votingRound?.id) ||
    new Set(voteAudit.map((a) => a.id)).size !== voteAudit.length
  )
    refuse('Invalid voting audit trail');
  const voteHistory: VoteHistoryEntry[] = ((raw.voteHistory as unknown[] | undefined) ?? []).map((entry) => {
    if (
      !isPlain(entry) ||
      !isPlain(entry.round) ||
      !isPlain(entry.titleByOption) ||
      !Array.isArray(entry.ballots) ||
      !Array.isArray(entry.audit)
    )
      refuse('Invalid vote history');
    const e = entry as Plain;
    const r = e.round as Plain;
    if (
      r.status !== 'closed' ||
      typeof r.closedAt !== 'string' ||
      r.closedAt.length > 50 ||
      typeof r.anonymous !== 'boolean' ||
      typeof r.hideResults !== 'boolean' ||
      !includes(VOTE_WEIGHTINGS, r.weighting) ||
      !isPlain(r.weightByUser) ||
      !Array.isArray(r.optionIds) ||
      r.optionIds.length < 2 ||
      r.optionIds.length > 1000
    )
      refuse('Invalid historic voting round');
    const ids = (r.optionIds as unknown[]).map((id) => str(id, 100, 'History option id', false));
    if (new Set(ids).size !== ids.length) refuse('Duplicate historic option');
    const weightByUser: Record<string, number> = {};
    for (const [id, value] of Object.entries(r.weightByUser as Plain)) {
      if (!userIds.has(id) || isAiProfile(userById.get(id))) refuse('Invalid historic voter');
      weightByUser[id] = num(value, 0, 1e12, 'Historic vote weight');
    }
    const archiveBallots: Ballot[] = (e.ballots as unknown[]).map((b) => {
      if (
        !isPlain(b) ||
        !ids.includes(b.optionId as string) ||
        !Object.hasOwn(weightByUser, b.userId as string)
      )
        refuse('Invalid historic ballot');
      const p = b as Plain;
      return {
        id: str(p.id, 100, 'Historic ballot id', false),
        optionId: p.optionId as string,
        userId: p.userId as string,
        preference: num(p.preference, 0, 100, 'Historic preference'),
        updatedAt: str(p.updatedAt, 50, 'Historic ballot date', false),
      };
    });
    if (
      new Set(archiveBallots.map((b) => JSON.stringify([b.userId, b.optionId]))).size !==
      archiveBallots.length
    )
      refuse('Duplicate historic ballot');
    const historyAudit: VoteAuditEntry[] = (e.audit as unknown[]).map((a) => {
      if (
        !isPlain(a) ||
        !['open', 'cast', 'update', 'retract', 'close'].includes(a.action as string) ||
        !userIds.has(a.userId as string) ||
        a.roundId !== r.id ||
        (a.optionId !== undefined && !ids.includes(a.optionId as string))
      )
        refuse('Invalid historic audit event');
      const p = a as Plain;
      return {
        id: str(p.id, 100, 'Historic audit id', false),
        roundId: r.id as string,
        action: p.action as VoteAuditEntry['action'],
        userId: p.userId as string,
        at: str(p.at, 50, 'Historic audit date', false),
        ...(p.optionId ? { optionId: p.optionId as string } : {}),
      };
    });
    const titleByOption: Record<string, string> = {};
    const titles = e.titleByOption as Plain;
    for (const id of ids) titleByOption[id] = str(titles[id], 200, 'Historic option title', false);
    if (Object.keys(titles).length !== ids.length) refuse('Invalid historic option names');
    return {
      round: {
        id: str(r.id, 100, 'Historic round id', false),
        status: 'closed',
        anonymous: r.anonymous as boolean,
        hideResults: r.hideResults as boolean,
        weighting: r.weighting as VotingRound['weighting'],
        weightByUser,
        optionIds: ids,
        openedAt: str(r.openedAt, 50, 'Historic open date', false),
        closedAt: r.closedAt as string,
      },
      ballots: archiveBallots,
      audit: historyAudit,
      titleByOption,
    };
  });
  if (
    voteHistory.length > 20 ||
    new Set(voteHistory.map((h) => h.round.id)).size !== voteHistory.length ||
    voteHistory.some(
      (h) =>
        h.round.id === votingRound?.id ||
        h.audit.length > 10000 ||
        new Set(h.audit.map((a) => a.id)).size !== h.audit.length ||
        !h.audit.some((a) => a.action === 'close') ||
        !h.audit.some((a) => a.action === 'open')
    )
  )
    refuse('Invalid vote history');

  const commentIds = new Set<string>();
  const comments: Comment[] = (raw.comments as unknown[]).map((c) => {
    if (!isPlain(c)) refuse('Virheellinen kommentti');
    const p = c as Plain;
    const id = str(p.id, 100, 'Kommentin tunniste', false);
    const nodeId = str(p.nodeId, 100, 'Kommentin solmu', false);
    if (
      commentIds.has(id) ||
      !nodeIds.has(nodeId) ||
      (p.authorId !== undefined && !userIds.has(p.authorId as string))
    )
      refuse('Kommentin tunniste, tekijä tai solmu on virheellinen');
    commentIds.add(id);
    return {
      id,
      nodeId,
      body: str(p.body, 3000, 'Kommentti', false),
      authorName: str(p.authorName, 120, 'Kommentin tekijä'),
      ...(p.authorId !== undefined
        ? { authorId: str(p.authorId, 100, 'Kommentin tekijätunniste', false) }
        : {}),
      createdAt: str(p.createdAt, 50, 'Kommentin päiväys', false),
    };
  });
  const linkIds = new Set<string>();
  const endpoints = new Set<string>();
  const links: Link[] = (raw.links as unknown[]).map((l) => {
    if (!isPlain(l)) refuse('Virheellinen lisäyhteys');
    const p = l as Plain;
    const id = str(p.id, 100, 'Lisäyhteyden tunniste', false);
    const sourceId = str(p.sourceId, 100, 'Lisäyhteyden lähtö', false);
    const targetId = str(p.targetId, 100, 'Lisäyhteyden kohde', false);
    const pair = JSON.stringify([sourceId, targetId]);
    const source = nodesById.get(sourceId);
    const target = nodesById.get(targetId);
    if (
      linkIds.has(id) ||
      endpoints.has(pair) ||
      sourceId === targetId ||
      !source ||
      !target ||
      target.kind === 'group' ||
      source.parentId === targetId ||
      source.kind !== 'claim' ||
      (target.kind === 'decision' && target.parentId !== null) ||
      (p.relation !== 'support' && p.relation !== 'oppose')
    )
      refuse('Lisäyhteys on päällekkäinen tai virheellinen');
    linkIds.add(id);
    endpoints.add(pair);
    return {
      id,
      sourceId,
      targetId,
      relation: p.relation as Link['relation'],
      impact: num(p.impact, 0, 5, 'Lisäyhteyden vaikutus'),
      ...(p.createdBy ? { createdBy: str(p.createdBy, 100, 'Yhteyden tekijä', false) } : {}),
    };
  });
  if (links.some((l) => l.createdBy && !userIds.has(l.createdBy))) refuse('Lisäyhteyden tekijä puuttuu');
  if (graphHasCycle(nodes, links)) refuse('Lisäyhteys muodostaa syklin');
  const linkSet = new Set(links.map((l) => l.id));
  const edgeRatingPairs = new Set<string>();
  const edgeRatingIds = new Set<string>();
  const edgeAssessments: EdgeAssessment[] = (raw.edgeAssessments as unknown[]).map((a) => {
    if (!isPlain(a)) refuse('Virheellinen suhdearvio');
    const p = a as Plain;
    const id = str(p.id, 100, 'Suhdearvion ID', false);
    const userId = str(p.userId, 100, 'Suhdearvion käyttäjä', false);
    const subjectType = p.subjectType;
    const subjectId = str(p.subjectId, 100, 'Arvioitava suhde', false);
    const key = JSON.stringify([userId, subjectType, subjectId]);
    const source = nodesById.get(subjectId);
    if (
      !userIds.has(userId) ||
      edgeRatingIds.has(id) ||
      edgeRatingPairs.has(key) ||
      (subjectType !== 'primary' && subjectType !== 'secondary') ||
      (subjectType === 'primary'
        ? !source ||
          source.kind !== 'claim' ||
          !source.parentId ||
          source.relation === 'option' ||
          source.sharedReasonId
        : !linkSet.has(subjectId))
    )
      refuse('Suhdearvio on virheellinen tai päällekkäinen');
    const influence = num(p.influence, -5, 5, 'Suhdearvion vaikutus');
    if (!isInfluenceStep(influence)) refuse('Suhdearvion tarkkuus on 0,1');
    edgeRatingIds.add(id);
    edgeRatingPairs.add(key);
    return {
      id,
      userId,
      subjectType: subjectType as EdgeAssessment['subjectType'],
      subjectId,
      influence,
      fingerprint: str(p.fingerprint, 850, 'Suhdearvion yhteystunniste', false),
      updatedAt: str(p.updatedAt, 50, 'Suhdearvion aika', false),
    };
  });
  // Added 2026-11-10 (owner): "En arvioi (muut voivat)" per person and reason.
  if (raw.abstentions !== undefined && (!Array.isArray(raw.abstentions) || raw.abstentions.length > 10000))
    refuse('Virheellinen pidättäytymisten määrä');
  const abstentionPairs = new Set<string>();
  const abstentions: Abstention[] = ((raw.abstentions ?? []) as unknown[]).map((a) => {
    if (!isPlain(a)) refuse('Virheellinen pidättäytyminen');
    const p = a as Plain;
    const userId = str(p.userId, 100, 'Pidättäytyjä', false);
    const nodeId = str(p.nodeId, 100, 'Pidättäytymisen perustelu', false);
    const target = nodesById.get(nodeId);
    const key = JSON.stringify([userId, nodeId]);
    if (!userIds.has(userId) || !target || !target.parentId || abstentionPairs.has(key))
      refuse('Pidättäytyminen on virheellinen tai päällekkäinen');
    abstentionPairs.add(key);
    return { userId, nodeId, updatedAt: str(p.updatedAt, 50, 'Pidättäytymisen aika', false) };
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    id: str(raw.id, 100, 'Asiakirjan tunniste', false),
    title: str(raw.title, 200, 'Asiakirjan nimi', false),
    mode,
    theme: raw.theme as Project['theme'],
    settings: {
      voteWeighting: s.voteWeighting as Project['settings']['voteWeighting'],
      assessmentWeighting: s.assessmentWeighting as Project['settings']['assessmentWeighting'],
      shareSnapshotDate: s.shareSnapshotDate as string | null,
      scoring: s.scoring as Project['settings']['scoring'],
      showAuthors: s.showAuthors !== false,
    },
    users,
    nodes,
    ...(raw.sharedReasons === undefined ? {} : { sharedReasons }),
    ...(raw.reasonConcepts === undefined ? {} : { reasonConcepts }),
    votes,
    edgeAssessments,
    ...(abstentions.length ? { abstentions } : {}),
    ballots,
    votingRound,
    voteAudit,
    voteHistory,
    comments,
    links,
    layout: validateLayout(raw.layout, nodeIds),
    createdAt: str(raw.createdAt, 50, 'Luontiaika'),
    updatedAt: str(raw.updatedAt, 50, 'Muutosaika'),
  };
}
