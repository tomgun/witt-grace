'use strict';
// Guard the handoff against accidental return of older assistant-authored agent tasks.
// This checks the active instructions; it does NOT purport to prove the product UX correct.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const forbidden=['agent-handoff/CLAUDE_FIRST_TASK.md','agent-handoff/HANDOFF.md','docs/SCORING.md','docs/GRACE_MATHEMATICAL_CONTRACT.md','playwright.config.cjs'];
for(const rel of forbidden)assert.equal(fs.existsSync(path.join(root,rel)),false,`Superseded active file returned: ${rel}`);
for(const p of ['CLAUDE.md','AGENTS.md','docs/HANDOFF_START_HERE.md','docs/specifications/CURRENT_GRACE_AND_DATA.md']){
 const s=read(p);
 assert.match(s,/evidence-v3-links/);
 assert.match(s,/dev.?32|0\.11\.0-dev.?32|v8|schemaVersion: 8/i);
}
assert.match(read('docs/METHOD_INTENT.md'),/no automatic semantic deduplication/i);
assert.match(read('docs/FUTURE_BACKLOG.md'),/without persistent server documents|database-free P2P/i);
assert.match(read('docs/P2P_NO_DATABASE_RFC_R1.md'),/without any persistent backend database/i);
assert.equal(read('witt-grace-github-handoff-guide-fi.md').replaceAll('](docs/', ']('),read('docs/KAYTTOONOTTO_FI.md'), 'Finnish guide content drifted (except working relative link prefixes)');
const Core=require('../src/core.js'),p=Core.createBlankProject('decision');
assert.equal(p.schemaVersion,8);
assert.equal(p.settings.scoring,'evidence-v3-links');
console.log('PASS source-first guidance: no active legacy handoff, current engine/schema, matching Finnish guide.');
