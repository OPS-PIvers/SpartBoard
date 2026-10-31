// Suggested fixes on web tour steps, read-only for the connector; mirrors components/tours/web/webTourFixes.ts and fixClues.ts.
import { webTourTextHits } from './webTourStudentData';

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

/** Must match fixKey in components/tours/web/fixClues.ts. */
export function fixKey(locator: unknown): string {
  const l = isObj(locator) ? locator : {};
  const attrs = isObj(l.attrs) ? l.attrs : {};
  const parts = [
    ...FIX_CLUES.map((k) => str(l[k])),
    ...ATTR_KEYS.map((k) => str(attrs[k])),
  ];
  return fnv(JSON.stringify(parts));
}

const ROLE = /^[a-z][a-z-]{0,39}$/;
const clean = (v: unknown): v is string =>
  typeof v === 'string' && v !== '' && webTourTextHits(v).size === 0;

/** Must match runFixClues in components/tours/web/fixClues.ts (without a roster): page words only from the step's own clues, never a page title. */
export function runFixClues(fix: Obj, recorded: Obj): Obj {
  const out: Obj = {};
  if (typeof fix.role === 'string' && ROLE.test(fix.role)) out.role = fix.role;
  for (const k of ['name', 'text', 'heading'] as const)
    if (str(recorded[k])) out[k] = recorded[k];
  if (clean(fix.css)) out.css = fix.css;
  const fromRecorded = isObj(recorded.attrs) ? recorded.attrs : {};
  const fromFix = isObj(fix.attrs) ? fix.attrs : {};
  const attrs: Obj = {};
  for (const k of ['ariaLabel', 'name'] as const)
    if (str(fromRecorded[k])) attrs[k] = fromRecorded[k];
  for (const k of ['testId', 'href'] as const)
    if (clean(fromFix[k])) attrs[k] = fromFix[k];
  if (Object.keys(attrs).length) out.attrs = attrs;
  if (isObj(fix.box)) out.box = fix.box;
  return out;
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

// Mirrors parseWeak in components/tours/web/webTourHealth.ts.
const weakStepId = (entry: string): string | null => {
  const at = entry.lastIndexOf(':');
  if (at <= 0) return null;
  const clue = entry.slice(at + 1);
  return clue === 'text' || clue === 'css' || clue === 'score'
    ? entry.slice(0, at)
    : null;
};

const struggled = (run: FixRun, stepId: string): boolean =>
  (Array.isArray(run.misses) && run.misses.includes(stepId)) ||
  (Array.isArray(run.weak) &&
    run.weak.some((w) => typeof w === 'string' && weakStepId(w) === stepId));

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
    webTourChecked?: unknown;
  },
  published: { at: number; steps: DraftStep[] } | null,
  runs: readonly FixRun[]
): Map<string, StepFix> {
  const recorded = new Map(
    (published?.steps ?? []).flatMap((s) =>
      isObj(s.web?.locator) ? [[s.id, s.web.locator] as const] : []
    )
  );
  const groups = new Map<string, Map<string, FixGroup>>();
  for (const run of published ? runs : []) {
    if (run.v !== published?.at || run.surface !== 'web' || !isObj(run.fixes))
      continue;
    for (const [stepId, stored] of Object.entries(run.fixes)) {
      const own = recorded.get(stepId);
      if (!own || !isObj(stored) || !struggled(run, stepId)) continue;
      const locator = runFixClues(stored, own);
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
  const checked = isObj(draft.webTourChecked) ? draft.webTourChecked : {};
  const results = isObj(checked.results) ? checked.results : {};
  const out = new Map<string, StepFix>();
  for (const step of draft.steps) {
    const own = step.web?.locator;
    if (!isObj(own)) continue;
    const current = fixKey(own);
    const usable = (locator: unknown) =>
      fixKey(locator) !== current && fixKey(locator) !== dismissed[step.id];
    const check = checks[step.id];
    if (
      results[step.id] !== 'found' &&
      isObj(check) &&
      isObj(check.locator) &&
      check.base === current &&
      usable(check.locator)
    ) {
      out.set(step.id, {
        // Claude never reads a check's new page words, only the site's own clues.
        locator: runFixClues(check.locator, own),
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
