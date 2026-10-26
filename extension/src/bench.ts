// True only in `build.ts --bench` output; normal builds compile every mark away.
declare const __SPART_BENCH__: boolean | undefined;

export const BENCH = typeof __SPART_BENCH__ !== 'undefined' && __SPART_BENCH__;

/** Logs a timing mark the perf harness (scripts/bench) reads off the page console. */
export function benchMark(name: string, data: Record<string, unknown> = {}) {
  if (!BENCH) return;
  // eslint-disable-next-line no-console -- the harness reads these lines
  console.debug(
    `[sbbench] ${JSON.stringify({ name, t: performance.timeOrigin + performance.now(), ...data })}`
  );
}
