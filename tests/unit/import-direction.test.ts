/**
 * must: src/domain depends on nothing but other domain modules (so it runs unchanged in Node, a browser and a peer)
 * test: import-direction.test.ts
 * red-against: a domain module importing node:fs, ../lib/storage.ts or a package (even if the ESLint config were loosened)
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}
const IMPORT = /^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm;

test('every import in src/domain is a relative .ts path inside src/domain', () => {
  const files = walk('src/domain');
  assert.ok(files.length >= 5, 'domain modules exist');
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT)) {
      const spec = match[1] ?? '';
      assert.ok(spec.startsWith('.') && spec.endsWith('.ts'), `${file} imports ${spec}`);
      const resolved = path.normalize(path.join(path.dirname(file), spec));
      assert.ok(
        resolved.startsWith(path.normalize('src/domain/')),
        `${file} reaches outside src/domain via ${spec}`
      );
    }
  }
});

test('src/domain never touches the DOM, storage, the clock or randomness', () => {
  for (const file of walk('src/domain')) {
    const source = readFileSync(file, 'utf8');
    for (const forbidden of [
      /\b(?:window|document|navigator)\.[A-Za-z]/,
      /\blocalStorage\b/,
      /\bfetch\(/,
      /\bDate\.now\(/,
      /\bnew Date\(/,
      /\brandomUUID\b/,
    ])
      assert.ok(!forbidden.test(source), `${file} uses ${forbidden}`);
  }
});
