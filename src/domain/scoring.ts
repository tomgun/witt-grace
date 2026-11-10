// evidence-v3-links: the recursive explanatory balance per viewpoint. Pure; reproduces the prototype engine exactly
// (tests/golden). evidence-v4-reasons (owner 2026-11-09) differs in one rule: a claim with reasons starts neutral (50)
// and its own credence is not used; with none of them assessed yet it has no result. logodds-reasons-v1 keeps that rule
// and combines the reasons on the log-odds scale instead of the capped sum (`scoreFor` in model.ts). Missing, stale and excluded reviews stay null and mark the result incomplete; they are never zero.
import {
  argumentBalance,
  evidenceFactor,
  scoreFor,
  SCORING_V3,
  indexAssessable,
  isAiProfile,
  outOfScore,
  relationFingerprint,
  signedLinkImpact,
} from './model.ts';
import type { AssessmentWeighting, Node, Project, SubjectType, User } from './model.ts';
import { childrenIndex, incomingIndex, nodeById, secondaryOverlapWarning, sharedReason } from './graph.ts';

export interface Contribution {
  id: string;
  subjectType: SubjectType;
  /** The source node for a secondary link; the child itself for a primary relation. */
  sourceId: string;
  title: string;
  /** Signed influence that entered the sum, or null when the relation is missing or stale. */
  impact: number | null;
  /** The source's own internal score, or null when it could not be computed. */
  strength: number | null;
  magnitude: number | null;
  missing: boolean;
  /** Locked shared-reason influence was used instead of a personal review. */
  shared?: boolean;
  overlapWarning?: boolean;
}
export interface NodeScore {
  /** Internal 0..100, or null when the base is missing. */
  score: number | null;
  /** Public −100..+100 (`2·score − 100`), or null. */
  balance: number | null;
  base: number | null;
  delta: number | null;
  positive: number;
  negative: number;
  contributions: Contribution[];
  incomplete: boolean;
  /** Human reviews that entered the base (collective viewpoint only). */
  votesCount?: number;
  totalPower?: number;
}
export type Scores = Map<string, NodeScore>;

export const assessmentWeighting = (project: Project): AssessmentWeighting =>
  project.settings?.assessmentWeighting ?? 'equal';
export function assessmentPower(project: Project, userId: string): number {
  const user = project.users.find((u) => u.id === userId);
  if (!user || isAiProfile(user)) return 0;
  return assessmentWeighting(project) === 'shares' ? user.shares : 1;
}
export function weightedHumanMean<T extends { userId: string }>(
  project: Project,
  records: T[],
  field: keyof T & string
): { mean: number | null; totalPower: number; effectiveVotes: number } {
  let total = 0;
  let sum = 0;
  let effective = 0;
  for (const record of records) {
    const power = assessmentPower(project, record.userId);
    if (power <= 0) continue;
    total += power;
    sum += power * (record[field] as number);
    effective++;
  }
  return { mean: total > 0 ? sum / total : null, totalPower: total, effectiveVotes: effective };
}
/** The collective base credence of a node before its reasons act on it. */
export function baseConfidence(
  project: Project,
  node: Node
): { base: number | null; votesCount: number; effectiveVotes: number; totalPower: number } {
  if (node.kind === 'group' || node.kind === 'decision')
    return { base: null, votesCount: 0, effectiveVotes: 0, totalPower: 0 };
  if (node.kind === 'option') return { base: 50, votesCount: 0, effectiveVotes: 0, totalPower: 0 };
  const votes = project.votes.filter((v) => v.nodeId === node.id && assessmentPower(project, v.userId) > 0);
  const summary = weightedHumanMean(project, votes, 'confidence');
  return {
    base:
      summary.mean === null && assessmentWeighting(project) === 'structural' ? node.confidence : summary.mean,
    votesCount: votes.length,
    effectiveVotes: summary.effectiveVotes,
    totalPower: summary.totalPower,
  };
}

interface Weighted {
  value: number;
  weight: number;
  fingerprint?: string;
}
function weighted(values: Weighted[] | undefined): {
  value: number | null;
  count: number;
  totalPower: number;
} {
  let count = 0;
  let totalPower = 0;
  let sum = 0;
  for (const item of values ?? [])
    if (item.weight > 0) {
      count++;
      totalPower += item.weight;
      sum += item.value * item.weight;
    }
  return { value: totalPower ? sum / totalPower : null, count, totalPower };
}
const empty = (incomplete: boolean, collective: boolean): NodeScore => ({
  score: null,
  balance: null,
  base: null,
  delta: null,
  positive: 0,
  negative: 0,
  contributions: [],
  incomplete,
  ...(collective ? { votesCount: 0, totalPower: 0 } : {}),
});

