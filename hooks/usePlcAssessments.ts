/**
 * Live subscription to a PLC's designated common assessments (Decision 4.0c,
 * §3.6). Each `PlcCommonAssessment` is the first-class object that replaces
 * heuristic title-matching: a team designates ONE assessment per
 * `synced_quizzes` / `synced_video_activities` group, results roll up to its
 * canonical id (`PlcAssessmentAggregate.assessmentId`), and Meeting Mode +
 * Shared Data read that one aggregate instead of every teacher's raw
 * `PlcContribution`.
 *
 * Mirrors the other `usePlc*` subcollection hooks (`usePlcQuizzes`,
 * `usePlcDocs`):
 *   - Back-compat (Decision 1.4): reads the deduped `assessments` slice from a
 *     mounted `PlcProvider` when present, else opens its own `onSnapshot`.
 *   - Returns entries ordered newest-edit-first by `updatedAt`, soft-deleted
 *     entries filtered out of the live list (Decision 3.1 — they live in Trash).
 *   - Parser is tolerant of `serverTimestamp()`-backed Timestamps AND legacy
 *     plain-number time fields during rollout (`tsToMillis`).
 *   - Pass `null` for `plcId` to disable the listener cleanly.
 *
 * The write path (`createAssessment` / `updateAssessment` / `deleteAssessment`
 * / `designateAssessment`) lives on the `PlcProvider` actions surface
 * (`usePlcActions`) — this hook is read-only, matching the contributions hook.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { PlcCommonAssessment } from '@/types';
import { logError } from '@/utils/logError';
import { tsToMillis } from '@/utils/plc';
import { usePlcSubcollection } from '@/context/usePlcContext';

const PLCS_COLLECTION = 'plcs';
const ASSESSMENTS_SUBCOLLECTION = 'assessments';

/** The lifecycle statuses a `PlcCommonAssessment` may carry (rule-pinned). */
const ASSESSMENT_STATUSES: ReadonlySet<PlcCommonAssessment['status']> = new Set<
  PlcCommonAssessment['status']
>(['planning', 'active', 'reviewing', 'closed']);

interface UsePlcAssessmentsResult {
  assessments: PlcCommonAssessment[];
  loading: boolean;
  /**
   * Snapshot subscription error. Non-null means the empty `assessments` array
   * is "couldn't load," not "no items yet." Standardized on `Error | null`
   * (Decision 1.4 — error-contract unification) so every `usePlc*` hook
   * surfaces the same shape.
   */
  error: Error | null;
}

/**
 * Parse a Firestore assessment doc into the typed `PlcCommonAssessment`, or
 * `null` if a required field is missing/malformed (the doc is dropped rather
 * than partially parsed). Tolerant of the two time-field shapes seen during
 * rollout (Decision 1.3): `serverTimestamp()`-resolved Timestamps and legacy
 * plain millis numbers, via `tsToMillis`. `kind` / `status` are pinned to their
 * unions (mirrors the rules' enum gates); `syncGroupId` must be a non-empty
 * string (the canonical-content pointer the aggregator keys on). Optional
 * fields (`unitLabel`, `opensAt`, `dueAt`, `deletedAt`) are carried through only
 * when present and well-typed.
 */
