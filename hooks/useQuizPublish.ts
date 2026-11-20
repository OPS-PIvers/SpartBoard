import type {
  QuizAssignment,
  QuizData,
  QuizMetadata,
  QuizResponse,
  QuizSession,
  ResultsProtection,
  Toast,
  WrittenReturnMode,
} from '@/types';
import type { AuthContextType } from '@/context/AuthContextValue';
import type { DashboardContextValue } from '@/context/DashboardContextValue';
import type { UseQuizAssignmentsResult } from '@/hooks/useQuizAssignments';
import type { PublishScoresVisibility } from '@/components/common/library/PublishScoresModal';
import { runBulkPublish } from '@/components/common/library/assigned/bulkPublish';
import { requestClassroomFinalGradeToken } from '@/components/classroomAddon/gisOAuth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '@/config/firebase';
import { QUIZ_SESSIONS_COLLECTION } from '@/hooks/quizSession/collections';
import {
  buildQuizClassroomGradeEntries,
  type ClassroomGradeEntry,
} from '@/utils/classroomGradePush';
import { loadFinalScoreOverlay } from '@/hooks/gradebook/useFinalScoreOverlay';
import { applyFinalScoresToEntries } from '@/utils/gradebook/finalScoreOverlay';
import { quizLiveRaw } from '@/utils/gradebook/liveRawScores';
import {
  fibGradingFromAssignment,
  type FibGradingContext,
} from '@/utils/quizFibAnswers';
import { getClassroomAttachments } from '@/utils/classroomAttachments';
import { hasValidMaxPoints } from '@/utils/runClassroomGradePush';
import { quizMaxPoints } from '@/utils/quizMaxPoints';
import { sessionSectionsFor } from '@/utils/quizSections';
import { runPublishGradePush } from '@/utils/publishGradePush';
import { logError } from '@/utils/logError';

interface UseQuizPublishArgs {
  user: AuthContextType['user'];
  quizzes: QuizMetadata[];
  addToast: DashboardContextValue['addToast'];
  canAccessFeature: AuthContextType['canAccessFeature'];
  canAssignToClassroom: boolean;
  paperSheets: { enabled: boolean };
  updateAppSettings: AuthContextType['updateAppSettings'];
  loadAnswerKeyQuizQuietly: (
    meta: QuizMetadata,
    assignment: Pick<
      QuizAssignment,
      'resolvedDriveFileId' | 'frozenDriveFileId'
    >
  ) => Promise<QuizData | null>;
  deactivateAssignment: UseQuizAssignmentsResult['deactivateAssignment'];
  publishAssignmentScores: UseQuizAssignmentsResult['publishAssignmentScores'];
  unpublishAssignmentScores: UseQuizAssignmentsResult['unpublishAssignmentScores'];
  publishingAssignment: QuizAssignment | null;
  setPublishingAssignment: (a: QuizAssignment | null) => void;
  bulkPublishing: QuizAssignment[] | null;
  setBulkPublishing: (a: QuizAssignment[] | null) => void;
  publishEndsAssignment: boolean;
}

