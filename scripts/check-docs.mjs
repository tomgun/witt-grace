// must: every local Markdown link in the active docs resolves; every docs/spec/*.md is named in docs/spec/README.md;
//       no lens doc carries an unfilled "<fill at" placeholder
// test: scripts/check-docs.mjs (run by npm run check)
// red-against: a renamed spec file left unlisted, a link to a moved doc, a lens copied with its placeholders
// Exit codes: 0 ok · 1 a finding · 2 could not read the tree.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const SKIP = new Set(['node_modules', 'witt-grace-gpt-proto', 'tmp-ref', '_archive', 'dist', '.git']);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return name.endsWith('.md') ? [full] : [];
  });
}

const findings = [];
let files;
try {
  files = walk(root);
} catch (error) {
  console.error(`check-docs: cannot read the tree — ${error.message}`);
  process.exit(2);
}

let links = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^(?:https?:|mailto:|data:)/.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), decodeURIComponent(target));
    if (!resolved.startsWith(root + path.sep) || !existsSync(resolved)) {
      findings.push(`${path.relative(root, file)}: broken link ${match[1]}`);
    }
    links++;
  }
}

const specDir = path.join(root, 'docs', 'spec');
const specIndex = readFileSync(path.join(specDir, 'README.md'), 'utf8');
for (const name of readdirSync(specDir)) {
  if (!name.endsWith('.md') || name === 'README.md' || name === 'CHANGELOG.md') continue;
  if (!specIndex.includes(`\`${name}\``)) findings.push(`docs/spec/README.md does not list ${name}`);
}

const lensDir = path.join(root, 'docs', 'lenses');
for (const name of readdirSync(lensDir)) {
  const text = readFileSync(path.join(lensDir, name), 'utf8');
  if (text.includes('<fill at')) findings.push(`docs/lenses/${name}: unfilled project specifics`);
}

if (findings.length) {
  for (const finding of findings) console.error(`check-docs: ${finding}`);
  process.exit(1);
}
console.log(`check-docs: ok (${files.length} docs, ${links} local links)`);
