import { httpsCallable } from 'firebase/functions';
import { functions, isAuthBypass } from '@/config/firebase';

export interface TouchedDoc {
  op: string;
  path: string;
}

const WINDOW_MS = 60_000;
const FAILURES_TO_REPORT = 5;
const MAX_REPORTS_PER_PAGE = 3;
const REPORT_GAP_MS = 5 * 60_000;

const failures = new Map<string, number[]>();
let reports = 0;
let lastReportAt = 0;

/** A doc path with every id replaced, so a report names the call site and no person. */
export const pathShape = (path: string): string =>
  path
    .split('/')
    .map((segment, i) => (i % 2 === 1 ? '{id}' : segment))
    .join('/');

/** The distinct `op shape` pairs one transaction attempt touched, in order. */
export const touchedShapes = (touched: readonly TouchedDoc[]): string[] => [
  ...new Set(touched.map((t) => `${t.op} ${pathShape(t.path)}`)),
];

/** Counts one failed transaction; reports the call site once the same one keeps failing in this tab. */
export function noteTransactionFailure(
  code: string,
  touched: readonly TouchedDoc[],
  now: number = Date.now()
): void {
  if (isAuthBypass) return;
  const ops = touchedShapes(touched).slice(0, 12);
  if (ops.length === 0) return;
  const key = ops.join('|');
  const recent = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  failures.set(key, recent);
  if (recent.length < FAILURES_TO_REPORT) return;
  if (reports >= MAX_REPORTS_PER_PAGE) return;
  if (reports > 0 && now - lastReportAt < REPORT_GAP_MS) return;
  reports += 1;
  lastReportAt = now;
  const call = httpsCallable<
    { code: string; ops: string[]; count: number; page: string },
    unknown
  >(functions, 'reportTransactionFailureV1');
  call({
    code,
    ops,
    count: recent.length,
    page: `/${window.location.pathname.split('/')[1] ?? ''}`,
  }).catch(() => {
    // Best effort: the failed write already surfaced to its own caller.
  });
}

/** Test-only: clears the per-page counts and cap. */
export function resetTransactionFailuresForTest(): void {
  failures.clear();
  reports = 0;
  lastReportAt = 0;
}
