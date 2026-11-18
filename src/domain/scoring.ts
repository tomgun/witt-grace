// The recursive explanatory balance per viewpoint. Pure; evidence-v3-links reproduces the prototype engine exactly
// (tests/golden). What differs between scoring versions is one row of `SCORING_RULES` (model.ts): where a claim's base
// comes from, what strength a reason passes upward and how contributions combine; `settle` below applies the row.
// Missing, stale and excluded reviews stay null and mark the result incomplete; they are never zero.
import {
  argumentBalance,
  assertNever,
  SCORING_RULES,
  indexAssessable,
  isAiProfile,
  outOfScore,
  relationFingerprint,
  signedLinkImpact,
} from './model.ts';
import type { AssessmentWeighting, Node, Project, ScoringRule, SubjectType, User } from './model.ts';
import { childrenIndex, incomingIndex, nodeById, secondaryOverlapWarning, sharedReason } from './graph.ts';
import { abstentionExcusals, isExcused } from './reviews.ts';

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
  /** Anchored versions, a rated claim: the score is a credence (0–100 %), not a balance. */
  credence?: true;
  /** Nobody rated this claim: the score is the net of its reasons (anchored versions), not a credence. */
  net?: true;
  /** direct-reasons-v1, a rated claim with scored reasons: what the tree formula gives; `score` is the rating. */
  derived?: number;
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
  const counted: number[] = [];
  for (const record of records) {
    const power = assessmentPower(project, record.userId);
    if (power <= 0) continue;
    total += power;
    sum += power * (record[field] as number);
    effective++;
    counted.push(record[field] as number);
  }
  if (assessmentWeighting(project) === 'median')
    return { mean: median(counted), totalPower: total, effectiveVotes: effective };
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
  const votes = project.votes.filter(
    (v) =>
      v.nodeId === node.id && assessmentPower(project, v.userId) > 0 && !isExcused(project, node.id, v.userId)
  );
  const summary = weightedHumanMean(project, votes, 'confidence');
  return {
    base:
      summary.mean === null && assessmentWeighting(project) === 'structural' ? node.confidence : summary.mean,
    votesCount: votes.length,
    effectiveVotes: summary.effectiveVotes,
    totalPower: summary.totalPower,
  };
}
/** The lowest and highest of several figures and how many there were. */
export interface Spread {
  count: number;
  min: number;
  max: number;
}
const spreadOf = (values: number[]): Spread | null =>
  values.length ? { count: values.length, min: Math.min(...values), max: Math.max(...values) } : null;
/** The range of the credence ratings that enter a node's base: the same people `baseConfidence` counts. */
export function credenceSpread(project: Project, nodeId: string): Spread | null {
  return spreadOf(
    project.votes
      .filter(
        (v) =>
          v.nodeId === nodeId &&
          assessmentPower(project, v.userId) > 0 &&
          !isExcused(project, nodeId, v.userId)
      )
      .map((v) => v.confidence)
  );
}
const viewpointCache = new WeakMap<Project, Map<string, Scores>>();
/** The range of the counted people's own results for a node (each from their own reviews only, `evaluateAssessor`);
 * a person whose own result is missing there is left out, never read as zero. */
export function viewpointSpread(project: Project, nodeId: string): Spread | null {
  let viewpoints = viewpointCache.get(project);
  if (!viewpoints) {
    viewpoints = new Map();
    for (const user of project.users)
      if (assessmentPower(project, user.id) > 0) viewpoints.set(user.id, evaluateAssessor(project, user.id));
    viewpointCache.set(project, viewpoints);
  }
  const values: number[] = [];
  for (const scores of viewpoints.values()) {
    const score = scores.get(nodeId)?.score;
    if (score !== null && score !== undefined) values.push(score);
  }
  return spreadOf(values);
}

