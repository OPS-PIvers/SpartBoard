/**
 * Live-subscribe to a PLC's contribution subcollection — the Firestore-
 * native replacement for `quizDriveService.readPlcSheet`. Callers see
 * every PLC member's contribution to a quiz aggregate in real time, and
 * can group by `syncGroupId` (preferred) or `quizId` (legacy unsynced) to
 * surface "the same logical quiz" across teachers whose local quizIds
 * differ.
 *
 * The hook only subscribes when `plcId` is non-null; passing `null`
 * disables the listener cleanly so callers can call the hook
 * unconditionally even when the PLC linkage is absent.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  PlcContribution,
  PlcContributionQuestion,
  PlcContributionResponse,
} from '@/types';

interface UsePlcContributionsResult {
  contributions: PlcContribution[];
  loading: boolean;
  error: string | null;
}

function parseContribution(
  id: string,
  data: Record<string, unknown>
): PlcContribution | null {
  if (
    typeof data.quizId !== 'string' ||
    typeof data.teacherUid !== 'string' ||
    typeof data.teacherName !== 'string' ||
    typeof data.updatedAt !== 'number' ||
    !Array.isArray(data.questionsSnapshot) ||
    !Array.isArray(data.responses)
  ) {
    // Identity-field parse miss — this contribution disappears from the
    // aggregate entirely. Log so an admin investigating "why is Sarah's
    // data missing from the PLC tab?" has a breadcrumb. Silent filter
    // was masking real bugs (e.g. an older client writing a doc with a
    // mistyped field).
    console.warn(
      '[usePlcContributions] dropped malformed contribution doc:',
      id,
      Object.keys(data)
    );
    return null;
  }
  const syncGroupId =
    typeof data.syncGroupId === 'string' ? data.syncGroupId : null;
  const questionsSnapshot = (data.questionsSnapshot as unknown[])
    .map((q): PlcContributionQuestion | null => {
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
    })
    .filter((q): q is PlcContributionQuestion => q !== null);
  const responses = (data.responses as unknown[])
    .map((r): PlcContributionResponse | null => {
      if (!r || typeof r !== 'object') return null;
      const rec = r as Record<string, unknown>;
      const status =
        rec.status === 'completed' || rec.status === 'in-progress'
          ? rec.status
          : null;
      if (status === null) return null;
      const pointsByQuestionId: Record<string, number> = {};
      if (
        rec.pointsByQuestionId &&
        typeof rec.pointsByQuestionId === 'object'
      ) {
        for (const [qid, val] of Object.entries(
          rec.pointsByQuestionId as Record<string, unknown>
        )) {
          if (typeof val === 'number') pointsByQuestionId[qid] = val;
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
        pointsEarned:
          typeof rec.pointsEarned === 'number' ? rec.pointsEarned : 0,
        maxPoints: typeof rec.maxPoints === 'number' ? rec.maxPoints : 0,
        tabSwitchWarnings:
          typeof rec.tabSwitchWarnings === 'number' ? rec.tabSwitchWarnings : 0,
        submittedAt:
          typeof rec.submittedAt === 'number' ? rec.submittedAt : null,
        pointsByQuestionId,
      };
    })
    .filter((r): r is PlcContributionResponse => r !== null);

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
  const [contributions, setContributions] = useState<PlcContribution[]>([]);
  const [loading, setLoading] = useState<boolean>(plcId !== null);
  const [error, setError] = useState<string | null>(null);

  // Reset state on plcId transitions using the "adjusting state while
  // rendering" pattern instead of an effect. Doing this in the effect
  // would trip react-hooks/set-state-in-effect for the null branch (no
  // external system to subscribe to means setState is the only thing the
  // effect does on that path). Tracking the last-seen plcId in state lets
  // the comparison happen in render, where setState during reconciliation
  // is the React-blessed way to derive state from props.
  const [lastSeenPlcId, setLastSeenPlcId] = useState<string | null>(plcId);
  if (plcId !== lastSeenPlcId) {
    setLastSeenPlcId(plcId);
    setContributions([]);
    setLoading(plcId !== null);
    setError(null);
  }

  useEffect(() => {
    if (!plcId) return;
    const ref = collection(db, 'plcs', plcId, 'contributions');
    const unsub = onSnapshot(
      ref,
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
        // mid-session — surface the message but don't blow up the UI.
        console.error('[usePlcContributions] snapshot error:', err);
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [plcId]);

  return useMemo(
    () => ({ contributions, loading, error }),
    [contributions, loading, error]
  );
}
