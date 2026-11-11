// Builds the Claude connector's quiz preview card (mcpApps/quiz-preview.html) into dist/mcp-app, apart from the app's chunks.
import path from 'path';
import { defineConfig, type PluginOption } from 'vite';
import base from './vite.config';

const plugins = (base.plugins ?? []).filter(
  (p: PluginOption) =>
    !(p && typeof p === 'object' && 'name' in p && p.name === 'pdfjs-wasm')
);

export default defineConfig({
  ...base,
  plugins,
  base: '/mcp-app/',
  publicDir: false,
  build: {
    outDir: 'dist/mcp-app',
    emptyOutDir: true,
    // The card is one page that loads the student player; the main app's 500 kB warning does not apply.
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      input: path.resolve(__dirname, 'mcpApps/quiz-preview.html'),
    },
  },
});
