// Suggested fixes on web tour steps, read-only for the connector; mirrors components/tours/web/webTourFixes.ts.

// Must match MIN_TEACHER_RUNS in components/tours/web/webTourFixes.ts.
export const MIN_TEACHER_RUNS = 2;

const FIX_CLUES = ['role', 'name', 'text', 'css', 'heading'] as const;
const ATTR_KEYS = ['testId', 'ariaLabel', 'name', 'href'] as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
};

/** Must match fixKey in components/tours/web/webTourFixes.ts. */
export function fixKey(locator: unknown): string {
  const l = isObj(locator) ? locator : {};
  const attrs = isObj(l.attrs) ? l.attrs : {};
  const parts = [
    ...FIX_CLUES.map((k) => str(l[k])),
    ...ATTR_KEYS.map((k) => str(attrs[k])),
  ];
  return fnv(JSON.stringify(parts));
}

export interface FixRun {
  v?: unknown;
  surface?: unknown;
  startedAt?: unknown;
  misses?: unknown;
  weak?: unknown;
  fixes?: unknown;
  admin?: unknown;
}

export interface StepFix {
  locator: Obj;
  source: 'admin' | 'check' | 'teacher';
  count: number;
  at: number;
}

interface FixGroup {
  locator: Obj;
  count: number;
  admin: boolean;
  at: number;
}

const struggled = (run: FixRun, stepId: string): boolean =>
  (Array.isArray(run.misses) && run.misses.includes(stepId)) ||
  (Array.isArray(run.weak) &&
    run.weak.some(
      (w) => typeof w === 'string' && w.slice(0, w.lastIndexOf(':')) === stepId
    ));

interface DraftStep {
  id: string;
  web?: { locator?: unknown };
}

/** The fix to show per draft step: a check run's first, then the runs of the published version, as SpartBoard's editor shows them. */
export function stepFixes(
  draft: {
    steps: DraftStep[];
    webSuggestions?: unknown;
    webFixDismissed?: unknown;
  },
  published: { at: number; steps: DraftStep[] } | null,
  runs: readonly FixRun[]
): Map<string, StepFix> {
  const groups = new Map<string, Map<string, FixGroup>>();
  for (const run of published ? runs : []) {
    if (run.v !== published?.at || run.surface !== 'web' || !isObj(run.fixes))
      continue;
    for (const [stepId, locator] of Object.entries(run.fixes)) {
      if (!isObj(locator) || !struggled(run, stepId)) continue;
      const byKey = groups.get(stepId) ?? new Map<string, FixGroup>();
      groups.set(stepId, byKey);
      const key = fixKey(locator);
      const g = byKey.get(key) ?? { locator, count: 0, admin: false, at: 0 };
      g.count++;
      if (run.admin === true) g.admin = true;
      g.at = Math.max(
        g.at,
        typeof run.startedAt === 'number' ? run.startedAt : 0
      );
      byKey.set(key, g);
    }
  }
  const publishedKey = new Map(
    (published?.steps ?? []).map((s) => [s.id, fixKey(s.web?.locator)])
  );
  const checks = isObj(draft.webSuggestions) ? draft.webSuggestions : {};
  const dismissed = isObj(draft.webFixDismissed) ? draft.webFixDismissed : {};
  const out = new Map<string, StepFix>();
  for (const step of draft.steps) {
    if (!isObj(step.web?.locator)) continue;
    const current = fixKey(step.web.locator);
    const usable = (locator: unknown) =>
      fixKey(locator) !== current && fixKey(locator) !== dismissed[step.id];
    const check = checks[step.id];
    if (
      isObj(check) &&
      isObj(check.locator) &&
      check.base === current &&
      usable(check.locator)
    ) {
      out.set(step.id, {
        locator: check.locator,
        source: 'check',
        count: 1,
        at: typeof check.at === 'number' ? check.at : 0,
      });
      continue;
    }
    if (publishedKey.get(step.id) !== current) continue;
    const best = [...(groups.get(step.id)?.values() ?? [])]
      .filter((g) => g.admin || g.count >= MIN_TEACHER_RUNS)
      .sort(
        (a, b) => Number(b.admin) - Number(a.admin) || b.count - a.count
      )[0];
    if (best && usable(best.locator))
      out.set(step.id, {
        locator: best.locator,
        source: best.admin ? 'admin' : 'teacher',
        count: best.count,
        at: best.at,
      });
  }
  return out;
}
