import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useSchoologyToolColumnPush } from '@/hooks/useSchoologyToolColumnPush';
import { requestClassroomTeacherToken } from '@/components/classroomAddon/gisOAuth';
import {
  GRADE_PUSH_GENERIC_ERROR_MESSAGE,
  PUSH_PERMISSION_DENIED_MESSAGE,
  TOKEN_CANCELLED_MESSAGE,
  hasValidMaxPoints,
  runClassroomGradePush,
  MISSING_MAX_POINTS_MESSAGE,
} from '@/utils/runClassroomGradePush';
import { formatGradePushToast } from '@/utils/classroomGradePush';
import {
  bucketLtiPushResults,
  formatLtiPushToast,
  ltiPushErrorMessage,
  type LtiPushGradesData,
  type LtiPushGradesRequest,
} from '@/utils/ltiGradePush';
import { GRADEBOOK_SESSION_COLLECTIONS } from '@/utils/gradebook/gradebookCore';
import {
  buildGradebookPushPlan,
  isGradebookPushKind,
  readLmsLink,
  schoologyLinkedTargets,
  schoologyMaxPoints,
  type GradebookLmsLink,
  type GradebookPushPlan,
} from '@/utils/gradebook/lmsPush';
import { logError } from '@/utils/logError';
import type {
  GradebookCellData,
  GradebookColumnRef,
} from '@/components/gradebook/popovers/types';

export interface GradebookPushOutcome {
  ok: boolean;
  message: string;
}

export interface GradebookLmsPush {
  /** Undefined while the session is read; null when the assignment has no LMS link. */
  link: GradebookLmsLink | undefined;
  /** What a push would send right now, or null when there is no usable scale. */
  plan: GradebookPushPlan | null;
  push: () => Promise<GradebookPushOutcome | null>;
  /** The tool-column confirmation dialog, when one is open. */
  dialog: React.ReactNode;
}

const skippedNote = (plan: GradebookPushPlan): string =>
  plan.awaiting > 0 ? ` ${plan.awaiting} awaiting grade skipped.` : '';

