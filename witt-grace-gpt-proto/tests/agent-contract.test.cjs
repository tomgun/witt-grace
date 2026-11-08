'use strict';
// Updated handoff test: legacy version-6 gate was obsolete; active engine is v8.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('agent entrypoints point to current dev32 specs and identify historical documents',()=>{
 for(const p of ['AGENTS.md','CLAUDE.md','CONTINUE-HERE.md']){
  const s=read(p);
  assert.match(s,/HANDOFF_START_HERE\.md/,p);
  assert.match(s,/specifications\//,p);
  assert.match(s,/historical|Historical|archive/i,p);
 }
 for(const p of ['docs/METHOD_INTENT.md','docs/FUTURE_BACKLOG.md','docs/specifications/REQUIREMENTS_TRACEABILITY.md']){
  assert.ok(read(p).length>200,p);
 }
});

test('active agent contracts explicitly pin current v8 math and forbid old/scored-UI drift',()=>{
 for(const p of ['CLAUDE.md','docs/HANDOFF_START_HERE.md','docs/specifications/CURRENT_GRACE_AND_DATA.md']){
  const s=read(p);
  assert.match(s,/v8|version: 8|schemaVersion: 8/i,p);
  assert.match(s,/evidence-v3-links/,p);
  assert.match(s,/scor|lasken/i,p);
 }
 const s=read('CLAUDE.md');
 assert.match(s,/no silent|never silently/i);
 assert.match(s,/no third|two assessment axes|third global/i, 'no new hidden numeric priority axis');
 assert.match(read('docs/P2P_NO_DATABASE_RFC_R1.md'),/without any persistent backend database/i);
 assert.doesNotMatch(s,/Keep schema v4/i);
});

test('current user method intent preserves weighting and nonautomatic deduplication',()=>{
 const s=read('docs/METHOD_INTENT.md');
 assert.match(s,/ballot weighting is independent of assessment aggregation/i);
 assert.match(s,/no third numerical rating/i);
 assert.match(s,/no automatic semantic deduplication/i);
});
