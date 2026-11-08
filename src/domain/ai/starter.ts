// The legacy `witt-ai-starter-v1` format: an unassessed claim tree (support/oppose only, no ratings, no people).
// The prototype still opens such a file through File → Avaa JSON and turns it into an argument-mode document owned
// by "Minä"; its prompt builder is kept for completeness (no dialog calls it). Ported from `src/ai-starter.js`.
import { createBlankProject } from '../project.ts';
import { ParseError, parseProject } from '../parse.ts';
import type { Node, Project } from '../model.ts';
import type { JsonSchema } from './jsonSchema.ts';
import { addChild } from './engine.ts';
import type { Clock } from './engine.ts';

export const STARTER_FORMAT = 'witt-ai-starter-v1' as const;

export interface StarterClaim {
  id: string;
  parentId: string;
  relation: 'support' | 'oppose';
  title: string;
  details: string;
}
export interface StarterDraft {
  format: typeof STARTER_FORMAT;
  title: string;
  root: { id: string; title: string; details: string };
  claims: StarterClaim[];
}

export const STARTER_SCHEMA: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'urn:witt:ai-starter:v1',
  title: 'WITT unassessed claim tree draft',
  description:
    'Unassessed claims only. Import creates editable WITT v4; no person, credence, relation-impact rating or ballot is accepted.',
  type: 'object',
  additionalProperties: false,
  required: ['format', 'title', 'root', 'claims'],
  properties: {
    format: { const: STARTER_FORMAT },
    title: { type: 'string', minLength: 1, maxLength: 200 },
    root: { $ref: '#/$defs/root' },
    claims: { type: 'array', maxItems: 200, items: { $ref: '#/$defs/claim' } },
  },
  $defs: {
    id: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,39}$' },
    title: { type: 'string', minLength: 1, maxLength: 200 },
    details: { type: 'string', maxLength: 3000 },
    root: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'title'],
      properties: {
        id: { $ref: '#/$defs/id' },
        title: { $ref: '#/$defs/title' },
        details: { $ref: '#/$defs/details' },
      },
    },
    claim: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'parentId', 'relation', 'title'],
      properties: {
        id: { $ref: '#/$defs/id' },
        parentId: { $ref: '#/$defs/id' },
        relation: { enum: ['support', 'oppose'] },
        title: { $ref: '#/$defs/title' },
        details: { $ref: '#/$defs/details' },
      },
    },
  },
};

type Plain = Record<string, unknown>;
const isObject = (x: unknown): x is Plain => !!x && typeof x === 'object' && !Array.isArray(x);
function refuse(message: string): never {
  throw new ParseError(message);
}
function fields(obj: unknown, allowed: readonly string[], required: readonly string[], what: string): Plain {
  if (!isObject(obj)) refuse(`${what}: object required`);
  const o = obj as Plain;
  for (const key of Object.keys(o)) if (!allowed.includes(key)) refuse(`${what}: prohibited property ${key}`);
  for (const key of required) if (!Object.hasOwn(o, key)) refuse(`${what}: missing ${key}`);
  return o;
}
function boundedText(x: unknown, max: number, what: string): string {
  if (typeof x !== 'string' || !x.trim() || x.length > max) refuse(`${what}: invalid text length`);
  return (x as string).trim();
}
function optionalText(x: unknown, what: string): string {
  if (x === undefined) return '';
  if (typeof x !== 'string' || x.length > 3000) refuse(`${what}: invalid details`);
  return x as string;
}
function id(x: unknown): string {
  if (typeof x !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(x)) refuse('Invalid claim ID');
  return x as string;
}

/** Parse an untrusted starter tree (JSON text or a parsed value); ParseError carries the prototype's messages. */
export function parseStarter(input: unknown): StarterDraft {
  const raw = fields(
    typeof input === 'string' ? JSON.parse(input) : input,
    ['format', 'title', 'root', 'claims'],
    ['format', 'title', 'root', 'claims'],
    'starter'
  );
  if (raw.format !== STARTER_FORMAT) refuse('Unknown starter format');
  const title = boundedText(raw.title, 200, 'title');
  const rawRoot = fields(raw.root, ['id', 'title', 'details'], ['id', 'title'], 'root');
  const root = {
    id: id(rawRoot.id),
    title: boundedText(rawRoot.title, 200, 'root title'),
    details: optionalText(rawRoot.details, 'root'),
  };
  if (!Array.isArray(raw.claims) || raw.claims.length > 200) refuse('At most 200 claims');
  const seen = new Set<string>([root.id]);
  const claims: StarterClaim[] = (raw.claims as unknown[]).map((item, i) => {
    const c = fields(
      item,
      ['id', 'parentId', 'relation', 'title', 'details'],
      ['id', 'parentId', 'relation', 'title'],
      `claim ${i + 1}`
    );
    const next = {
      id: id(c.id),
      parentId: id(c.parentId),
      relation: c.relation,
      title: boundedText(c.title, 200, 'claim title'),
      details: optionalText(c.details, 'claim'),
    };
    if (seen.has(next.id)) refuse('Duplicate claim ID');
    if (next.relation !== 'support' && next.relation !== 'oppose') refuse('Invalid relation');
    seen.add(next.id);
    return { ...next, relation: next.relation as 'support' | 'oppose' };
  });
  // Topological validation: arbitrary input order is fine; dangling parents and cycles fail.
  const completed = new Set<string>([root.id]);
  let pending = [...claims];
  while (pending.length) {
    const remainder = pending.filter((c) => !completed.has(c.parentId));
    pending.filter((c) => completed.has(c.parentId)).forEach((c) => completed.add(c.id));
    if (remainder.length === pending.length) refuse('Claim cycle or missing parent');
    pending = remainder;
  }
  return { format: STARTER_FORMAT, title, root, claims };
}