// Fresh handlers every render, as the inline JSX props and modal callback they replace were.
export const useQuizPublish = ({
  user,
  quizzes,
  addToast,
  canAccessFeature,
  canAssignToClassroom,
  paperSheets,
  updateAppSettings,
  loadAnswerKeyQuizQuietly,
  deactivateAssignment,
  publishAssignmentScores,
  unpublishAssignmentScores,
  publishingAssignment,
  setPublishingAssignment,
  bulkPublishing,
  setBulkPublishing,
  publishEndsAssignment,
}: UseQuizPublishArgs) => {
  // Publishes one assignment; throws on failure, false when the answer-key loader already said why.
  const publishQuizScoresFor = async (
    target: QuizAssignment,
    visibility: PublishScoresVisibility,
    protection: ResultsProtection | undefined,
    writtenReturnMode: WrittenReturnMode | undefined,
    {
      quiet,
      token,
      endsAssignment = false,
      toast = addToast,
    }: {
      quiet: boolean;
      token?: string | null;
      endsAssignment?: boolean;
      toast?: (message: string, type?: Toast['type']) => void;
    }
  ): Promise<boolean> => {
    const publishFibGrading: FibGradingContext =
      fibGradingFromAssignment(target);
    if (visibility === 'none') {
      await unpublishAssignmentScores(target.id);
      if (!quiet) toast('Scores unpublished.', 'success');
      return true;
    }
    // Publish = Push: if this assignment is linked to Google Classroom,
    // pre-mint the final-grade token NOW (this click is a user gesture)
    // so the GIS popup isn't blocked after publish's awaits. A dismissed
    // popup leaves the token null → publish still proceeds, GC push is
    // skipped. (Schoology pushes server-side and needs no token.)
    // Only partner-first attachments (SpartBoard owns the courseWork)
    // with the feature enabled are eligible for the FINAL push — this
    // also keeps the restricted classroom.coursework.students scope
    // request behind the flag.
    // Eligible = partner-first attachments (SpartBoard owns the
    // courseWork) with a valid scale, when the feature is on. One per
    // linked course (multi-course fan-out).
    const classroomFinalAttachments = canAssignToClassroom
      ? getClassroomAttachments(target).filter(
          (a) => a.ownsCourseWork && hasValidMaxPoints(a.maxPoints)
        )
      : [];
    let classroomToken: string | null = token ?? null;
    if (token === undefined && classroomFinalAttachments.length > 0) {
      try {
        classroomToken = await requestClassroomFinalGradeToken(
          user?.email ?? undefined
        );
      } catch {
        classroomToken = null;
      }
    }
    const meta = quizzes.find((q) => q.id === target.quizId);
    if (!meta)
      throw new Error(
        'Quiz is no longer in your library — cannot publish scores.'
      );
    const data = await loadAnswerKeyQuizQuietly(meta, target);
    if (!data) return false;
    if (endsAssignment && target.status !== 'inactive') {
      await deactivateAssignment(target.id);
    }
    const result = await publishAssignmentScores(
      target.id,
      data,
      visibility,
      protection,
      writtenReturnMode
    );
    if (!quiet)
      toast(
        result.responsesUpdated > 0
          ? `Scores published to ${result.responsesUpdated} student${result.responsesUpdated === 1 ? '' : 's'}.`
          : 'Scores published. Students will see results once they submit.',
        'success'
      );
    // Paper administrations have no class channel; pointers make
    // the published result reachable from My Assignments (Q34).
    // The grading pass counts paper rows too, covering imports
    // that predate the assignment flag.
    if (
      paperSheets.enabled &&
      (target.hasPaperResponses || result.paperResponses > 0)
    ) {
      try {
        const link = httpsCallable<
          { assignmentId: string },
          {
            pointersWritten: number;
            unlinked: number;
            unplaced: number;
          }
        >(functions, 'publishPaperResultsV1');
        const linked = (await link({ assignmentId: target.id })).data;
        if (linked.unlinked > 0) {
          toast(
            `${linked.unlinked} paper response${linked.unlinked === 1 ? ' has' : 's have'} no student login to link to; those students can see results only from your view.`,
            'info'
          );
        }
        if (linked.unplaced > 0) {
          toast(
            `${linked.unplaced} paper response${linked.unplaced === 1 ? ' belongs' : 's belong'} to a student whose roster has no class link yet; sync the roster and publish again to reach them.`,
            'info'
          );
        }
      } catch (err) {
        logError('QuizWidget.publishPaperResults', err, {
          assignmentId: target.id,
        });
        toast(
          'Scores published, but paper results could not be linked to student accounts.',
          'error'
        );
      }
    }
    const finalOverlay = await loadFinalScoreOverlay(
      {
        kind: 'quiz',
        sessionId: target.id,
        teacherUid: user?.uid,
        uid: user?.uid,
      },
      canAccessFeature('gradebook')
    );
    const withFinal = (
      entries: ClassroomGradeEntry[],
      responses: QuizResponse[],
      maxPoints: number
    ) => {
      if (!finalOverlay) return entries;
      const byUid = new Map(responses.map((r) => [r.studentUid, r]));
      return applyFinalScoresToEntries(
        entries,
        maxPoints,
        finalOverlay,
        (uid) => {
          const r = byUid.get(uid);
          return r
            ? quizLiveRaw(r, data.questions, publishFibGrading, pushPaperIds)
            : null;
        },
        Date.now()
      );
    };
    // The session's bank slots count each draw once, not the whole pool.
    const pushSession = await getDoc(
      doc(db, QUIZ_SESSIONS_COLLECTION, target.id)
    )
      .then((snap) => snap.data() as QuizSession | undefined)
      .catch(() => undefined);
    // Fall back to the assignment's mirror when the session read fails.
    const pushPaperIds =
      pushSession?.paperWrittenQuestionIds ?? target.paperWrittenQuestionIds;
    const pushMaxPoints = quizMaxPoints(
      data.questions,
      pushSession?.sections ?? sessionSectionsFor(data),
      pushSession?.bankSlots
    );
    // Chain the LMS grade push(es) — never throws (publish already
    // committed; a push failure is its own toast).
    await runPublishGradePush<QuizResponse>({
      functions,
      addToast: toast,
      kind: 'quiz',
      sessionId: target.id,
      classroomFinalAttachments,
      classroomToken,
      schoologyMaxPoints: pushMaxPoints,
      buildClassroomGrades: (responses) => {
        // All attachments share the assignment's maxPoints.
        const mp = classroomFinalAttachments[0]?.maxPoints;
        return mp != null
          ? withFinal(
              buildQuizClassroomGradeEntries(
                responses,
                data.questions,
                mp,
                publishFibGrading,
                pushPaperIds
              ),
              responses,
              mp
            )
          : [];
      },
      buildSchoologyGrades: (responses) => {
        const mp = pushMaxPoints;
        return withFinal(
          buildQuizClassroomGradeEntries(
            responses,
            data.questions,
            mp,
            publishFibGrading,
            pushPaperIds
          ),
          responses,
          mp
        );
      },
    });
    return true;
  };
  const saveLastProtection = async (protection?: ResultsProtection) => {
    // Persist the teacher's last protection choice so the next
    // publish dialog opens pre-filled. Best-effort — this is a UI
    // preference, not part of the publish contract. Kept out of the
    // publish try/catch so a preference-save failure does NOT
    // surface as "Failed to publish scores" (the publish already
    // succeeded, and re-publishing on perceived failure would
    // double the Firestore write cost on PLC-shared assignments
    // with hundreds of responses).
    if (protection) {
      try {
        await updateAppSettings({
          lastResultsProtection: protection,
        });
      } catch (err) {
        logError('QuizWidget.updateAppSettings.lastProtection', err);
      }
    }
  };
  const publishTargets: QuizAssignment[] = publishingAssignment
    ? [publishingAssignment]
    : (bulkPublishing ?? []);
  const closePublish = () => {
    setPublishingAssignment(null);
    setBulkPublishing(null);
  };
  const onConfirmPublish = async (
    visibility: PublishScoresVisibility,
    protection?: ResultsProtection,
    writtenReturnMode?: WrittenReturnMode
  ) => {
    if (publishingAssignment) {
      const target = publishingAssignment;
      try {
        if (
          await publishQuizScoresFor(
            target,
            visibility,
            protection,
            writtenReturnMode,
            { quiet: false, endsAssignment: publishEndsAssignment }
          )
        )
          setPublishingAssignment(null);
        else return;
      } catch (err) {
        logError('QuizWidget.publishAssignmentScores', err, {
          assignmentId: target.id,
          visibility,
        });
        addToast(
          err instanceof Error ? err.message : 'Failed to publish scores',
          'error'
        );
        return;
      }
      await saveLastProtection(protection);
      return;
    }
    const targets = publishTargets;
    const ok = await runBulkPublish({
      targets,
      unpublish: visibility === 'none',
      mintToken:
        canAssignToClassroom &&
        targets.some((t) =>
          getClassroomAttachments(t).some(
            (a) => a.ownsCourseWork && hasValidMaxPoints(a.maxPoints)
          )
        )
          ? () => requestClassroomFinalGradeToken(user?.email ?? undefined)
          : undefined,
      publishOne: (t, token, toast) =>
        publishQuizScoresFor(
          t,
          visibility,
          protection,
          t.hasPaperWritten ? writtenReturnMode : undefined,
          {
            quiet: true,
            token,
            toast,
          }
        ),
      addToast,
      logKey: 'QuizWidget.bulkPublishScores',
    });
    closePublish();
    if (ok > 0) await saveLastProtection(protection);
  };
  const onUnpublishScores = async (a: QuizAssignment) => {
    // One-click unpublish — `unpublishAssignmentScores` is a
    // cheap two-write batch (no Drive lookup, no grading).
    try {
      await unpublishAssignmentScores(a.id);
      addToast('Scores unpublished.', 'success');
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : 'Failed to unpublish scores',
        'error'
      );
    }
  };

  return {
    publishQuizScoresFor,
    saveLastProtection,
    publishTargets,
    closePublish,
    onConfirmPublish,
    onUnpublishScores,
  };
};
