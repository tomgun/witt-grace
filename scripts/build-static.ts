// Builds the supporter packages (owner 2026-11-20): for each edition one self-contained `witt.html` that opens
// from a disk without the site, with the examples and fonts inside and the edition's name shown beside the logo,
// zipped with a README and the licence. Usage: npm run build:static  →  dist-static/witt-grace-<version>-<edition>.zip
// Exit codes: 0 built · 1 the build did not have the expected shape.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'vite';
import { EDITIONS, embeddedJson } from '../src/lib/embedded.ts';
import { inlineBuild, zip } from './static-package.ts';

const OUT = 'dist-static';
const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
const when = new Date();

const result = await build({
  configFile: 'vite.config.ts',
  logLevel: 'warn',
  publicDir: false,
  build: {
    write: false,
    sourcemap: false,
    cssCodeSplit: false,
    // Fonts go into the stylesheet as data: addresses; nothing is loaded from beside the file.
    assetsInlineLimit: 100_000_000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const output = (Array.isArray(result) ? result : [result]).flatMap((part) =>
  'output' in part ? part.output : []
);
const text = (source: string | Uint8Array) =>
  typeof source === 'string' ? source : Buffer.from(source).toString('utf8');
const chunks = output.filter((file) => file.type === 'chunk');
const assets = output.filter((file) => file.type === 'asset');
const html = assets.find((file) => file.fileName === 'index.html');
const styles = assets.filter((file) => file.fileName.endsWith('.css'));
// Files of the published site only: the AI brief and what search engines read.
const SITE_ONLY = ['ai.txt', 'robots.txt', 'sitemap.xml'];
const strays = assets.filter(
  (file) => file !== html && !styles.includes(file) && !SITE_ONLY.includes(file.fileName)
);
if (chunks.length !== 1 || !html || styles.length !== 1 || strays.length) {
  console.error(
    `build-static: expected one script, one stylesheet and index.html; got ${chunks.length} scripts, ` +
      `${styles.length} stylesheets, strays: ${strays.map((file) => file.fileName).join(', ') || 'none'}`
  );
  process.exit(1);
}

const examples: Record<string, unknown> = {};
for (const name of readdirSync('public/examples')
  .filter((file) => file.endsWith('.json'))
  .sort())
  examples[name] = JSON.parse(readFileSync(join('public/examples', name), 'utf8'));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const fill = (template: string, edition: string) =>
  template
    .replaceAll('{{EDITION}}', edition)
    .replaceAll('{{VERSION}}', version)
    .replaceAll('{{DATE}}', when.toISOString().slice(0, 10));
for (const edition of EDITIONS) {
  const name = `witt-grace-${version}-${edition}`;
  const files = [
    {
      name: 'witt.html',
      data: Buffer.from(
        inlineBuild({
          html: text(html.source),
          script: chunks[0]!.code,
          style: text(styles[0]!.source),
          embedded: embeddedJson({ edition, examples }),
        }),
        'utf8'
      ),
    },
    {
      name: 'README.txt',
      data: Buffer.from(fill(readFileSync('packaging/README.txt', 'utf8'), edition), 'utf8'),
    },
    {
      name: 'LICENSE.txt',
      data: Buffer.from(fill(readFileSync('packaging/LICENSE.txt', 'utf8'), edition), 'utf8'),
    },
  ];
  mkdirSync(join(OUT, name));
  for (const file of files) writeFileSync(join(OUT, name, file.name), file.data);
  const archive = zip(
    files.map((file) => ({ name: `${name}/${file.name}`, data: file.data })),
    when
  );
  writeFileSync(join(OUT, `${name}.zip`), archive);
  console.log(
    `build-static: ${name}.zip  ${(archive.length / 1024).toFixed(0)} kB  (witt.html ${(files[0]!.data.length / 1024).toFixed(0)} kB)`
  );
}
