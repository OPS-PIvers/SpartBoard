import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { db, isConfigured } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { GL_TOURS_COLLECTION } from './tourSnapshot';
import type { WebTourMatch } from './web/extensionProtocol';

/** One teacher's latest run of a tour, at building_guided_learning_tours/{setId}/runs/{uid}. */
export interface TourRun {
  /** The published snapshot's publishedAt, so Health counts only runs of what teachers see now. */
  v: number;
  startedAt: number;
  /** Furthest 0-based step index reached. */
  furthest: number;
  done: boolean;
  /** Step index the teacher left the tour from, when they left before the end. */
  exit?: number;
  /** Steps whose anchor never appeared before the teacher moved on or left. */
  misses: string[];
  /** Set on web tour runs (T10). */
  surface?: 'web';
  /** Web tour steps found only by a weaker clue, as `stepId:clue`. */
  weak?: string[];
}

export type { WebTourMatch };

/** The rules cap on `misses`. */
export const MAX_RUN_MISSES = 50;
/** The rules cap on `furthest`; higher step indexes are recorded as this. */
export const MAX_RUN_STEP = 500;
const stepIndex = (n: number) =>
  Math.min(Math.max(Math.trunc(n) || 0, 0), MAX_RUN_STEP);
/** At most one mid-run write per interval; start and end write at once. */
export const TOUR_RUN_WRITE_INTERVAL_MS = 30_000;

const runsRef = (setId: string) =>
  collection(db, GL_TOURS_COLLECTION, setId, 'runs');

const isInt = (v: unknown): v is number => Number.isInteger(v);

/** Reads a run doc, or null when it is malformed. */
export function parseTourRun(data: unknown): TourRun | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (!isInt(d.v) || !isInt(d.furthest) || !Array.isArray(d.misses)) {
    return null;
  }
  return {
    v: d.v,
    startedAt: isInt(d.startedAt) ? d.startedAt : 0,
    furthest: d.furthest,
    done: d.done === true,
    ...(isInt(d.exit) ? { exit: d.exit } : {}),
    misses: d.misses.filter((m): m is string => typeof m === 'string'),
    ...(d.surface === 'web' ? { surface: 'web' as const } : {}),
    ...(Array.isArray(d.weak)
      ? { weak: d.weak.filter((w): w is string => typeof w === 'string') }
      : {}),
  };
}

/** Every teacher's latest run of a tour; admins only. */
export async function loadTourRuns(setId: string): Promise<TourRun[]> {
  if (!isConfigured) return [];
  const snap = await getDocs(runsRef(setId));
  return snap.docs.flatMap((d) => {
    const run = parseTourRun(d.data());
    return run ? [run] : [];
  });
}

const writeTourRun = (setId: string, uid: string, run: TourRun) =>
  isConfigured ? setDoc(doc(runsRef(setId), uid), run) : Promise.resolve();

export interface TourRunLog {
  update: (patch: Partial<Pick<TourRun, 'furthest'>>) => void;
  miss: (stepId: string) => void;
  /** Web tours: the latest clue that found a step replaces its earlier miss or weak match. */
  match: (stepId: string, match: WebTourMatch) => void;
  /** Final write; later calls do nothing. */
  end: (patch: Pick<TourRun, 'done'> & Pick<Partial<TourRun>, 'exit'>) => void;
  /** Writes pending changes now, e.g. when the page hides. */
  flush: () => void;
}

/** Records one run: writes at start, at most once per interval while running, and at the end. */
export function startTourRunLog(
  setId: string,
  uid: string,
  start: Pick<TourRun, 'v' | 'furthest' | 'surface'>,
  write: (run: TourRun) => Promise<void> = (run) =>
    writeTourRun(setId, uid, run),
  intervalMs = TOUR_RUN_WRITE_INTERVAL_MS
): TourRunLog {
  let run: TourRun = {
    v: Number.isFinite(start.v) ? Math.trunc(start.v) : 0,
    startedAt: Date.now(),
    furthest: stepIndex(start.furthest),
    done: false,
    misses: [],
    ...(start.surface === 'web' ? { surface: 'web' as const, weak: [] } : {}),
  };
  let dirty = true;
  let ended = false;
  let lastWrite = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!dirty) return;
    dirty = false;
    lastWrite = Date.now();
    write(run).catch((err: unknown) =>
      logError('tourRuns.write', err, { setId })
    );
  };
  const schedule = () => {
    if (timer || ended) return;
    timer = setTimeout(flush, Math.max(0, lastWrite + intervalMs - Date.now()));
  };
  flush();

  return {
    update: (patch) => {
      if (ended) return;
      const furthest = Math.max(run.furthest, stepIndex(patch.furthest ?? 0));
      if (furthest === run.furthest) return;
      run = { ...run, furthest };
      dirty = true;
      schedule();
    },
    miss: (stepId) => {
      if (
        ended ||
        run.misses.includes(stepId) ||
        run.misses.length >= MAX_RUN_MISSES
      )
        return;
      run = { ...run, misses: [...run.misses, stepId] };
      dirty = true;
      schedule();
    },
    match: (stepId, match) => {
      if (ended) return;
      const hasMiss = run.misses.includes(stepId);
      const weakOf = (w: string) => w.slice(0, w.lastIndexOf(':')) === stepId;
      const oldWeak = (run.weak ?? []).find(weakOf);
      const nextWeak =
        match === 'text' || match === 'css' ? `${stepId}:${match}` : undefined;
      if ((match === 'none') === hasMiss && oldWeak === nextWeak) return;
      let misses = run.misses.filter((id) => id !== stepId);
      if (match === 'none' && misses.length < MAX_RUN_MISSES) {
        misses = [...misses, stepId];
      }
      let weak = (run.weak ?? []).filter((w) => !weakOf(w));
      if (nextWeak && weak.length < MAX_RUN_MISSES) weak = [...weak, nextWeak];
      run = { ...run, misses, ...(run.surface === 'web' ? { weak } : {}) };
      dirty = true;
      schedule();
    },
    end: (patch) => {
      if (ended) return;
      ended = true;
      run = { ...run, done: patch.done };
      if (!patch.done && patch.exit !== undefined)
        run.exit = stepIndex(patch.exit);
      dirty = true;
      flush();
    },
    flush,
  };
}
