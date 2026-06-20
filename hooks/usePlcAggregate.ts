/**
 * Live subscription to a PLC's anonymized assessment aggregates (Decisions 6.0
 * + 3.3, §3.6). Each `PlcAssessmentAggregate` is the member-readable,
 * **server-written** rollup for one common assessment, stored at
 * `plcs/{plcId}/aggregates/{assessmentId}` (doc id == the assessment id the
 * `aggregatePlcAssessment` Cloud Function keyed it under). Members read these
 * small docs instead of every teacher's raw `PlcContribution` — this is the
 * FERPA fix (no student names / per-student rows) AND the Meeting-Mode data
 * spine (one cheap doc, not the unbounded contributions stream).
 *
 * Clients NEVER write aggregates (the rule pins `allow create,update,delete:
 * if false`); this hook is read-only.
 *
 * Mirrors the other `usePlc*` subcollection hooks:
 *   - Back-compat (Decision 1.4): reads the deduped `aggregates` slice from a
 *     mounted `PlcProvider` when present, else opens its own `onSnapshot`.
 *   - Parser is tolerant of `serverTimestamp()`-backed `ranAt` AND legacy
 *     plain-number values during rollout (`tsToMillis`), and defensively drops
 *     a doc whose nested arrays are malformed.
 *   - Pass `null` for `plcId` to disable the listener cleanly.
 *
 * Two views are exposed: the full list (`aggregates`, ordered by `assessmentId`
 * for a stable render order) and an `aggregatesById` map for the common
 * "render the rollup for THIS assessment" lookup Meeting Mode + Shared Data
 * need.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { PlcAssessmentAggregate } from '@/types';
import { logError } from '@/utils/logError';
import { tsToMillis } from '@/utils/plc';
import { usePlcSubcollection } from '@/context/usePlcContext';

const PLCS_COLLECTION = 'plcs';
const AGGREGATES_SUBCOLLECTION = 'aggregates';

interface UsePlcAggregatesResult {
  /** All aggregates for the PLC, ordered by `assessmentId` (stable order). */
  aggregates: PlcAssessmentAggregate[];
  /** Lookup by `assessmentId` — the map Meeting Mode / Shared Data read. */
  aggregatesById: Record<string, PlcAssessmentAggregate>;
  loading: boolean;
  /**
   * Snapshot subscription error. Non-null means the empty list is "couldn't
   * load," not "no aggregates yet" (a brief state while the function first
   * runs). Standardized on `Error | null` (Decision 1.4).
   */
  error: Error | null;
}

/**
 * Parse one nested `perQuestion` entry, or `null` if malformed. A single bad
 * entry rejects the whole aggregate doc (rather than silently dropping a
 * question) so a partially-parsed rollup never renders as if it were complete.
 */
function parsePerQuestion(
  q: unknown
): PlcAssessmentAggregate['perQuestion'][number] | null {
  if (!q || typeof q !== 'object') return null;
  const rec = q as Record<string, unknown>;
  if (
    typeof rec.questionId !== 'string' ||
    typeof rec.text !== 'string' ||
    typeof rec.correctPercent !== 'number' ||
    typeof rec.points !== 'number'
  ) {
    return null;
  }
  return {
    questionId: rec.questionId,
    text: rec.text,
    correctPercent: rec.correctPercent,
    points: rec.points,
  };
}

/**
 * Parse one nested `perTeacher` entry, or `null` if malformed. Anonymized by
 * contract: carries `studentCount` but never student names or per-student rows
 * (the function never emits them). A single bad entry rejects the whole doc.
 */
function parsePerTeacher(
  t: unknown
): PlcAssessmentAggregate['perTeacher'][number] | null {
  if (!t || typeof t !== 'object') return null;
  const rec = t as Record<string, unknown>;
  if (
    typeof rec.teacherUid !== 'string' ||
    typeof rec.teacherName !== 'string' ||
    typeof rec.classCount !== 'number' ||
    typeof rec.averagePercent !== 'number' ||
    typeof rec.studentCount !== 'number'
  ) {
    return null;
  }
  return {
    teacherUid: rec.teacherUid,
    teacherName: rec.teacherName,
    classCount: rec.classCount,
    averagePercent: rec.averagePercent,
    studentCount: rec.studentCount,
  };
}

/**
 * Parse a Firestore aggregate doc into the typed `PlcAssessmentAggregate`, or
 * `null` if a required scalar is malformed or any nested entry is bad (the doc
 * is dropped, not partially parsed — a half-rollup would render misleading
 * numbers). The doc `id` is authoritative for `assessmentId` (the function keys
 * the doc on the canonical assessment id). `ranAt` tolerates the
 * `serverTimestamp()`-resolved Timestamp, legacy plain millis, and an
 * unresolved pending sentinel (→ 0, the "updating…" window) via `tsToMillis`.
 */