/**
 * Collective viewpoint: `equal` (default) and `shares` pool CURRENT human reviews; `structural` previews the authored
 * template values. AI profiles never enter. Each node's internal score feeds its parent as strength = score / 100.
 */
/** True when the node has a relation that can score into it: a primary reason or a secondary link from a claim. */
function hasReasons(
  node: Node,
  children: Map<string | null, Node[]>,
  incoming: Map<string, { sourceId: string }[]>,
  project: Project
): boolean {
  if (
    (children.get(node.id) ?? []).some(
      (c) => c.relation !== 'option' && c.relation !== 'group' && !outOfScore(c)
    )
  )
    return true;
  return (incoming.get(node.id) ?? []).some((link) => {
    const source = nodeById(project, link.sourceId);
    return !!source && !outOfScore(source);
  });
}
/** evidence-v4-reasons and logodds-reasons-v1: the base of a claim with reasons is neutral once one of them scores, else there is no result. */
const reasonsBase = (contributions: Contribution[]): number | null =>
  contributions.some((c) => !c.missing) ? 50 : null;

export function evaluate(project: Project): Scores {
  const reasonsDecide = project.settings.scoring !== SCORING_V3;
  const combine = scoreFor(project.settings.scoring);
  const mode = assessmentWeighting(project);
  const human = new Map<string, User>(project.users.filter((u) => !isAiProfile(u)).map((u) => [u.id, u]));
  const expectedHumanReviews = [...human.values()].filter(
    (user) => mode !== 'shares' || user.shares > 0
  ).length;
  const children = childrenIndex(project.nodes);
  const incoming = incomingIndex(project.links ?? []);
  const credence = new Map<string, Weighted[]>();
  const impacts = new Map<string, Weighted[]>();
  for (const v of project.votes) {
    const user = human.get(v.userId);
    if (!user || (mode === 'shares' && user.shares === 0)) continue;
    if (!credence.has(v.nodeId)) credence.set(v.nodeId, []);
    credence.get(v.nodeId)?.push({ value: v.confidence, weight: mode === 'shares' ? user.shares : 1 });
  }
  if (mode !== 'structural')
    for (const a of project.edgeAssessments ?? []) {
      const user = human.get(a.userId);
      if (
        (a.subjectType !== 'primary' && a.subjectType !== 'secondary') ||
        !user ||
        (mode === 'shares' && user.shares === 0)
      )
        continue;
      const key = a.subjectType + ':' + a.subjectId;
      if (!impacts.has(key)) impacts.set(key, []);
      impacts.get(key)?.push({
        value: a.influence,
        weight: mode === 'shares' ? user.shares : 1,
        fingerprint: a.fingerprint,
      });
    }
  const memo: Scores = new Map();
  const active = new Set<string>();
  function visit(node: Node): NodeScore {
    const done = memo.get(node.id);
    if (done) return done;
    if (active.has(node.id)) throw new Error('Argumenttipuussa on sykli');
    active.add(node.id);
    if (node.kind === 'group' || node.kind === 'decision') {
      const result = empty(false, true);
      memo.set(node.id, result);
      active.delete(node.id);
      return result;
    }
    const info = weighted(credence.get(node.id));
    const shared = node.sharedReasonId ? sharedReason(project, node.sharedReasonId) : null;
    // In argument mode the thesis is a RESULT of its reasons: an unassessed thesis starts neutral (50), never from a
    // synthetic review. A deliberately entered root vote is respected.
    const thesis = project.mode === 'argument' && node.parentId === null && node.kind === 'claim';
    const fromReasons =
      reasonsDecide && node.kind === 'claim' && !shared && hasReasons(node, children, incoming, project);
    let baseValue =
      node.kind === 'option'
        ? 50
        : shared
          ? shared.confidence
          : info.value !== null
            ? info.value
            : mode === 'structural'
              ? node.confidence
              : thesis
                ? 50
                : null;
    let positive = 0;
    let negative = 0;
    let incomplete =
      mode !== 'structural' &&
      !shared &&
      node.kind !== 'option' &&
      !fromReasons &&
      (thesis ? info.count > 0 && info.count < expectedHumanReviews : info.count < expectedHumanReviews);
    const contributions: Contribution[] = [];
    for (const child of children.get(node.id) ?? []) {
      if (child.relation === 'option' || child.relation === 'group' || outOfScore(child)) continue;
      const result = visit(child);
      let signed: number | null;
      if (mode === 'structural')
        signed =
          child.relation === 'oppose' ? -child.impact : child.relation === 'neutral' ? 0 : child.impact;
      else {
        const concept = child.sharedReasonId ? sharedReason(project, child.sharedReasonId) : null;
        if (concept) signed = concept.influence;
        else {
          const expected = relationFingerprint(child, node, child.relation);
          const current = (impacts.get('primary:' + child.id) ?? []).filter(
            (row) => row.fingerprint === expected
          );
          const summary = weighted(current);
          signed = summary.value;
          if (summary.count < expectedHumanReviews) incomplete = true;
        }
      }
      // Owner 2026-11-10: a deliberate "no effect" (influence 0) needs no credence under the reasons-decide versions.
      const settled = reasonsDecide && signed === 0;
      const missing = signed === null || (result.score === null && !settled);
      if (mode !== 'structural') incomplete ||= missing || (!settled && Boolean(result.incomplete));
      if (missing || signed === null) {
        contributions.push({
          id: child.id,
          subjectType: 'primary',
          sourceId: child.id,
          title: child.title,
          impact: null,
          strength: result.score,
          magnitude: null,
          missing: true,
        });
        continue;
      }
      const magnitude = settled ? 0 : Math.abs(signed) * evidenceFactor(result.score as number);
      if (signed > 0) positive += magnitude;
      if (signed < 0) negative += magnitude;
      contributions.push({
        id: child.id,
        subjectType: 'primary',
        sourceId: child.id,
        title: child.title,
        impact: signed,
        strength: result.score,
        magnitude,
        missing: false,
      });
    }
    // Secondary links reuse the source's ONE computed credibility but are rated independently per edge.
    for (const link of incoming.get(node.id) ?? []) {
      const source = nodeById(project, link.sourceId);
      if (!source || outOfScore(source)) continue;
      const result = visit(source);
      let signed: number | null = mode === 'structural' ? signedLinkImpact(link) : null;
      if (mode !== 'structural') {
        const expected = relationFingerprint(source, node, link.relation);
        const current = (impacts.get('secondary:' + link.id) ?? []).filter(
          (row) => row.fingerprint === expected
        );
        const summary = weighted(current);
        signed = summary.value;
        if (summary.count < expectedHumanReviews) incomplete = true;
      }
      const missing = signed === null || result.score === null;
      incomplete ||= missing || Boolean(result.incomplete);
      if (missing || signed === null || result.score === null) {
        contributions.push({
          id: link.id,
          subjectType: 'secondary',
          sourceId: source.id,
          title: source.title,
          impact: null,
          strength: result.score,
          magnitude: null,
          missing: true,
        });
        continue;
      }
      const magnitude = Math.abs(signed) * evidenceFactor(result.score);
      if (signed > 0) positive += magnitude;
      if (signed < 0) negative += magnitude;
      contributions.push({
        id: link.id,
        subjectType: 'secondary',
        sourceId: source.id,
        title: source.title,
        impact: signed,
        strength: result.score,
        magnitude,
        missing: false,
        overlapWarning: secondaryOverlapWarning(project, link),
      });
    }
    if (fromReasons) {
      baseValue = reasonsBase(contributions);
      if (baseValue === null) incomplete = true;
    }
    const score = baseValue === null ? null : combine(baseValue, positive, negative);
    const result: NodeScore = {
      score,
      balance: argumentBalance(score),
      base: baseValue,
      delta: score === null || baseValue === null ? null : score - baseValue,
      positive,
      negative,
      contributions,
      incomplete,
      votesCount: info.count,
      totalPower: info.totalPower,
    };
    memo.set(node.id, result);
    active.delete(node.id);
    return result;
  }
  for (const node of project.nodes) visit(node);
  return memo;
}

