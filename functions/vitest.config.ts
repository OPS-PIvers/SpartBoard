import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // The Cloud Functions runtime always sets `GCLOUD_PROJECT`, and
    // `vertexClientOptions()` in `aiGeneration.ts` reads it to address Vertex
    // AI. Provide it here so tests exercise the same path production does
    // rather than tripping the "no project id" guard.
    env: {
      GCLOUD_PROJECT: 'demo-spartboard',
    },
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/lib/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
    ],
  },
});
