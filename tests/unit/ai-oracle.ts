// Shared harness for the AI-flow parity tests: the frozen prototype modules loaded as the oracle, with the same
// deterministic ids and clock the golden generator uses. Not a test file (no `.test.ts`); imported by ai-*.test.ts.
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const FIXED = '2026-11-08T10:00:00.000Z';
const require = createRequire(import.meta.url);
export const protoDir = path.join(process.cwd(), 'witt-grace-gpt-proto');
const load = (file: string) => require(path.join(protoDir, 'src', file));

/* eslint-disable @typescript-eslint/no-explicit-any */
export const proto: {
  core: any;
  draft: any;
  starter: any;
  contributions: any;
  importValidation: any;
  projectSchema: any;
} = {
  core: load('core.js'),
  draft: load('ai-draft-v2.js'),
  starter: load('ai-starter.js'),
  contributions: load('contributions.js'),
  importValidation: load('import-validation.js'),
  projectSchema: load('project-import-schema.js'),
};
/* eslint-enable @typescript-eslint/no-explicit-any */
/** What the prototype's app.js hands to `ImportValidation.inspect`. */
export const protoDeps = {
  Core: proto.core,
  AIDraft: proto.draft,
  Contributions: proto.contributions,
  AIStarter: proto.starter,
  projectSchema: proto.projectSchema,
};

/** Counting ids: `prefix-0001`, `prefix-0002`, … — the same sequence on both sides of a parity assertion. */
export function countingIds(prefix = 'id'): () => string {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(4, '0')}`;
}
export const clock = (prefix = 'id') => ({ now: FIXED, newId: countingIds(prefix) });

const realRandomUUID = globalThis.crypto.randomUUID.bind(globalThis.crypto);
const RealDate = Date;
/** Run `fn` with the prototype's `crypto.randomUUID()` and `new Date()` replaced by counting ids and the fixed clock. */
export function withOracle<T>(fn: () => T, prefix = 'id'): T {
  const next = countingIds(prefix);
  globalThis.crypto.randomUUID = next as typeof globalThis.crypto.randomUUID;
  globalThis.Date = class extends RealDate {
    constructor(...args: unknown[]) {
      // @ts-expect-error forwarding the variadic Date constructor
      super(...(args.length ? args : [FIXED]));
    }
    static override now() {
      return new RealDate(FIXED).getTime();
    }
  } as DateConstructor;
  try {
    return fn();
  } finally {
    globalThis.crypto.randomUUID = realRandomUUID;
    globalThis.Date = RealDate;
  }
}

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
export const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

/** Every schema-v8 example document of the prototype, by file name. */
export function exampleProjects(): { name: string; raw: Record<string, unknown> }[] {
  const dir = path.join(protoDir, 'examples');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.witt.json'))
    .sort()
    .map((name) => ({ name, raw: readJson(path.join(dir, name)) as Record<string, unknown> }))
    .filter(({ raw }) => raw.schemaVersion === 8);
}
/** The three `witt-ai-draft-v2` files the prototype ships (one example, two test fixtures). */
export function draftFiles(): { name: string; raw: Record<string, unknown> }[] {
  return [
    path.join(protoDir, 'examples', 'ai-draft-with-ratings-dev14.witt.json'),
    path.join(protoDir, 'tests', 'fixtures', 'ai-gnu-linux-rated.witt.json'),
    path.join(protoDir, 'tests', 'fixtures', 'gnu-linux-ai-draft-dev16.json'),
  ].map((file) => ({ name: path.basename(file), raw: readJson(file) as Record<string, unknown> }));
}

/** Both sides must throw, with the same message. */
export function sameError(ours: () => unknown, theirs: () => unknown, label = ''): string {
  let ourMessage: string | null = null;
  let theirMessage: string | null = null;
  try {
    ours();
  } catch (e) {
    ourMessage = (e as Error).message;
  }
  try {
    theirs();
  } catch (e) {
    theirMessage = (e as Error).message;
  }
  if (theirMessage === null) throw new Error(`${label}: the prototype did not throw`);
  if (ourMessage !== theirMessage)
    throw new Error(
      `${label}: ours threw ${JSON.stringify(ourMessage)}, prototype ${JSON.stringify(theirMessage)}`
    );
  return theirMessage;
}