/** One person's viewpoint: only their own current reviews; nothing is borrowed from the group or the authored template. */
export function evaluateAssessor(project: Project, userId: string): Scores {
  if (!project.users.some((u) => u.id === userId)) throw new Error('Unknown assessor');
  const memo: Scores = new Map();
  const visiting = new Set<string>();
  const children = childrenIndex(project.nodes);
  const incoming = incomingIndex(project.links ?? []);
  const ownVotes = new Map(
    project.votes.filter((v) => v.userId === userId).map((v) => [v.nodeId, v.confidence])
  );
  const reasonsDecide = project.settings.scoring !== SCORING_V3;
  const combine = scoreFor(project.settings.scoring);
  const ownEdges = new Map(
    (project.edgeAssessments ?? [])
      .filter((a) => a.userId === userId)
      .map((a) => [a.subjectType + ':' + a.subjectId, a])
  );
  function visit(node: Node): NodeScore {
    const done = memo.get(node.id);
    if (done) return done;
    if (visiting.has(node.id)) throw new Error('Cyclic argument graph');
    visiting.add(node.id);
    if (node.kind === 'group') {
      const result = empty(false, false);
      memo.set(node.id, result);
      visiting.delete(node.id);
      return result;
    }
    const shared = node.sharedReasonId ? sharedReason(project, node.sharedReasonId) : null;
    const thesis = project.mode === 'argument' && node.parentId === null && node.kind === 'claim';
    const own = ownVotes.get(node.id);
    const fromReasons =
      reasonsDecide && node.kind === 'claim' && !shared && hasReasons(node, children, incoming, project);
    let base =
      node.kind === 'option' ? 50 : shared ? shared.confidence : own !== undefined ? own : thesis ? 50 : null;
    let positive = 0;
    let negative = 0;
    let incomplete = base === null && !fromReasons;
    const contributions: Contribution[] = [];
    for (const child of children.get(node.id) ?? []) {
      if (child.relation === 'option' || child.relation === 'group' || outOfScore(child)) continue;
      const result = visit(child);
      const inherited = child.sharedReasonId ? sharedReason(project, child.sharedReasonId) : null;
      const edge = ownEdges.get('primary:' + child.id);
      const fingerprint = relationFingerprint(child, node, child.relation);
      const current = inherited || (!!edge && edge.fingerprint === fingerprint);
      const settled = reasonsDecide && !inherited && current && edge?.influence === 0;
      if (!current || (result.score === null && !settled)) {
        incomplete = true;
        contributions.push({
          id: child.id,
          subjectType: 'primary',
          sourceId: child.id,
          title: child.title,
          impact: null,
          strength: result.score,
          magnitude: null,
          missing: true,
        });
        continue;
      }
      const impact = inherited ? inherited.influence : (edge as { influence: number }).influence;
      const magnitude = settled ? 0 : Math.abs(impact) * evidenceFactor(result.score as number);
      if (impact >= 0) positive += magnitude;
      else negative += magnitude;
      if (!settled && result.incomplete) incomplete = true;
      contributions.push({
        id: child.id,
        subjectType: 'primary',
        sourceId: child.id,
        title: child.title,
        impact,
        strength: result.score,
        magnitude,
        missing: false,
        shared: !!inherited,
      });
    }
    for (const link of incoming.get(node.id) ?? []) {
      const source = nodeById(project, link.sourceId);
      if (!source || outOfScore(source)) continue;
      const result = visit(source);
      const edge = ownEdges.get('secondary:' + link.id);
      const fingerprint = relationFingerprint(source, node, link.relation);
      if (result.score === null || !edge || edge.fingerprint !== fingerprint) {
        incomplete = true;
        contributions.push({
          id: link.id,
          subjectType: 'secondary',
          sourceId: source.id,
          title: source.title,
          impact: null,
          strength: result.score,
          magnitude: null,
          missing: true,
        });
        continue;
      }
      const impact = edge.influence;
      const magnitude = Math.abs(impact) * evidenceFactor(result.score);
      if (impact > 0) positive += magnitude;
      if (impact < 0) negative += magnitude;
      incomplete ||= Boolean(result.incomplete);
      contributions.push({
        id: link.id,
        subjectType: 'secondary',
        sourceId: source.id,
        title: source.title,
        impact,
        strength: result.score,
        magnitude,
        missing: false,
        overlapWarning: secondaryOverlapWarning(project, link),
      });
    }
    if (fromReasons) {
      base = reasonsBase(contributions);
      if (base === null) incomplete = true;
    }
    const score = base === null ? null : combine(base, positive, negative);
    const answer: NodeScore = {
      score,
      balance: argumentBalance(score),
      base,
      delta: score === null || base === null ? null : score - base,
      positive,
      negative,
      contributions,
      incomplete,
    };
    memo.set(node.id, answer);
    visiting.delete(node.id);
    return answer;
  }
  for (const node of project.nodes) visit(node);
  return memo;
}

