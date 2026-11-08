const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'src'), { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
for (const name of ['core.js', 'view-layout.js', 'i18n.js', 'keyboard-nav.js', 'history.js', 'table-model.js', 'examples.js', 'review-lens.js', 'workspace.js', 'ai-starter.js', 'ai-roundtrip.js', 'ai-draft-v2.js', 'contributions.js', 'document-library.js', 'diagram-export.js', 'assessor-view.js', 'p2p-host-engine.js', 'project-import-schema.js', 'import-validation.js', 'app.js', 'styles.css']) fs.copyFileSync(path.join(root, 'src', name), path.join(out, 'src', name));
const sourceHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const parts = ['core.js', 'view-layout.js', 'i18n.js', 'keyboard-nav.js', 'history.js', 'table-model.js', 'examples.js', 'review-lens.js', 'workspace.js', 'ai-starter.js', 'ai-roundtrip.js', 'ai-draft-v2.js', 'contributions.js', 'document-library.js', 'diagram-export.js', 'assessor-view.js', 'project-import-schema.js', 'import-validation.js', 'app.js'].map(name=>fs.readFileSync(path.join(root,'src',name),'utf8'));
// Robust to attribute reordering/formatting by HTML tooling.
let standalone = sourceHtml.replace(/<link\b(?=[^>]*href="src\/styles\.css")[^>]*\/?\s*>/i, `<style>\n${css}\n</style>`);
for (const name of ['core.js', 'view-layout.js', 'i18n.js', 'keyboard-nav.js', 'history.js', 'table-model.js', 'examples.js', 'review-lens.js', 'workspace.js', 'ai-starter.js', 'ai-roundtrip.js', 'ai-draft-v2.js', 'contributions.js', 'document-library.js', 'diagram-export.js', 'assessor-view.js', 'project-import-schema.js', 'import-validation.js', 'app.js']) {
  const expression = new RegExp(`<script\\b(?=[^>]*src="src/${name.replace('.','\\.')}\\")[^>]*><\\/script>`, 'i');
  standalone = standalone.replace(expression, '');
}
if (standalone.includes('src/styles.css') || standalone.includes('src/app.js') || !standalone.includes('<style>')) throw Error('Standalone build failed to inline runtime assets');
standalone = standalone.replace('</body>', () => `${parts.map(code=>`<script>\n${code}\n</script>`).join('\n')}\n</body>`);
fs.writeFileSync(path.join(out, 'witt-standalone.html'), standalone);
console.log('Static site built at dist/. Includes standalone single-file HTML. No dependencies.');
