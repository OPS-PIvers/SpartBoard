/**
 * Live-subscribe to the CALLER'S OWN contributions in a PLC — the
 * Firestore-native replacement for `quizDriveService.readPlcSheet`.
 *
 * OWNER-SCOPED READ (Wave 3 — FERPA boundary, PRD §3.6 step 2 / §9 PII
 * risk). A contribution's `responses[]` embed raw `studentDisplayName`
 * PII, so the `contributions` read rule is owner-only
 * (`request.auth.uid == resource.data.teacherUid`). Firestore evaluates a
 * listener against the QUERY CONSTRAINTS holistically, NOT per document:
 * an unconstrained listen over a collection that also contains teammates'
 * docs is rejected wholesale with permission-denied — even for the owning
 * teacher, because her unfiltered query still *matches* her teammates'
 * docs. Therefore this hook pins `where('teacherUid','==', uid)` so the
 * query only matches the caller's own docs and satisfies the rule.
 *
 * Cross-teacher rollups are NEVER read raw here — they come from the
 * anonymized, PII-free `/aggregates` sibling (`usePlcAggregate`). This
 * hook backs the owner's self-roster and the "updating…" lag flag.
 *
 * The hook only subscribes when `plcId` is non-null AND the user is
 * signed in; passing `null` (or being signed out) disables the listener
 * cleanly so callers can call the hook unconditionally even when the PLC
 * linkage is absent.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { logError } from '@/utils/logError';
import type {
  PlcContribution,
  PlcContributionQuestion,
  PlcContributionResponse,
} from '@/types';
import { usePlcSubcollection } from '@/context/usePlcContext';

interface UsePlcContributionsResult {
  contributions: PlcContribution[];
  loading: boolean;
  /**
   * Snapshot subscription error. Non-null means the empty `contributions`
   * array is "couldn't load," not "no items yet." Standardized on
   * `Error | null` (Decision 1.4 — error-contract unification) so every
   * `usePlc*` hook surfaces the same shape; consumers read `error.message`
   * for display.
   */
  error: Error | null;
}

/**
 * Parse a single nested question entry. Returns null on any malformed
 * field so the outer parser can reject the whole contribution rather
 * than silently dropping a single bad question (which would change the
 * schema key and mis-group the contribution).
 */
function parseQuestion(q: unknown): PlcContributionQuestion | null {
  if (!q || typeof q !== 'object') return null;
  const rec = q as Record<string, unknown>;
  if (
    typeof rec.id !== 'string' ||
    typeof rec.text !== 'string' ||
    typeof rec.points !== 'number'
  ) {
    return null;
  }
  return { id: rec.id, text: rec.text, points: rec.points };
}

/**
 * Parse a single nested response entry. Returns null on any malformed
 * field so the outer parser can reject the whole contribution rather
 * than silently dropping a row (which would skew the aggregate without
 * any signal).
 */
function parseResponse(r: unknown): PlcContributionResponse | null {
  if (!r || typeof r !== 'object') return null;
  const rec = r as Record<string, unknown>;
  const status =
    rec.status === 'completed' || rec.status === 'in-progress'
      ? rec.status
      : null;
  if (status === null) return null;
  const pointsByQuestionId: Record<string, number> = {};
  if (rec.pointsByQuestionId && typeof rec.pointsByQuestionId === 'object') {
    for (const [qid, val] of Object.entries(
      rec.pointsByQuestionId as Record<string, unknown>
    )) {
      if (typeof val !== 'number') return null;
      pointsByQuestionId[qid] = val;
    }
  }
  return {
    studentDisplayName:
      typeof rec.studentDisplayName === 'string'
        ? rec.studentDisplayName
        : 'Student',
    pin: typeof rec.pin === 'string' ? rec.pin : null,
    classPeriod: typeof rec.classPeriod === 'string' ? rec.classPeriod : '',
    status,
    scorePercent:
      typeof rec.scorePercent === 'number' ? rec.scorePercent : null,
    pointsEarned: typeof rec.pointsEarned === 'number' ? rec.pointsEarned : 0,
    maxPoints: typeof rec.maxPoints === 'number' ? rec.maxPoints : 0,
    tabSwitchWarnings:
      typeof rec.tabSwitchWarnings === 'number' ? rec.tabSwitchWarnings : 0,
    submittedAt: typeof rec.submittedAt === 'number' ? rec.submittedAt : null,
    pointsByQuestionId,
  };
}

/**
 * Parse a Firestore contribution doc into the typed shape PlcTab renders.
 * Returns null and logs if anything fails — the whole doc is rejected
 * rather than partially parsed, because (a) a malformed question silently
 * changes the schema-key sequence and would mis-group the contribution,
 * and (b) a malformed response silently skews the aggregate. Better to
 * drop the doc with a loud log so the next admin investigating "why is
 * X's data missing?" has a breadcrumb.
 *
 * Schema-version mismatches are also a reject — if a future client
 * writes `schemaVersion: 2` with an incompatible shape, parsing it with
 * the v1 parser would produce wrong aggregates without any signal.
 */
