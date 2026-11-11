import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

/** The dev server may also reach a collaboration relay on this machine (ws://); the built page allows wss: only. */
const localRelayInDev = (): Plugin => ({
  name: 'witt-local-relay-csp',
  apply: 'serve',
  transformIndexHtml: (html) =>
    html.replace("connect-src 'self' wss:;", "connect-src 'self' wss: ws://127.0.0.1:* ws://localhost:*;"),
});

// Relative base: the site works at https://OWNER.github.io/REPO/ and from a local folder alike.
export default defineConfig({
  base: './',
  plugins: [react(), localRelayInDev()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { outDir: 'dist', sourcemap: true, target: 'es2022' },
});
