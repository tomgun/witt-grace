import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { buildFetchedBrief } from './src/domain/ai/draft.ts';

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

// Relative base: the site works at https://OWNER.github.io/REPO/ and from a local folder alike.
export default defineConfig({
  base: './',
  plugins: [react(), localRelayInDev(), aiBrief()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { outDir: 'dist', sourcemap: true, target: 'es2022' },
});
