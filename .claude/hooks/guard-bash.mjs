// PreToolUse (Bash): refuse the handful of commands that destroy work, bypass review, or write into the frozen prototype.
// A guard rail against accidents, not a security boundary (see CONTRIBUTING.md).
const input = JSON.parse(
  await new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data || '{}'));
  })
);
const command = String(input?.tool_input?.command ?? '');
const rules = [
  [
    /git\s+push\b[^\n|;&]*(--force|-f\b)[^\n|;&]*\bmain\b|git\s+push\b[^\n|;&]*\bmain\b[^\n|;&]*(--force|-f\b)/,
    'force-pushing main rewrites shared history; push a branch and open a PR',
  ],
  [
    /git\s+push\b[^\n|;&]*--force-with-lease[^\n|;&]*\bmain\b/,
    'force-pushing main rewrites shared history; push a branch and open a PR',
  ],
  [/git\s+reset\s+--hard/, 'git reset --hard discards uncommitted work; use git stash or git checkout -- <file>'],
  [/git\s+commit\b[^\n|;&]*--no-verify/, 'commit hooks exist for a reason; fix the hook failure instead'],
  [
    /\brm\s+-[a-zA-Z]*r[a-zA-Z]*\s+(\/|\.\/?|\*|~\/?)(\s|$)/,
    'recursive delete at the repo root or home; name the directory explicitly',
  ],
  [
    /\b(rm|mv|sed\s+-i|tee|cp)\b[^\n|;&]*witt-grace-gpt-proto\/(?!dist\b)/,
    'the prototype is frozen (docs/PROTOTYPE_REFERENCE.md); build output under witt-grace-gpt-proto/dist is the only writable path',
  ],
  [
    />\s*[^\s|;&]*witt-grace-gpt-proto\/(?!dist\b)/,
    'the prototype is frozen (docs/PROTOTYPE_REFERENCE.md); build output under witt-grace-gpt-proto/dist is the only writable path',
  ],
  [
    /\b(cat|less|more|head|tail|sed|grep|awk|bat)\b[^\n|;&]*\s[^\s]*\.env(?!\.example)(\.[A-Za-z]+)?(\s|$)/,
    'do not print secrets into the conversation; read .env.example for the shape',
  ],
];
for (const [pattern, reason] of rules) {
  if (pattern.test(command)) {
    console.error(`guard-bash: refused — ${reason}`);
    process.exit(2);
  }
}
process.exit(0);
