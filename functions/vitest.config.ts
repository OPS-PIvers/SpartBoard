import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // vertexClientOptions() reads GCLOUD_PROJECT; provide it so tests exercise the same path production does.
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
