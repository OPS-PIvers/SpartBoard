// Mirror of components/tours/tourPlaytest.ts; tests/tourPlaytestParity.test.ts keeps them equal.
interface KeyStep {
  id: string;
  tour?: unknown;
}

/** FNV-1a of each step's id and binding, so a playtest goes stale when a step is added, moved or rebound. */
export function tourPlaytestKey(steps: readonly KeyStep[]): string {
  const source = JSON.stringify(
    steps.map((s) => {
      const tour = s.tour as
        { anchor?: unknown; action?: unknown; value?: unknown } | undefined;
      return [
        s.id,
        tour?.anchor ?? null,
        tour?.action ?? null,
        tour?.value ?? null,
      ];
    })
  );
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
