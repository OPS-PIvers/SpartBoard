// Performance-harness test config — runs ONLY the tests/perf/** suite
// (pageLoadPerf / editorPerf / dashboardPerf). Invoked by `pnpm run test:perf`.
//
// The default `pnpm test` config (vitest.config.ts) excludes tests/perf/**
// because these harnesses mount many routes under React.Profiler with
// per-iteration settle waits (seconds of overhead) and assert no duration
// thresholds — they're profiling instruments, not regression gates. This
// config re-includes them with the same jsdom + setup so they can be run on
// demand. (Mirrors the dedicated vitest.rules.config.ts pattern.)
//
// Baselines under tests/perf/results/ are only (re)written when
// WRITE_PERF_BASELINE is set, e.g. `WRITE_PERF_BASELINE=1 pnpm test:perf` —
// see the afterAll guards in the harnesses. A plain run is read-only.
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      // Match vitest.config.ts: setTz pins TZ before setup's imports hoist.
      setupFiles: ['./tests/setTz.ts', './tests/setup.ts'],
      include: ['tests/perf/**/*.test.{ts,tsx}'],
    },
  })
);
