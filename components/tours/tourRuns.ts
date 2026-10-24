import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { db, isConfigured } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { GL_TOURS_COLLECTION } from './tourSnapshot';
import {
  parseTourRun,
  startTourRunLog as startLog,
  TOUR_RUN_WRITE_INTERVAL_MS,
  type TourRun,
  type TourRunLog,
} from './tourRunLog';

export * from './tourRunLog';

const runsRef = (setId: string) =>
  collection(db, GL_TOURS_COLLECTION, setId, 'runs');

/** Every teacher's latest run of a tour; admins only. */
export async function loadTourRuns(setId: string): Promise<TourRun[]> {
  if (!isConfigured) return [];
  const snap = await getDocs(runsRef(setId));
  return snap.docs.flatMap((d) => {
    const run = parseTourRun(d.data());
    return run ? [run] : [];
  });
}

export const writeTourRun = (setId: string, uid: string, run: TourRun) =>
  isConfigured ? setDoc(doc(runsRef(setId), uid), run) : Promise.resolve();

/** Records one run to Firestore: writes at start, at most once per interval while running, and at the end. */
export const startTourRunLog = (
  setId: string,
  uid: string,
  start: Parameters<typeof startLog>[2],
  write: (run: TourRun) => Promise<void> = (run) =>
    writeTourRun(setId, uid, run),
  intervalMs = TOUR_RUN_WRITE_INTERVAL_MS
): TourRunLog =>
  startLog(setId, uid, start, write, intervalMs, (err) =>
    logError('tourRuns.write', err, { setId })
  );
