import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { robotsTxt, siteHeadTags, sitemapXml } from './scripts/site-files.ts';
import { buildFetchedBrief } from './src/domain/ai/draft.ts';
import { DEFAULT_LANGUAGE, LANGUAGES } from './src/lib/i18n/i18n.ts';
import { versionJson } from './src/lib/version.ts';

/** The dev server may also reach a collaboration relay on this machine (ws://); the built page allows wss: only. */
const localRelayInDev = (): Plugin => ({
  name: 'witt-local-relay-csp',
  apply: 'serve',
  transformIndexHtml: (html) =>
    html.replace("connect-src 'self' wss:;", "connect-src 'self' wss: ws://127.0.0.1:* ws://localhost:*;"),
});

/**
 * `ai.txt`: the brief an AI fetches when the person gives it the site's address (S-15, 2026-11-20). Written from
 * the same rules as the task the app copies. WITT_SITE_URL is the published address ending in `/` (set by the Pages
 * workflow); without it the brief tells the AI to derive the address from where it fetched the brief.
 */
const aiBrief = (): Plugin => {
  const brief = () => buildFetchedBrief({ siteUrl: process.env.WITT_SITE_URL ?? '' }) + '\n';
  return {
    name: 'witt-ai-brief',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/ai.txt') return next();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(brief());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'ai.txt', source: brief() });
    },
  };
};

/** The version of package.json and the day of the build: shown in the About dialog and served as version.json. */
const VERSION = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
const BUILT = new Date().toISOString().slice(0, 10);

/**
 * For search engines and link previews (S-15, 2026-11-20): robots.txt always; with the published address
 * (WITT_SITE_URL) also sitemap.xml and the head tags that need an absolute address.
 */
const siteFiles = (): Plugin => {
  const siteUrl = () => process.env.WITT_SITE_URL ?? '';
  return {
    name: 'witt-site-files',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<!-- site-head -->', siteHeadTags(siteUrl(), LANGUAGES, DEFAULT_LANGUAGE)),
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt(siteUrl()) });
      this.emitFile({ type: 'asset', fileName: 'version.json', source: versionJson(VERSION, BUILT) });
      if (siteUrl())
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: sitemapXml(siteUrl(), LANGUAGES, DEFAULT_LANGUAGE),
        });
    },
  };
};

// Relative base: the site works at https://OWNER.github.io/REPO/ and from a local folder alike.
export default defineConfig({
  base: './',
  define: { __WITT_VERSION__: JSON.stringify(VERSION), __WITT_BUILT__: JSON.stringify(BUILT) },
  plugins: [react(), localRelayInDev(), aiBrief(), siteFiles()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { outDir: 'dist', sourcemap: true, target: 'es2022' },
});