interface Weighted {
  value: number;
  weight: number;
  fingerprint?: string;
}
/** The middle value (the mean of the two middle ones for an even count); null for none. */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
function weighted(
  values: Weighted[] | undefined,
  useMedian = false
): {
  value: number | null;
  count: number;
  totalPower: number;
} {
  let count = 0;
  let totalPower = 0;
  let sum = 0;
  const counted: number[] = [];
  for (const item of values ?? [])
    if (item.weight > 0) {
      count++;
      totalPower += item.weight;
      sum += item.value * item.weight;
      counted.push(item.value);
    }
  if (useMedian) return { value: median(counted), count, totalPower };
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
const isThesis = (project: Project, node: Node): boolean =>
  project.mode === 'argument' && node.parentId === null && node.kind === 'claim';
/** An option or the argument-mode thesis: the node the balance is read from. */
const isTarget = (project: Project, node: Node): boolean => node.kind === 'option' || isThesis(project, node);
/** What a scored node passes to its parent as the strength of its relation. */
const passes = (rule: ScoringRule, result: NodeScore): number =>
  rule.strength(result.score as number, result.net === true);

interface Settled {
  base: number | null;
  score: number | null;
  credence?: true;
  net?: true;
  derived?: number;
}
/**
 * The one place a scoring version decides a node's base and result from what the visitor gathered.
 * `own` is the base before any reason acts: 50 for an option or an unassessed thesis, the locked shared value, the
 * (pooled or personal) credence, or null. `claimWithReasons`: a claim without a locked value that has a relation
 * which can score into it.
 */
function settle(
  rule: ScoringRule,
  input: {
    target: boolean;
    thesis: boolean;
    claimWithReasons: boolean;
    own: number | null;
    contributions: Contribution[];
    positive: number;
    negative: number;
  }
): Settled {
  const { target, thesis, claimWithReasons, own, contributions, positive, negative } = input;
  const scored = contributions.some((c) => !c.missing);
  let base: number | null;
  let net = false;
  let credence = false;
  switch (rule.claimBase) {
    case 'own':
      base = own;
      break;
    case 'neutral':
      // A claim with reasons is neutral once one of them scores, else it has no result.
      base = claimWithReasons ? (scored ? 50 : null) : own;
      break;
    case 'anchored':
      if (thesis && claimWithReasons) base = scored ? 50 : null;
      else if (own !== null) {
        base = own;
        credence = !target;
      } else {
        // Nobody rated it: it starts neutral and is the net of its reasons.
        base = claimWithReasons && scored ? 50 : null;
        net = base !== null;
      }
      break;
    default:
      return assertNever(rule.claimBase);
  }
  if (base === null) return { base, score: null };
  const combined = rule.combine(base, positive, negative, target);
  // direct: a rated claim passes its rating; the tree value is kept beside it.
  if (rule.direct && credence && scored) return { base, score: base, credence: true, derived: combined };
  if (net) return { base, score: combined, net: true };
  return credence ? { base, score: combined, credence: true } : { base, score: combined };
}

export function evaluate(project: Project): Scores {
  const rule = SCORING_RULES[project.settings.scoring];
  const mode = assessmentWeighting(project);
  const human = new Map<string, User>(project.users.filter((u) => !isAiProfile(u)).map((u) => [u.id, u]));
  const expectedHumanReviews = [...human.values()].filter(
    (user) => mode !== 'shares' || user.shares > 0
  ).length;
  const children = childrenIndex(project.nodes);
  const incoming = incomingIndex(project.links ?? []);
  const credence = new Map<string, Weighted[]>();
  const impacts = new Map<string, Weighted[]>();
  // People who chose "En arvioi" on a node or above it are neither counted nor expected there (owner 2026-11-10).
  const excusals = abstentionExcusals(project);
  const expectedAt = (nodeId: string): number => {
    let excused = 0;
    for (const userId of excusals.get(nodeId) ?? []) {
      const user = human.get(userId);
      if (user && (mode !== 'shares' || user.shares > 0)) excused++;
    }
    return expectedHumanReviews - excused;
  };
  for (const v of project.votes) {
    const user = human.get(v.userId);
    if (!user || (mode === 'shares' && user.shares === 0)) continue;
    if (excusals.get(v.nodeId)?.has(v.userId)) continue;
    if (!credence.has(v.nodeId)) credence.set(v.nodeId, []);
    credence.get(v.nodeId)?.push({ value: v.confidence, weight: mode === 'shares' ? user.shares : 1 });
  }
  if (mode !== 'structural')
    for (const a of project.edgeAssessments ?? []) {
      const user = human.get(a.userId);
      if (
        (a.subjectType !== 'primary' && a.subjectType !== 'secondary') ||
        !user ||
        (mode === 'shares' && user.shares === 0) ||
        (a.subjectType === 'primary' && excusals.get(a.subjectId)?.has(a.userId))
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
    const info = weighted(credence.get(node.id), mode === 'median');
    const shared = node.sharedReasonId ? sharedReason(project, node.sharedReasonId) : null;
    // In argument mode the thesis is a RESULT of its reasons: an unassessed thesis starts neutral (50), never from a
    // synthetic review. A deliberately entered root vote is respected.
    const thesis = isThesis(project, node);
    const claimWithReasons =
      rule.claimBase !== 'own' &&
      node.kind === 'claim' &&
      !shared &&
      hasReasons(node, children, incoming, project);
    // The own credence is not what the result rests on: a claim with reasons (neutral versions), the thesis with
    // reasons (anchored versions).
    const fromReasons = claimWithReasons && (rule.claimBase === 'neutral' || thesis);
    // anchored: a claim with reasons that nobody rated is derived from them; that is not a missing review.
    const unratedDerived = claimWithReasons && rule.claimBase === 'anchored' && info.count === 0;
    const own =
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
      !unratedDerived &&
      (thesis ? info.count > 0 && info.count < expectedAt(node.id) : info.count < expectedAt(node.id));
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
          const summary = weighted(current, mode === 'median');
          signed = summary.value;
          // Everyone who could rate this relation chose "En arvioi": it takes no part, like an unrated note.
          if (summary.count === 0 && expectedAt(child.id) <= 0 && excusals.has(child.id)) continue;
          if (summary.count < expectedAt(child.id)) incomplete = true;
        }
      }
      // Owner 2026-11-10: a deliberate "no effect" (influence 0) needs no credence under the reasons-decide versions.
      const settled = rule.claimBase !== 'own' && signed === 0;
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
      const magnitude = settled ? 0 : Math.abs(signed) * passes(rule, result);
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
        const summary = weighted(current, mode === 'median');
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
      const magnitude = Math.abs(signed) * passes(rule, result);
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
    const settled = settle(rule, {
      target: isTarget(project, node),
      thesis,
      claimWithReasons,
      own,
      contributions,
      positive,
      negative,
    });
    if ((fromReasons || unratedDerived) && settled.base === null) incomplete = true;
    const result: NodeScore = {
      score: settled.score,
      balance: argumentBalance(settled.score),
      base: settled.base,
      delta: settled.score === null || settled.base === null ? null : settled.score - settled.base,
      positive,
      negative,
      contributions,
      incomplete,
      ...(settled.credence ? { credence: true as const } : {}),
      ...(settled.net ? { net: true as const } : {}),
      ...(settled.derived !== undefined ? { derived: settled.derived } : {}),
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
  // Reviews inside a branch the person marked "no effect" count nowhere, here as in the shared result.
  const ownVotes = new Map(
    project.votes
      .filter((v) => v.userId === userId && !isExcused(project, v.nodeId, userId))
      .map((v) => [v.nodeId, v.confidence])
  );
  const rule = SCORING_RULES[project.settings.scoring];
  const ownEdges = new Map(
    (project.edgeAssessments ?? [])
      .filter(
        (a) =>
          a.userId === userId && !(a.subjectType === 'primary' && isExcused(project, a.subjectId, userId))
      )
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
    const thesis = isThesis(project, node);
    const vote = ownVotes.get(node.id);
    const claimWithReasons =
      rule.claimBase !== 'own' &&
      node.kind === 'claim' &&
      !shared &&
      hasReasons(node, children, incoming, project);
    const fromReasons = claimWithReasons && (rule.claimBase === 'neutral' || thesis);
    const unratedDerived = claimWithReasons && rule.claimBase === 'anchored' && vote === undefined;
    const own =
      node.kind === 'option'
        ? 50
        : shared
          ? shared.confidence
          : vote !== undefined
            ? vote
            : thesis
              ? 50
              : null;
    let positive = 0;
    let negative = 0;
    let incomplete = own === null && !fromReasons && !unratedDerived;
    const contributions: Contribution[] = [];
    for (const child of children.get(node.id) ?? []) {
      if (child.relation === 'option' || child.relation === 'group' || outOfScore(child)) continue;
      // The person chose "En arvioi" here: the reason takes no part in their viewpoint.
      if (isExcused(project, child.id, userId)) continue;
      const result = visit(child);
      const inherited = child.sharedReasonId ? sharedReason(project, child.sharedReasonId) : null;
      const edge = ownEdges.get('primary:' + child.id);
      const fingerprint = relationFingerprint(child, node, child.relation);
      const current = inherited || (!!edge && edge.fingerprint === fingerprint);
      const settled = rule.claimBase !== 'own' && !inherited && current && edge?.influence === 0;
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
      const magnitude = settled ? 0 : Math.abs(impact) * passes(rule, result);
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
      const magnitude = Math.abs(impact) * passes(rule, result);
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
    const settled = settle(rule, {
      target: isTarget(project, node),
      thesis,
      claimWithReasons,
      own,
      contributions,
      positive,
      negative,
    });
    if ((fromReasons || unratedDerived) && settled.base === null) incomplete = true;
    const answer: NodeScore = {
      score: settled.score,
      balance: argumentBalance(settled.score),
      base: settled.base,
      delta: settled.score === null || settled.base === null ? null : settled.score - settled.base,
      positive,
      negative,
      contributions,
      incomplete,
      ...(settled.credence ? { credence: true as const } : {}),
      ...(settled.net ? { net: true as const } : {}),
      ...(settled.derived !== undefined ? { derived: settled.derived } : {}),
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
  const rule = SCORING_RULES[project.settings.scoring];
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
      const withoutScore = rule.combine(result.base, positive, negative, isTarget(project, parent));
      // direct: under a rated claim the reason is measured against what the tree formula gives, not the rating.
      const currentScore = result.derived ?? result.score;
      const raw = currentScore - withoutScore;
      const delta = Math.abs(raw) < 1e-9 ? 0 : raw;
      effects.set(child.id, {
        childId: child.id,
        parentId: parent.id,
        delta,
        magnitude: Math.abs(delta),
        currentScore,
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
  const rule = SCORING_RULES[project.settings.scoring];
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
      const changedResult = evaluated.get(changedNode.id);
      // direct: a rated claim passes its rating whatever happens below it, so nothing changes above.
      if (changedResult?.derived !== undefined && changedResult.score !== null)
        afterScore = changedResult.score;
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
      const afterMagnitude = Math.abs(signed) * rule.strength(afterScore, changedResult?.net === true);
      const change = afterMagnitude - contribution.magnitude;
      const positive = Math.max(0, parentResult.positive + (signed > 0 ? change : 0));
      const negative = Math.max(0, parentResult.negative + (signed < 0 ? change : 0));
      afterScore = rule.combine(parentResult.base, positive, negative, isTarget(project, parent as Node));
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
