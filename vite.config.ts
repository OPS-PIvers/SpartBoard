import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    // Keep the global chunk size warning at 500 kB so we don't hide regressions in other chunks.
    // Warnings for inherently large WASM-heavy chunks like @imgly/background-removal and ort-wasm
    // are expected and accepted rather than suppressed globally.
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'firebase-app': ['firebase/app'],
          'firebase-auth': ['firebase/auth'],
          'firebase-firestore': ['firebase/firestore'],
          'firebase-storage': ['firebase/storage'],
          'firebase-functions': ['firebase/functions'],
          'dnd-kit': [
            '@dnd-kit/core',
            '@dnd-kit/sortable',
            '@dnd-kit/utilities',
          ],
          'imgly-bg-removal': ['@imgly/background-removal'],
          utils: ['html-to-image', 'jszip'],
        },
      },
    },
  },
});