export function parsePlcAggregate(
  id: string,
  data: Record<string, unknown>
): PlcAssessmentAggregate | null {
  if (
    typeof data.schemaVersion !== 'number' ||
    typeof data.teacherCount !== 'number' ||
    typeof data.studentCount !== 'number' ||
    typeof data.teamAveragePercent !== 'number' ||
    !Array.isArray(data.perQuestion) ||
    !Array.isArray(data.perTeacher)
  ) {
    return null;
  }
  const perQuestion: PlcAssessmentAggregate['perQuestion'] = [];
  for (const raw of data.perQuestion as unknown[]) {
    const parsed = parsePerQuestion(raw);
    if (!parsed) return null;
    perQuestion.push(parsed);
  }
  const perTeacher: PlcAssessmentAggregate['perTeacher'] = [];
  for (const raw of data.perTeacher as unknown[]) {
    const parsed = parsePerTeacher(raw);
    if (!parsed) return null;
    perTeacher.push(parsed);
  }
  return {
    // The doc id is the canonical assessment id; prefer it over a (redundant)
    // stored `assessmentId` so a mismatch can't desync the by-id lookup.
    assessmentId: id,
    schemaVersion: data.schemaVersion,
    teacherCount: data.teacherCount,
    studentCount: data.studentCount,
    teamAveragePercent: data.teamAveragePercent,
    perQuestion,
    perTeacher,
    ranAt: tsToMillis(data.ranAt),
  };
}

/** Stable ordering for the list view — by `assessmentId` so renders don't churn. */
function sortAggregates(
  list: PlcAssessmentAggregate[]
): PlcAssessmentAggregate[] {
  return [...list].sort((a, b) => a.assessmentId.localeCompare(b.assessmentId));
}

/** Build the by-id lookup map from the ordered list. */
function indexAggregates(
  list: PlcAssessmentAggregate[]
): Record<string, PlcAssessmentAggregate> {
  const map: Record<string, PlcAssessmentAggregate> = {};
  for (const agg of list) map[agg.assessmentId] = agg;
  return map;
}

/**
 * Live subscription to a single PLC's anonymized assessment aggregates. Pass
 * `null` for `plcId` to disable the listener. Mirrors `usePlcContributions` —
 * same parser-drops-malformed defense, same render-time `prevPlcId` reset, and
 * the same provider back-compat bridge. The aggregates collection is read-only
 * for clients; no mutators are returned.
 */
export function usePlcAggregate(plcId: string | null): UsePlcAggregatesResult {
  const { user } = useAuth();
  // Back-compat (Decision 1.4): read from a mounted PlcProvider when present.
  const fromProvider = usePlcSubcollection(plcId, (s) => s.aggregates);
  const [aggregates, setAggregates] = useState<PlcAssessmentAggregate[]>([]);
  const [loading, setLoading] = useState<boolean>(plcId !== null);
  const [error, setError] = useState<Error | null>(null);

  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setAggregates([]);
    setLoading(plcId !== null);
    setError(null);
  }

  useEffect(() => {
    // Provider owns the listener for this plcId — skip the standalone one.
    if (fromProvider) return;
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setAggregates([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const ref = collection(
      db,
      PLCS_COLLECTION,
      plcId,
      AGGREGATES_SUBCOLLECTION
    );
    // No `orderBy` on the query — `ranAt` is serverTimestamp()-backed and a
    // freshly written doc would be ordered after the timestamp resolves; we sort
    // by `assessmentId` client-side for a stable render order instead.
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const list: PlcAssessmentAggregate[] = [];
        snap.forEach((d) => {
          const parsed = parsePlcAggregate(
            d.id,
            d.data() as Record<string, unknown>
          );
          if (parsed) list.push(parsed);
        });
        setAggregates(sortAggregates(list));
        setLoading(false);
        setError(null);
      },
      (err) => {
        logError('usePlcAggregate.snapshot', err, { plcId });
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsub();
  }, [plcId, user, fromProvider]);

  const list = fromProvider ? fromProvider.data : aggregates;
  const aggregatesById = useMemo(() => indexAggregates(list), [list]);

  return useMemo(() => {
    if (fromProvider) {
      return {
        aggregates: fromProvider.data,
        aggregatesById,
        loading: fromProvider.loading,
        error: fromProvider.error,
      };
    }
    return { aggregates, aggregatesById, loading, error };
  }, [fromProvider, aggregates, aggregatesById, loading, error]);
}
