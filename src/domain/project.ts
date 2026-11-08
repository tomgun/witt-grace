// Creating documents and nodes. Ids and timestamps come from the caller; nothing here reads a clock or randomness.
import { SCHEMA_VERSION, SCORING_VERSION } from './model.ts';
import type { Kind, Mode, Node, Position, Project, Stance, User } from './model.ts';
import { childrenOf, rootNode } from './graph.ts';

export interface NewNodeInput {
  id: string;
  parentId?: string | null;
  relation?: Stance;
  kind?: Kind;
  title?: string;
  confidence?: number;
  impact?: number;
  x?: number;
  y?: number;
  createdBy: string;
}
export function newNode({
  id,
  parentId = null,
  relation = 'root',
  kind = 'claim',
  title = 'Uusi argumentti',
  confidence = 100,
  impact = 3,
  x = 60,
  y = 130,
  createdBy,
}: NewNodeInput): Node {
  return {
    id,
    parentId,
    relation,
    kind,
    title,
    details: '',
    confidence,
    impact,
    collapsed: false,
    position: { x, y },
    createdBy,
  };
}

export interface CreateInput {
  mode?: Mode;
  projectId: string;
  rootId: string;
  userId: string;
  now: string;
  userName?: string;
}
export function createBlankProject({
  mode = 'argument',
  projectId,
  rootId,
  userId,
  now,
  userName = 'Minä',
}: CreateInput): Project {
  const user: User = { id: userId, name: userName, shares: 1, role: 'owner' };
  const node = newNode({
    id: rootId,
    kind: mode === 'decision' ? 'decision' : 'claim',
    title: mode === 'decision' ? 'Mikä on paras päätös?' : 'Mikä on tarkasteltava väite?',
    confidence: 50,
    createdBy: user.id,
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    id: projectId,
    title: 'Nimetön pohdinta',
    mode,
    theme: 'light',
    settings: {
      voteWeighting: 'equal',
      assessmentWeighting: 'equal',
      shareSnapshotDate: null,
      scoring: SCORING_VERSION,
      showAuthors: true,
    },
    users: [user],
    nodes: [node],
    sharedReasons: [],
    reasonConcepts: [],
    votes: [],
    edgeAssessments: [],
    ballots: [],
    votingRound: null,
    voteAudit: [],
    voteHistory: [],
    comments: [],
    links: [],
    layout: { fourWayOffsets: {} },
    createdAt: now,
    updatedAt: now,
  };
}

/** Deterministic side-by-side tidy tree. Returns new positions; the caller decides whether to apply them. */
export function autoLayoutPositions(project: Project): Map<string, Position> {
  const positions = new Map<string, Position>();
  const root = rootNode(project);
  if (!root) return positions;
  let leaf = 0;
  const spanY = 182;
  function walk(node: Node, depth: number): number {
    const children = childrenOf(project, node.id);
    const y = children.length
      ? children.map((c) => walk(c, depth + 1)).reduce((a, b) => a + b, 0) / children.length
      : leaf++ * spanY;
    positions.set(node.id, { x: 64 + depth * 340, y: 90 + y });
    return y;
  }
  walk(root, 0);
  return positions;
}
