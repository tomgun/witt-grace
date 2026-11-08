/* Translation matrix is maintained as UTF-8 PSV to keep all languages visible
 * in one reviewable file. Generate a zero-network, browser-ready JS bundle. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const rows = fs.readFileSync(path.join(root,'locales','messages.psv'),'utf8').trim().split(/\r?\n/).map(s=>s.split('|'));
const [, ...langs] = rows[0];
const expected = ['fi','de','en','es','fr','ru','zh-Hans','ja','ko'];
if (JSON.stringify(langs)!==JSON.stringify(expected)) throw Error('Language order/coverage differs from specification');
const messages = Object.fromEntries(langs.map(lang=>[lang,{}]));
const keys = new Set();
for (const [key,...texts] of rows.slice(1)) {
  if (keys.has(key)) throw Error('Duplicate translation key: '+key);
  if (texts.length!==langs.length || texts.some(v=>!v.trim())) throw Error('Incomplete translation row: '+key);
  keys.add(key);
  langs.forEach((lang,i)=>messages[lang][key]=texts[i]);
}
// The app previously shipped literal keys such as `shortcutNavigation` in the
// keyboard help when index.html referenced keys absent from this matrix.
// Detect all statically referenced UI keys at build time, not just in tests.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
const used = new Set([
  ...[...html.matchAll(/data-i18n(?:-title|-placeholder|-aria)?=\"([^\"]+)\"/g)].map(match => match[1]),
  ...[...app.matchAll(/\bt\(\s*['\"]([A-Za-z][A-Za-z0-9]*)['\"]/g)].map(match => match[1])
]);
for (const key of used) {
  if (!keys.has(key)) throw Error('Missing translation for UI key: ' + key);
}
const js = `/* Generated from locales/messages.psv. Edit that table, NOT this file. */\n`+
`(function(root,factory){const api=factory(); if(typeof module==='object'&&module.exports)module.exports=api; if(root)root.WittI18n=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';\n`+
`const messages=${JSON.stringify(messages)};const languages=${JSON.stringify(langs)};let locale='fi';\n`+
`try{const stored=localStorage.getItem('witt-locale-v1');if(languages.includes(stored))locale=stored;}catch(_){}\n`+
`function getLocale(){return locale;}\nfunction setLocale(next){locale=languages.includes(next)?next:'fi';try{localStorage.setItem('witt-locale-v1',locale);}catch(_){}return locale;}\n`+
`function t(key,params){let text=messages[locale][key]||messages.fi[key]||key;if(params)text=text.replace(/\\{(\\w+)\\}/g,(_,k)=>String(params[k]??''));return text;}\n`+
`function apply(root){const doc=root||document; if(doc.documentElement)doc.documentElement.lang=locale;for(const node of doc.querySelectorAll('[data-i18n]'))node.textContent=t(node.dataset.i18n);for(const node of doc.querySelectorAll('[data-i18n-title]'))node.title=t(node.dataset.i18nTitle);for(const node of doc.querySelectorAll('[data-i18n-placeholder]'))node.placeholder=t(node.dataset.i18nPlaceholder);for(const node of doc.querySelectorAll('[data-i18n-aria]'))node.setAttribute('aria-label',t(node.dataset.i18nAria));}\n`+
`return{languages,messages,getLocale,setLocale,t,apply};});\n`;
fs.writeFileSync(path.join(root,'src','i18n.js'),js);
console.log(`Generated ${Object.keys(messages.fi).length} keys × ${langs.length} languages`);