export function parsePlcAssessment(
  id: string,
  data: Record<string, unknown>
): PlcCommonAssessment | null {
  if (
    typeof data.title !== 'string' ||
    (data.kind !== 'quiz' && data.kind !== 'video-activity') ||
    typeof data.syncGroupId !== 'string' ||
    data.syncGroupId.length === 0 ||
    !ASSESSMENT_STATUSES.has(data.status as PlcCommonAssessment['status']) ||
    typeof data.createdBy !== 'string'
  ) {
    return null;
  }
  const assessment: PlcCommonAssessment = {
    id,
    title: data.title,
    kind: data.kind,
    syncGroupId: data.syncGroupId,
    status: data.status as PlcCommonAssessment['status'],
    createdBy: data.createdBy,
    // createdAt / updatedAt are serverTimestamp()-backed on write (Decision
    // 1.3); legacy docs carry plain millis. `tsToMillis` tolerates both and an
    // unresolved pending sentinel (→ 0).
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
  };
  if (typeof data.unitLabel === 'string') {
    assessment.unitLabel = data.unitLabel;
  }
  // opensAt / dueAt: optional nullable ms timestamps. A number passes through
  // as-is; a non-null Timestamp resolves via tsToMillis; an explicit null is
  // preserved (no open/due gate).
  if (typeof data.opensAt === 'number') {
    assessment.opensAt = data.opensAt;
  } else if (data.opensAt === null) {
    assessment.opensAt = null;
  } else if (data.opensAt != null) {
    assessment.opensAt = tsToMillis(data.opensAt);
  }
  if (typeof data.dueAt === 'number') {
    assessment.dueAt = data.dueAt;
  } else if (data.dueAt === null) {
    assessment.dueAt = null;
  } else if (data.dueAt != null) {
    assessment.dueAt = tsToMillis(data.dueAt);
  }
  // Soft-delete tombstone (Decision 3.1): optional so legacy docs parse cleanly;
  // a pending serverTimestamp resolves to 0 (still != null → filtered).
  if (typeof data.deletedAt === 'number') {
    assessment.deletedAt = data.deletedAt;
  } else if (data.deletedAt === null) {
    assessment.deletedAt = null;
  } else if (data.deletedAt != null) {
    assessment.deletedAt = tsToMillis(data.deletedAt);
  }
  return assessment;
}

/**
 * Live subscription to a single PLC's designated common assessments. Returns
 * non-soft-deleted entries ordered newest-edit-first by `updatedAt`. Pass
 * `null` for `plcId` to disable the listener (e.g. while the dashboard is
 * closed). Mirrors `usePlcQuizzes` — same parser-drops-malformed defense, same
 * render-time `prevPlcId` reset so the UI never flashes the previous PLC's
 * entries while the new snapshot is in flight, and the same provider back-compat
 * bridge.
 */
export function usePlcAssessments(
  plcId: string | null
): UsePlcAssessmentsResult {
  const { user } = useAuth();
  // Back-compat (Decision 1.4): read from a mounted PlcProvider when present.
  const fromProvider = usePlcSubcollection(plcId, (s) => s.assessments);
  const [assessments, setAssessments] = useState<PlcCommonAssessment[]>([]);
  const [loading, setLoading] = useState<boolean>(plcId !== null);
  const [error, setError] = useState<Error | null>(null);

  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setAssessments([]);
    setLoading(plcId !== null);
    setError(null);
  }

  useEffect(() => {
    // Provider owns the listener for this plcId — skip the standalone one.
    if (fromProvider) return;
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setAssessments([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const ref = collection(
      db,
      PLCS_COLLECTION,
      plcId,
      ASSESSMENTS_SUBCOLLECTION
    );
    const unsub = onSnapshot(
      query(ref, orderBy('updatedAt', 'desc')),
      (snap) => {
        const list: PlcCommonAssessment[] = [];
        snap.forEach((d) => {
          const parsed = parsePlcAssessment(
            d.id,
            d.data() as Record<string, unknown>
          );
          // Soft-deleted assessments drop out of the live list — they live in
          // Trash until restored or GC'd (Decision 3.1).
          if (parsed && parsed.deletedAt == null) list.push(parsed);
        });
        setAssessments(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logError('usePlcAssessments.snapshot', err, { plcId });
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsub();
  }, [plcId, user, fromProvider]);

  return useMemo(() => {
    if (fromProvider) {
      return {
        assessments: fromProvider.data,
        loading: fromProvider.loading,
        error: fromProvider.error,
      };
    }
    return { assessments, loading, error };
  }, [fromProvider, assessments, loading, error]);
}
