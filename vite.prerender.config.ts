/**
 * Minimal Vite config for the legal-pages prerender step (see
 * scripts/prerender-legal.tsx). The main vite.config.ts declares
 * manualChunks, which Rollup rejects for SSR builds where react is
 * externalized — so the SSR compile uses this bare config instead.
 */
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    ssr: 'scripts/prerender-legal.tsx',
    outDir: 'dist-ssr',
    emptyOutDir: true,
  },
});
