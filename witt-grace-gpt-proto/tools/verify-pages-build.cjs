/* Static Pages preflight. Intentionally no npm dependencies or network access. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
assert.match(html, /<html\b/i, 'Pages entrypoint must be HTML');
assert.match(html, /src\/app\.js/, 'Pages entrypoint must refer to the actual browser app');
assert.ok(fs.statSync(path.join(dist, 'witt-standalone.html')).size > 100_000, 'Standalone output missing');
let count = 0;
const assetTag = /<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+)"[^>]*>/g;
for (const match of html.matchAll(assetTag)) {
  const raw = match[1];
  if (/^(?:https?:|data:|#)/i.test(raw)) throw Error(`Unexpected externally hosted or inline asset reference: ${raw}`);
  const uri = raw.split(/[?#]/, 1)[0];
  const asset = path.resolve(dist, uri);
  assert.ok(asset.startsWith(dist + path.sep), `Unsafe asset path: ${uri}`);
  assert.ok(fs.existsSync(asset) && fs.statSync(asset).isFile(), `Missing Pages asset: ${uri}`);
  count++;
}
assert.ok(count >= 15, `Unexpectedly few static assets (${count})`);
const files=[];
function walk(dir) { for (const item of fs.readdirSync(dir, { withFileTypes:true })) {
  const relative = path.relative(dist, path.join(dir, item.name)).replaceAll('\\', '/');
  if (item.isDirectory()) walk(path.join(dir,item.name)); else files.push(relative);
}}
walk(dist);
const blocked = files.filter(f => /(^|\/)(?:tests?|examples?|docs?|node_modules|\.github|\.env|\.git)(?:\/|$)/i.test(f) || /\.(?:map|witt\.json|zip|bak)$/i.test(f) || /(^|\/)qa-[^/]+\//i.test(f));
assert.deepEqual(blocked, [], `Non-public or source-only assets leaked into Pages: ${blocked.join(', ')}`);
assert.ok(files.length <= 35, `Unexpectedly many Pages files (${files.length}); check build outputs`);
console.log(`PASS: Pages static entrypoint, ${count} local assets, ${files.length} deployable files; no dev fixtures or secrets.`);