export interface MarginalEffect {
  childId: string;
  parentId: string;
  delta: number;
  magnitude: number;
  currentScore: number;
  withoutScore: number;
  provisional: boolean;
}
/** Leave-one-relation-out change in the parent's internal score: a local counterfactual, not a decomposition. */
export function marginalIndexEffects(project: Project, evaluated: Scores): Map<string, MarginalEffect> {
  const combine = scoreFor(project.settings.scoring);
  const effects = new Map<string, MarginalEffect>();
  for (const parent of project.nodes) {
    if (!indexAssessable(parent)) continue;
    const result = evaluated.get(parent.id);
    if (!result || result.score === null || result.base === null) continue;
    if (!Number.isFinite(result.positive) || !Number.isFinite(result.negative)) continue;
    for (const child of result.contributions) {
      if (child.missing || child.magnitude === null || child.magnitude <= 0 || child.impact === null)
        continue;
      const signed = child.impact;
      if (!Number.isFinite(signed) || signed === 0) continue;
      const positive = Math.max(0, result.positive - (signed > 0 ? child.magnitude : 0));
      const negative = Math.max(0, result.negative - (signed < 0 ? child.magnitude : 0));
      const withoutScore = combine(result.base, positive, negative);
      const raw = result.score - withoutScore;
      const delta = Math.abs(raw) < 1e-9 ? 0 : raw;
      effects.set(child.id, {
        childId: child.id,
        parentId: parent.id,
        delta,
        magnitude: Math.abs(delta),
        currentScore: result.score,
        withoutScore,
        provisional: Boolean(result.incomplete),
      });
    }
  }
  return effects;
}
export interface TargetEffect extends MarginalEffect {
  localDelta: number;
  localMagnitude: number;
  localCurrentScore: number;
  localWithoutScore: number;
  targetId: string;
  targetCurrentScore: number;
  targetWithoutScore: number;
}
/** The same counterfactual propagated exactly up to the thesis or the nearest option, respecting clamps. */
export function marginalTargetEffects(
  project: Project,
  evaluated: Scores,
  localEffects: Map<string, MarginalEffect> = marginalIndexEffects(project, evaluated)
): Map<string, TargetEffect> {
  const combine = scoreFor(project.settings.scoring);
  const result = new Map<string, TargetEffect>();
  const byId = new Map(project.nodes.map((n) => [n.id, n]));
  for (const effect of localEffects.values()) {
    let currentId = effect.parentId;
    let afterScore = effect.withoutScore;
    let provisional = effect.provisional;
    let valid = true;
    const seen = new Set<string>();
    for (;;) {
      if (seen.has(currentId)) {
        valid = false;
        break;
      }
      seen.add(currentId);
      const changedNode = byId.get(currentId);
      if (!changedNode) {
        valid = false;
        break;
      }
      if (changedNode.parentId === null || changedNode.relation === 'option') break;
      if (outOfScore(changedNode)) {
        valid = false;
        break;
      }
      const parent = byId.get(changedNode.parentId);
      if (!indexAssessable(parent)) {
        valid = false;
        break;
      }
      const parentResult = evaluated.get((parent as Node).id);
      const contribution = parentResult?.contributions.find((c) => c.id === changedNode.id);
      if (
        !parentResult ||
        parentResult.base === null ||
        !Number.isFinite(parentResult.positive) ||
        !Number.isFinite(parentResult.negative) ||
        !contribution ||
        contribution.missing ||
        contribution.magnitude === null ||
        contribution.impact === null
      ) {
        valid = false;
        break;
      }
      const signed = contribution.impact;
      if (!Number.isFinite(signed) || signed === 0) {
        valid = false;
        break;
      }
      const afterMagnitude = Math.abs(signed) * evidenceFactor(afterScore);
      const change = afterMagnitude - contribution.magnitude;
      const positive = Math.max(0, parentResult.positive + (signed > 0 ? change : 0));
      const negative = Math.max(0, parentResult.negative + (signed < 0 ? change : 0));
      afterScore = combine(parentResult.base, positive, negative);
      provisional ||= Boolean(parentResult.incomplete);
      currentId = (parent as Node).id;
    }
    const target = evaluated.get(currentId);
    if (!valid || !target || target.score === null || !Number.isFinite(afterScore)) continue;
    const raw = target.score - afterScore;
    const delta = Math.abs(raw) < 1e-9 ? 0 : raw;
    result.set(effect.childId, {
      ...effect,
      localDelta: effect.delta,
      localMagnitude: effect.magnitude,
      localCurrentScore: effect.currentScore,
      localWithoutScore: effect.withoutScore,
      targetId: currentId,
      targetCurrentScore: target.score,
      targetWithoutScore: afterScore,
      delta,
      magnitude: Math.abs(delta),
      provisional,
    });
  }
  return result;
}
