import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { WrittenAnswerGrade } from '@/types';
import { logError } from '@/utils/logError';

export type GradeWriteStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface FailedGradeWrite {
  responseKey: string;
  targetKey: string;
  studentName: string;
  error: unknown;
}

export interface GradeWriteQueue {
  /** Latest grade per response+target wins; an in-flight write is followed by a resend. */
  enqueue: (
    responseKey: string,
    targetKey: string,
    grade: WrittenAnswerGrade,
    studentName: string
  ) => void;
  status: GradeWriteStatus;
  failed: FailedGradeWrite[];
  retryAll: () => void;
  /** Resolves with the parked failures once nothing is in flight; pending retries are sent at once. */
  flushAll: () => Promise<FailedGradeWrite[]>;
}

export const DEFAULT_GRADE_WRITE_BACKOFF_MS = [1000, 3000, 9000];
export const SAVED_STATUS_MS = 2000;

interface Entry {
  responseKey: string;
  targetKey: string;
  studentName: string;
  grade: WrittenAnswerGrade;
  attempt: number;
  inFlight: Promise<void> | null;
  /** A newer grade arrived while a write was in flight. */
  dirty: boolean;
  retryTimer: ReturnType<typeof setTimeout> | null;
}

type Writer = (
  responseKey: string,
  targetKey: string,
  grade: WrittenAnswerGrade
) => Promise<void>;

export function useGradeWriteQueue(
  write: Writer,
  backoffMs: number[] = DEFAULT_GRADE_WRITE_BACKOFF_MS
): GradeWriteQueue {
  const writeRef = useRef(write);
  const entries = useRef(new Map<string, Entry>());
  const [inFlightCount, setInFlightCount] = useState(0);
  const [failed, setFailedState] = useState<FailedGradeWrite[]>([]);
  const failedRef = useRef<FailedGradeWrite[]>([]);
  const setFailed = useCallback(
    (update: (prev: FailedGradeWrite[]) => FailedGradeWrite[]) => {
      failedRef.current = update(failedRef.current);
      setFailedState(failedRef.current);
    },
    []
  );
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  // Retries re-enter `send` from a timer, which needs the latest closure.
  const sendRef = useRef<(entry: Entry) => Promise<void>>(() =>
    Promise.resolve()
  );

  useEffect(() => {
    mounted.current = true;
    const map = entries.current;
    return () => {
      mounted.current = false;
      for (const e of map.values()) {
        if (e.retryTimer) clearTimeout(e.retryTimer);
      }
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const send = useCallback(
    (entry: Entry): Promise<void> => {
      if (entry.inFlight) {
        entry.dirty = true;
        return entry.inFlight;
      }
      if (entry.retryTimer) {
        clearTimeout(entry.retryTimer);
        entry.retryTimer = null;
      }
      entry.dirty = false;
      const key = `${entry.responseKey}::${entry.targetKey}`;
      setFailed((prev) =>
        prev.filter(
          (f) =>
            !(
              f.responseKey === entry.responseKey &&
              f.targetKey === entry.targetKey
            )
        )
      );
      setInFlightCount((n) => n + 1);
      const grade = entry.grade;
      const run = writeRef
        .current(entry.responseKey, entry.targetKey, grade)
        .then(() => {
          entry.attempt = 0;
          if (!mounted.current) return;
          if (entry.dirty) return;
          entries.current.delete(key);
          setSavedAt(Date.now());
        })
        .catch((error: unknown) => {
          logError('useGradeWriteQueue', error);
          if (!mounted.current) return;
          // A newer grade supersedes the failed one; it is resent below.
          if (entry.dirty) return;
          const delay = backoffMs[entry.attempt];
          entry.attempt += 1;
          if (delay === undefined) {
            setFailed((prev) => [
              ...prev.filter(
                (f) =>
                  !(
                    f.responseKey === entry.responseKey &&
                    f.targetKey === entry.targetKey
                  )
              ),
              {
                responseKey: entry.responseKey,
                targetKey: entry.targetKey,
                studentName: entry.studentName,
                error,
              },
            ]);
            return;
          }
          entry.retryTimer = setTimeout(() => {
            entry.retryTimer = null;
            void sendRef.current(entry);
          }, delay);
        })
        .finally(() => {
          entry.inFlight = null;
          if (!mounted.current) return;
          setInFlightCount((n) => n - 1);
          if (entry.dirty) void sendRef.current(entry);
        });
      entry.inFlight = run;
      return run;
    },
    [backoffMs, setFailed]
  );
  useLayoutEffect(() => {
    writeRef.current = write;
    sendRef.current = send;
  });

  const enqueue = useCallback<GradeWriteQueue['enqueue']>(
    (responseKey, targetKey, grade, studentName) => {
      const key = `${responseKey}::${targetKey}`;
      const existing = entries.current.get(key);
      if (existing) {
        existing.grade = grade;
        existing.studentName = studentName;
        existing.attempt = 0;
        void send(existing);
        return;
      }
      const entry: Entry = {
        responseKey,
        targetKey,
        studentName,
        grade,
        attempt: 0,
        inFlight: null,
        dirty: false,
        retryTimer: null,
      };
      entries.current.set(key, entry);
      void send(entry);
    },
    [send]
  );

  const retryAll = useCallback(() => {
    for (const e of entries.current.values()) {
      if (e.inFlight) continue;
      e.attempt = 0;
      void send(e);
    }
  }, [send]);

  const flushAll = useCallback(async () => {
    // Loop: a resend after an in-flight write can start a new promise.
    for (let guard = 0; guard < 10; guard++) {
      const pending: Promise<void>[] = [];
      for (const e of entries.current.values()) {
        if (e.inFlight) pending.push(e.inFlight);
        else if (e.retryTimer) {
          // Closing cannot wait out a backoff: one more try, then it parks.
          e.attempt = backoffMs.length;
          pending.push(send(e));
        }
      }
      if (pending.length === 0) break;
      await Promise.allSettled(pending);
    }
    return failedRef.current;
  }, [send, backoffMs]);

  // The "Saved" tick fades on its own.
  useEffect(() => {
    if (savedAt === null) return;
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => {
      savedTimer.current = null;
      setNow(Date.now());
    }, SAVED_STATUS_MS);
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, [savedAt]);

  const status: GradeWriteStatus =
    inFlightCount > 0
      ? 'saving'
      : failed.length > 0
        ? 'error'
        : savedAt !== null && now < savedAt + SAVED_STATUS_MS
          ? 'saved'
          : 'idle';

  return useMemo(
    () => ({ enqueue, status, failed, retryAll, flushAll }),
    [enqueue, status, failed, retryAll, flushAll]
  );
}
