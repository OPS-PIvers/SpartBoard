/**
 * SubmissionsModal — teacher's view of student submissions for a single
 * MiniApp assignment session.
 *
 * Reads `mini_app_sessions/{sessionId}/submissions/*` in real time. Submission
 * doc IDs are opaque — either an opaque per-assignment pseudonym (studentRole
 * launches) or an anonymous Firebase Auth UID (legacy shared-link launches).
 * No PII is persisted; the payload is arbitrary JSON forwarded from the
 * sandboxed mini-app iframe's postMessage.
 *
 * When the session was class-targeted (`classIds` non-empty), we call
 * `getPseudonymsForAssignmentV1` per class to build a pseudonym -> name
 * reverse map in teacher-browser memory so grading shows real names.
 * Unmatched doc IDs (legacy shared-link launches) fall back to the opaque id.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { db } from '@/config/firebase';
import {
  useAssignmentPseudonymsMulti,
  formatStudentName,
} from '@/hooks/useAssignmentPseudonyms';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import type {
  MiniAppBestAttempt,
  MiniAppSession,
  StaffResponseFields,
} from '@/types';
import { staffResultsLabel } from '@/utils/staffAudience';
import {
  MiniAppResultsView,
  type MiniAppAttemptView,
} from './MiniAppResultsView';
import { exportMiniAppResults } from '@/utils/miniAppResultsExport';
import { usePeriodAccess } from '@/hooks/usePeriodAccess';
import { hasPeriodAccess } from '@/utils/periodAccess';
import { PeriodAccessControls } from '@/components/common/sessionViews/PeriodAccessControls';
import { MiniAppSubmissionsMonitor } from './MiniAppSubmissionsMonitor';

interface SubmissionRow extends StaffResponseFields {
  id: string;
  submittedAt: number;
  payload: unknown;
  attemptCount?: number;
  best?: MiniAppBestAttempt | null;
  lastSubmittedAt?: number;
}

interface SubmissionsModalProps {
  sessionId: string;
  assignmentName: string;
  classIds?: string[];
  /** The live session, for the per-period chips. */
  session: MiniAppSession;
  onClose: () => void;
}

