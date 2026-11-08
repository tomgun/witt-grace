import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Relative base: the site works at https://OWNER.github.io/REPO/ and from a local folder alike.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { outDir: 'dist', sourcemap: true, target: 'es2022' },
});