/** D22 Push from the column header: final scores to the assignment's Classroom or Schoology link. */
export function useGradebookLmsPush(
  column: GradebookColumnRef,
  cells: GradebookCellData[],
  onToolColumnDone?: (outcome: GradebookPushOutcome) => void
): GradebookLmsPush {
  const { user, canAccessFeature } = useAuth();
  const { rosters } = useDashboard();
  const toolColumnsOn = canAccessFeature('schoology-tool-columns');
  const linkedTargets = useMemo(
    () => (toolColumnsOn ? schoologyLinkedTargets(rosters) : null),
    [toolColumnsOn, rosters]
  );
  const pushable = isGradebookPushKind(column.kind);
  const [loaded, setLoaded] = useState<{
    sessionId: string;
    link: GradebookLmsLink;
  } | null>(null);

  useEffect(() => {
    if (!pushable || !user?.uid) return;
    let cancelled = false;
    getDoc(
      doc(db, GRADEBOOK_SESSION_COLLECTIONS[column.kind], column.sessionId)
    )
      .then((snap) => {
        if (cancelled) return;
        setLoaded({
          sessionId: column.sessionId,
          link: readLmsLink(snap.exists() ? snap.data() : null, linkedTargets),
        });
      })
      .catch((err: unknown) => {
        logError('gradebook.lmsLink', err, { sessionId: column.sessionId });
        if (!cancelled) setLoaded({ sessionId: column.sessionId, link: null });
      });
    return () => {
      cancelled = true;
    };
  }, [pushable, user?.uid, column.kind, column.sessionId, linkedTargets]);

  let link: GradebookLmsLink | undefined = !pushable
    ? null
    : loaded?.sessionId === column.sessionId
      ? loaded.link
      : undefined;
  if (link?.lms === 'classroom' && !canAccessFeature('google-classroom')) {
    link = null;
  }

  const classroomAttachments =
    link?.lms === 'classroom'
      ? link.attachments.filter((a) => hasValidMaxPoints(a.maxPoints))
      : [];
  const maxPoints =
    link?.lms === 'classroom'
      ? (classroomAttachments[0]?.maxPoints ?? null)
      : link?.lms === 'schoology'
        ? schoologyMaxPoints(cells, column.config)
        : null;
  const plan =
    maxPoints !== null && maxPoints > 0
      ? buildGradebookPushPlan(cells, maxPoints)
      : null;

  const toolColumn = useSchoologyToolColumnPush({
    sessionId: column.sessionId,
    kind: column.kind === 'video-activity' ? 'va' : 'quiz',
    title: column.title,
    buildPayload: () =>
      Promise.resolve(
        plan && maxPoints !== null
          ? {
              maxPoints,
              grades: [
                ...plan.entries,
                ...plan.missing.map((uid) => ({
                  pseudonymUid: uid,
                  missing: true as const,
                })),
              ],
            }
          : null
      ),
    onDone: (message, ok) => onToolColumnDone?.({ ok, message }),
  });

  const push = async (): Promise<GradebookPushOutcome | null> => {
    if (!link) return null;
    if (!plan || maxPoints === null) {
      return {
        ok: false,
        message:
          link.lms === 'classroom'
            ? MISSING_MAX_POINTS_MESSAGE
            : 'This assignment has no point total to push against.',
      };
    }
    if (link.lms === 'schoology' && link.mode === 'tool-column') {
      // The hook reports through onToolColumnDone, after any confirmation.
      await toolColumn.start();
      return null;
    }
    if (link.lms === 'schoology') {
      try {
        const call = httpsCallable<LtiPushGradesRequest, LtiPushGradesData>(
          functions,
          'ltiPushGradesForAssignmentV1'
        );
        const { data } = await call({
          sessionId: column.sessionId,
          kind: column.kind === 'video-activity' ? 'va' : 'quiz',
          maxPoints,
          grades: plan.entries,
        });
        const bucket = bucketLtiPushResults(data);
        return {
          ok: bucket.failed === 0,
          message: formatLtiPushToast(bucket) + skippedNote(plan),
        };
      } catch (err) {
        logError('gradebook.pushSchoology', err, {
          sessionId: column.sessionId,
        });
        return { ok: false, message: ltiPushErrorMessage(err) };
      }
    }
    let outcome: GradebookPushOutcome | null = null;
    await runClassroomGradePush({
      functions,
      attachments: classroomAttachments.map((a) => ({
        courseId: a.courseId,
        itemId: a.itemId,
        attachmentId: a.attachmentId,
        maxPoints: a.maxPoints,
      })),
      requestToken: () =>
        requestClassroomTeacherToken(user?.email ?? undefined),
      buildGrades: () => plan.entries,
      distinctTokenCancel: true,
      logTag: 'gradebook.pushClassroom',
      logContext: { sessionId: column.sessionId },
      onStatus: (status) => {
        if (status.phase === 'token-cancelled') {
          outcome = { ok: false, message: TOKEN_CANCELLED_MESSAGE };
        } else if (status.phase === 'pushed') {
          const unreachable = status.unreachableCourses ?? 0;
          outcome = {
            ok: unreachable === 0 && status.data.failed === 0,
            message:
              formatGradePushToast(status.data) +
              (unreachable > 0
                ? ` Couldn't push to ${unreachable} course${unreachable === 1 ? '' : 's'}. Try again.`
                : '') +
              skippedNote(plan),
          };
        } else if (status.phase === 'nothing-to-push') {
          outcome = { ok: true, message: 'No final scores to push yet.' };
        }
      },
      onError: ({ permissionDenied }) => {
        outcome = {
          ok: false,
          message: permissionDenied
            ? PUSH_PERMISSION_DENIED_MESSAGE
            : GRADE_PUSH_GENERIC_ERROR_MESSAGE,
        };
      },
    });
    return outcome;
  };

  return { link, plan, push, dialog: toolColumn.dialog };
}