export const SubmissionsModal: React.FC<SubmissionsModalProps> = ({
  sessionId,
  assignmentName,
  classIds,
  session,
  onClose,
}) => {
  const { user, orgId, ensureGoogleScope, isExternalUser } = useAuth();
  const { rosters } = useDashboard();
  // No Let in now here: a student shows up only once they submit.
  const perPeriod = hasPeriodAccess(session) && session.status === 'active';
  const periodActions = usePeriodAccess(
    perPeriod ? session : null,
    {
      sessionCollection: 'mini_app_sessions',
      assignmentCollection: 'miniapp_assignments',
      refreshIdle: false,
      assignmentId: session.assignmentId,
    },
    rosters
  );
  const {
    byAssignmentPseudonym: rosterNames,
    loading: namesLoading,
    error: namesError,
  } = useAssignmentPseudonymsMulti(sessionId, classIds ?? null, orgId);
  const [allSubmissions, setSubmissions] = useState<SubmissionRow[]>([]);
  // Staff-audience submissions carry their own name and email.
  const byAssignmentPseudonym = useMemo(() => {
    const staff = allSubmissions.filter((s) => s.staffEmail);
    if (staff.length === 0) return rosterNames;
    const merged = new Map(rosterNames);
    for (const s of staff) {
      merged.set(s.id, {
        givenName: staffResultsLabel(s) ?? '',
        familyName: '',
      });
    }
    return merged;
  }, [allSubmissions, rosterNames]);
  // Submissions carry no class, so a removed class is found by its students' pseudonyms.
  const removedClassIds = session.removedClasses?.classIds ?? null;
  const removedNames = useAssignmentPseudonymsMulti(
    removedClassIds?.length ? sessionId : null,
    removedClassIds,
    orgId
  );
  const submissions = useMemo(() => {
    const removed = removedNames.byAssignmentPseudonym;
    // Without a complete kept-class lookup a shared student could be hidden, so show everyone.
    if (removed.size === 0 || namesLoading || namesError) return allSubmissions;
    return allSubmissions.filter(
      (s) => !removed.has(s.id) || byAssignmentPseudonym.has(s.id)
    );
  }, [
    allSubmissions,
    removedNames.byAssignmentPseudonym,
    byAssignmentPseudonym,
    namesLoading,
    namesError,
  ]);
  const [listLoading, setLoading] = useState(true);
  // Hold the list until both lookups land so a removed class never flashes in.
  const loading =
    listLoading ||
    (!!removedClassIds?.length && (removedNames.loading || namesLoading));
  const [error, setError] = useState<string | null>(null);
  const isV2 = session.resultsVersion === 2;

  useEffect(() => {
    const q = query(
      collection(db, 'mini_app_sessions', sessionId, 'submissions'),
      orderBy('submittedAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSubmissions(
          snap.docs.map((d) => {
            const data = d.data() as Partial<SubmissionRow>;
            return {
              id: d.id,
              submittedAt:
                typeof data.submittedAt === 'number' ? data.submittedAt : 0,
              payload: data.payload,
              attemptCount:
                typeof data.attemptCount === 'number' ? data.attemptCount : 0,
              best: data.best ?? null,
              lastSubmittedAt:
                typeof data.lastSubmittedAt === 'number'
                  ? data.lastSubmittedAt
                  : undefined,
              ...(typeof data.staffEmail === 'string'
                ? { staffEmail: data.staffEmail, staffName: data.staffName }
                : {}),
            };
          })
        );
        setLoading(false);
      },
      (err) => {
        // FirestoreError carries a structured `code` (permission-denied,
        // unavailable, etc.) — more diagnostic than .message under minified
        // builds, and does not leak PII.
        const code =
          err &&
          typeof err === 'object' &&
          'code' in err &&
          typeof (err as { code?: unknown }).code === 'string'
            ? (err as { code: string }).code
            : 'unknown';
        console.error('[SubmissionsModal] Failed to load submissions:', code);
        setError('Could not load submissions.');
        setLoading(false);
      }
    );
    return unsub;
  }, [sessionId]);

  const periodControls =
    perPeriod && session.periodAccess ? (
      <PeriodAccessControls
        periodAccess={session.periodAccess}
        actions={periodActions}
        logTag="MiniAppSubmissionsModal.periodAccess"
      />
    ) : undefined;

  if (!isV2) {
    return (
      <MiniAppSubmissionsMonitor
        session={session}
        assignmentName={assignmentName}
        submissions={submissions}
        loading={loading}
        error={error}
        names={byAssignmentPseudonym}
        namesLoading={namesLoading}
        namesError={!!namesError}
        periodActions={perPeriod ? periodActions : undefined}
        orgId={orgId}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="absolute inset-0 z-overlay bg-white">
      {error ? (
        <p className="p-4 text-sm text-brand-red-primary font-medium">
          {error}
        </p>
      ) : loading ? (
        <div className="h-full flex items-center justify-center text-brand-blue-primary">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <MiniAppResultsView
          title={assignmentName}
          rows={submissions.map((s) => ({
            id: s.id,
            name: formatStudentName(byAssignmentPseudonym.get(s.id)) || s.id,
            attemptCount: s.attemptCount ?? 0,
            best: s.best ?? null,
            lastSubmittedAt: s.lastSubmittedAt ?? s.submittedAt,
            doneOnly: !s.attemptCount && isDoneOnly(s.payload),
            ...(!s.attemptCount && !isDoneOnly(s.payload)
              ? { legacyPayload: s.payload }
              : {}),
          }))}
          questions={session.manifest?.questions ?? []}
          attemptLimit={
            typeof session.attemptLimit === 'number'
              ? session.attemptLimit
              : null
          }
          loadAttempts={(rowId) => loadAttempts(sessionId, rowId)}
          onBack={onClose}
          uid={user?.uid}
          onExport={
            isExternalUser
              ? undefined
              : async () => {
                  const token = await ensureGoogleScope('drive.file', {
                    interactive: true,
                  });
                  if (!token)
                    throw new Error(
                      'Google Drive access is required to export. Please sign out and sign in again.'
                    );
                  return exportMiniAppResults(
                    token,
                    assignmentName,
                    submissions.map((s) => ({
                      id: s.id,
                      best: s.best ?? null,
                      lastSubmittedAt: s.lastSubmittedAt ?? s.submittedAt,
                      staffEmail: s.staffEmail,
                      staffName: s.staffName,
                    })),
                    session.manifest?.questions ?? [],
                    byAssignmentPseudonym
                  );
                }
          }
          periodControls={periodControls}
        />
      )}
    </div>
  );
};

const isDoneOnly = (payload: unknown): boolean =>
  typeof payload === 'object' &&
  payload !== null &&
  Object.keys(payload).length === 1 &&
  (payload as { completed?: unknown }).completed === true;

function toItem(raw: unknown): NonNullable<MiniAppAttemptView['items']>[0] {
  const it = (raw ?? {}) as Record<string, unknown>;
  return {
    id: typeof it.id === 'string' ? it.id : '',
    answer: it.answer,
    correct: typeof it.correct === 'boolean' ? it.correct : null,
    earned: typeof it.earned === 'number' ? it.earned : 0,
    points: typeof it.points === 'number' ? it.points : 0,
  };
}

async function loadAttempts(
  sessionId: string,
  rowId: string
): Promise<MiniAppAttemptView[]> {
  const snap = await getDocs(
    query(
      collection(
        db,
        'mini_app_sessions',
        sessionId,
        'submissions',
        rowId,
        'attempts'
      ),
      orderBy('attemptNo', 'asc')
    )
  );
  return snap.docs.map((d) => {
    const a = d.data() as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
    return {
      attemptNo: num(a.attemptNo) ?? 0,
      submittedAt: num(a.submittedAt) ?? 0,
      score: num(a.score),
      maxScore: num(a.maxScore),
      gradedBy:
        a.gradedBy === 'server' || a.gradedBy === 'app' ? a.gradedBy : null,
      ...(Array.isArray(a.items) ? { items: a.items.map(toItem) } : {}),
      ...(a.kind === 'legacy' ? { rawPayload: a.payload } : {}),
    };
  });
}
