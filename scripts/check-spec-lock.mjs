// must: a change to docs/spec/*.md other than CHANGELOG.md is refused unless docs/spec/CHANGELOG.md changes in the same range
// test: scripts/check-spec-lock.mjs (run by npm run check; CI passes --base)
// red-against: a spec edited "while at it" with no changelog line; the changelog edited alone passes
// Usage: node scripts/check-spec-lock.mjs [--base <git ref>]   (no --base: the working tree against HEAD)
// Exit codes: 0 ok · 1 a locked spec changed without a changelog line · 2 git could not answer.
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('node scripts/check-spec-lock.mjs [--base <git ref>]');
  process.exit(0);
}
const baseIndex = args.indexOf('--base');
const base = baseIndex >= 0 ? args[baseIndex + 1] : null;
if (baseIndex >= 0 && !base) {
  console.error('check-spec-lock: --base needs a git ref');
  process.exit(2);
}

function git(...argv) {
  return execFileSync('git', argv, { encoding: 'utf8' }).trim();
}
function lines(text) {
  return text ? text.split('\n') : [];
}

let changed;
try {
  if (base) {
    changed = lines(git('diff', '--name-only', `${base}...HEAD`));
  } else {
    let hasHead = true;
    try {
      git('rev-parse', '--verify', '--quiet', 'HEAD');
    } catch {
      hasHead = false;
    }
    const tracked = hasHead ? lines(git('diff', '--name-only', 'HEAD')) : lines(git('ls-files'));
    const untracked = lines(git('ls-files', '--others', '--exclude-standard'));
    changed = [...tracked, ...untracked];
  }
} catch (error) {
  console.error(`check-spec-lock: git failed — ${error.message}`);
  process.exit(2);
}

const spec = changed.filter((file) => /^docs\/spec\/[^/]+\.md$/.test(file));
const locked = spec.filter((file) => file !== 'docs/spec/CHANGELOG.md');
const changelogTouched = spec.includes('docs/spec/CHANGELOG.md');
if (locked.length && !changelogTouched) {
  console.error(
    `check-spec-lock: ${locked.join(', ')} changed without a line in docs/spec/CHANGELOG.md (docs/spec/README.md, change policy)`
  );
  process.exit(1);
}
console.log(
  `check-spec-lock: ok (${locked.length} locked spec file(s) changed${locked.length ? ', changelog updated' : ''})`
);
