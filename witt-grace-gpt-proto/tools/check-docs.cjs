// Only active documentation belongs in the default source bundle. Historical artifacts are a separate optional ZIP.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const files=['README.md','CLAUDE.md','AGENTS.md','TASKS.md','CONTINUE-HERE.md','DEVELOPMENT-STATUS.md','RELEASE.md', 'witt-grace-github-handoff-guide-fi.md'];
function walk(dir){for(const item of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
 const rel=path.posix.join(dir,item.name);
 if(item.isDirectory())walk(rel);
 else if(rel.endsWith('.md'))files.push(rel);
}}
walk('docs');let links=0;
for(const name of files){
 const content=fs.readFileSync(path.join(root,name),'utf8');
 for(const m of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
  const target=m[1].split('#')[0];
  if(!target||/^(?:https?:|mailto:|data:)/.test(target))continue;
  const full=path.resolve(path.dirname(path.join(root,name)),decodeURIComponent(target));
  if(!full.startsWith(root+path.sep)||!fs.existsSync(full))throw Error(`Broken local reference in ${name}: ${m[1]}`);
  links++;
 }
}
console.log(`Documentation check: ${files.length} active docs, ${links} links.`);