export function parseContribution(
  id: string,
  data: Record<string, unknown>
): PlcContribution | null {
  if (
    typeof data.quizId !== 'string' ||
    typeof data.teacherUid !== 'string' ||
    typeof data.teacherName !== 'string' ||
    typeof data.updatedAt !== 'number' ||
    data.schemaVersion !== 1 ||
    !Array.isArray(data.questionsSnapshot) ||
    !Array.isArray(data.responses)
  ) {
    console.warn(
      '[usePlcContributions] dropped malformed contribution doc:',
      id,
      Object.keys(data)
    );
    return null;
  }
  const syncGroupId =
    typeof data.syncGroupId === 'string' ? data.syncGroupId : null;
  const questionsSnapshot: PlcContributionQuestion[] = [];
  for (const raw of data.questionsSnapshot as unknown[]) {
    const parsed = parseQuestion(raw);
    if (!parsed) {
      console.warn(
        '[usePlcContributions] rejected contribution doc — malformed question entry:',
        id
      );
      return null;
    }
    questionsSnapshot.push(parsed);
  }
  const responses: PlcContributionResponse[] = [];
  for (const raw of data.responses as unknown[]) {
    const parsed = parseResponse(raw);
    if (!parsed) {
      console.warn(
        '[usePlcContributions] rejected contribution doc — malformed response entry:',
        id
      );
      return null;
    }
    responses.push(parsed);
  }

  return {
    id,
    schemaVersion: 1,
    quizId: data.quizId,
    syncGroupId,
    teacherUid: data.teacherUid,
    teacherName: data.teacherName,
    questionsSnapshot,
    responses,
    updatedAt: data.updatedAt,
  };
}

export function usePlcContributions(
  plcId: string | null
): UsePlcContributionsResult {
  // Back-compat path (Decision 1.4): when a PlcProvider is mounted for this
  // plcId, read the deduped contributions slice from the provider store
  // instead of opening a second `onSnapshot` listener. `usePlcSubcollection`
  // always runs (hook order) — it returns `null` when no provider is mounted
  // (or it covers a different plcId / hasn't gated this slice on yet), and we
  // fall through to the standalone subscription below (preserving every call
  // site that renders contributions outside the provider, e.g. AttentionCard
  // on Home).
  const fromProvider = usePlcSubcollection(plcId, (s) => s.contributions);
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  // The standalone listener can only run for a signed-in caller (the
  // owner-only read rule keys on `request.auth.uid`); treat a signed-out
  // user the same as "no plcId" so we never open a query that can't satisfy
  // the rule.
  const isActive = plcId !== null && uid !== null;

  const [contributions, setContributions] = useState<PlcContribution[]>([]);
  const [loading, setLoading] = useState<boolean>(isActive);
  const [error, setError] = useState<Error | null>(null);

  // Reset state on plcId/uid transitions using the "adjusting state while
  // rendering" pattern instead of an effect. Doing this in the effect
  // would trip react-hooks/set-state-in-effect for the inactive branch (no
  // external system to subscribe to means setState is the only thing the
  // effect does on that path). Tracking the last-seen key in state lets
  // the comparison happen in render, where setState during reconciliation
  // is the React-blessed way to derive state from props.
  const resetKey = `${plcId ?? ''}:${uid ?? ''}`;
  const [lastSeenKey, setLastSeenKey] = useState<string>(resetKey);
  if (resetKey !== lastSeenKey) {
    setLastSeenKey(resetKey);
    setContributions([]);
    setLoading(isActive);
    setError(null);
  }

  useEffect(() => {
    // Provider owns the listener for this plcId — skip the standalone one.
    // Also skip when signed out (no uid to scope the owner-only query to).
    if (!plcId || !uid || fromProvider) return;
    // Owner-scoped: pin `teacherUid == uid` so the listener query satisfies
    // the owner-only read rule (an unconstrained listen would be rejected
    // wholesale with permission-denied in any multi-teacher PLC).
    const ref = collection(db, 'plcs', plcId, 'contributions');
    const unsub = onSnapshot(
      query(ref, where('teacherUid', '==', uid)),
      (snap) => {
        const next: PlcContribution[] = [];
        snap.forEach((d) => {
          const parsed = parseContribution(
            d.id,
            d.data() as Record<string, unknown>
          );
          if (parsed) next.push(parsed);
        });
        setContributions(next);
        setLoading(false);
        // Clear any prior error so a transient network blip doesn't pin
        // the red "Couldn't load PLC results" banner forever once the
        // listener recovers. Without this, the next successful snapshot
        // silently arrived but the banner stayed.
        setError(null);
      },
      (err) => {
        // Permission-denied is expected if the caller leaves the PLC
        // mid-session — surface the error but don't blow up the UI.
        logError('usePlcContributions.snapshot', err, { plcId, uid });
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      }
    );
    return () => unsub();
  }, [plcId, uid, fromProvider]);

  return useMemo(() => {
    if (fromProvider) {
      return {
        contributions: fromProvider.data,
        loading: fromProvider.loading,
        error: fromProvider.error,
      };
    }
    return { contributions, loading, error };
  }, [fromProvider, contributions, loading, error]);
}
