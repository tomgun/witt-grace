// PreToolUse (Edit|Write): refuse edits to the frozen prototype, to a locked spec whose changelog is untouched,
// to the lockfile and to environment files. Exit 2 blocks the call and shows the reason to Claude; exit 0 allows it.
// Fails closed: if git cannot answer whether the spec changelog changed, the spec edit is refused.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const input = JSON.parse(
  await new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data || '{}'));
  })
);
const file = input?.tool_input?.file_path;
if (typeof file !== 'string') process.exit(0);
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const rel = path.relative(root, path.resolve(root, file)).replaceAll('\\', '/');
const base = path.basename(rel);

function block(reason) {
  console.error(`protect-files: ${rel} is protected — ${reason}`);
  process.exit(2);
}

if (rel.startsWith('witt-grace-gpt-proto/')) {
  block(
    'the prototype is frozen (docs/PROTOTYPE_REFERENCE.md); an unavoidable path fix is made by hand and noted in CHANGELOG.md'
  );
}
if (/^\.env(\..+)?$/.test(base) && !base.endsWith('.example')) {
  block('environment files hold secrets; edit .env by hand and change .env.example for the documented shape');
}
if (base === 'package-lock.json') block('the lockfile only changes through npm install/update');
if (/^docs\/spec\/[^/]+\.md$/.test(rel) && base !== 'CHANGELOG.md') {
  let changelogTouched = false;
  try {
    const status = execFileSync('git', ['status', '--porcelain', '--', 'docs/spec/CHANGELOG.md'], {
      cwd: root,
      encoding: 'utf8',
    });
    changelogTouched = status.trim().length > 0;
  } catch (error) {
    block(`git could not say whether docs/spec/CHANGELOG.md changed (${error.message}); specs stay locked`);
  }
  if (!changelogTouched) {
    block(
      'specs are locked: add a dated line to docs/spec/CHANGELOG.md first (docs/spec/README.md, change policy), then edit the spec'
    );
  }
}
process.exit(0);
