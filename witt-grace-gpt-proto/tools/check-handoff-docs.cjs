'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const names=['README.md','AGENTS.md','CLAUDE.md','CONTINUE-HERE.md','DEVELOPMENT-STATUS.md','TASKS.md'];
for(const dir of ['docs','docs/specifications'])for(const name of fs.readdirSync(path.join(root,dir))){
 const rel=`${dir}/${name}`;
 if(name.endsWith('.md')&&fs.statSync(path.join(root,rel)).isFile())names.push(rel);
}
let local=0;
for(const name of names){
 const raw=fs.readFileSync(path.join(root,name),'utf8');
 for(const m of raw.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
  const ref=m[1].split('#',1)[0];
  if(!ref||/^(https?:|mailto:|data:)/.test(ref))continue;
  const full=path.resolve(path.dirname(path.join(root,name)),decodeURIComponent(ref));
  if(!full.startsWith(root+path.sep)||!fs.existsSync(full))throw Error(`${name}: broken local link: ${m[1]}`);
  local++;
 }
}
console.log(`PASS ${names.length} handoff/current docs, ${local} local references`);