/** An argument-mode document owned by "Minä" with neutral placeholders (confidence 50, impact 0) and no ratings. */
export function starterToProject(input: unknown, clock: Clock): Project {
  const draft = parseStarter(input);
  const { now, newId } = clock;
  const userId = newId();
  const rootId = newId();
  const projectId = newId();
  const project = createBlankProject({ mode: 'argument', projectId, rootId, userId, now });
  project.title = draft.title;
  const root = project.nodes[0] as Node;
  root.title = draft.root.title;
  root.details = draft.root.details;
  root.confidence = 50;
  root.impact = 0;
  const ids = new Map<string, string>([[draft.root.id, root.id]]);
  let pending = [...draft.claims];
  while (pending.length) {
    const accepted = pending.filter((c) => ids.has(c.parentId));
    if (!accepted.length) throw new Error('Unresolvable claim parent');
    for (const c of accepted) {
      const n = addChild(project, ids.get(c.parentId) as string, c.relation, userId, newId);
      n.title = c.title;
      n.details = c.details;
      n.confidence = 50;
      n.impact = 0;
      ids.set(c.id, n.id);
    }
    pending = pending.filter((c) => !ids.has(c.id));
  }
  return parseProject(project);
}

const LANGUAGE_NAMES: Record<string, string> = {
  fi: 'Finnish',
  de: 'German',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  ru: 'Russian',
  'zh-Hans': 'Simplified Chinese',
  ja: 'Japanese',
  ko: 'Korean',
};

/** The legacy unassessed-tree prompt (not reachable from any dialog; kept because the format is still accepted). */
export function buildStarterPrompt(language = 'fi', topic = ''): string {
  const lang = LANGUAGE_NAMES[language] || 'English';
  const subject = (topic || '').trim().slice(0, 1000) || '(Choose a concrete claim / question)';
  const example = {
    format: STARTER_FORMAT,
    title: 'Example subject',
    root: { id: 'root', title: 'Should this be done?' },
    claims: [
      { id: 'reason1', parentId: 'root', relation: 'support', title: 'A supporting reason' },
      { id: 'objection1', parentId: 'root', relation: 'oppose', title: 'An objection' },
      { id: 'reply1', parentId: 'objection1', relation: 'oppose', title: 'A reply to the objection' },
    ],
  };
  return [
    'Create an EDITABLE, UNASSESSED argument tree for WITT / GRACE Method.',
    'Topic: ' + subject,
    'Write titles and details in ' +
      lang +
      '. Return ONLY a single valid JSON object, no Markdown or commentary.',
    'Required format: ' + STARTER_FORMAT + '. Follow the JSON shape of this example:',
    JSON.stringify(example, null, 2),
    'Use a single root claim and an array of nodes with unique ASCII IDs.',
    'Each child relation is support or oppose RELATIVE TO ITS IMMEDIATE PARENT; opposing an objection can support the root.',
    'Include substantial arguments and fair counterarguments, up to 200 claims; prefer 2-4 meaningful levels rather than filler.',
    'If a claim has multiple targets, place it once under its clearest primary parent; the user can add secondary links later.',
    'Optional details strings may describe reasoning, open questions and what evidence is needed.',
    'Do not invent studies, citations, quotes, numerical evidence or factual certainty. Mark unverified propositions as questions to check.',
    'NEVER include confidence, impact, probability, votes, edgeAssessments, ballots, people or scores. Humans do assessments later.',
    'Max title length 200 characters, details 3000. IDs must match /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.',
    'Return JSON that can be imported directly into WITT as ' + STARTER_FORMAT + '.',
  ].join('\n\n');
}
