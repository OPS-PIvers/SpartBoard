import type {
  ClassRoster,
  Plc,
  PlcQuizEntry,
  QuizBehaviorSettings,
  QuizData,
  QuizMetadata,
} from '@/types';
import type { BankContent } from '@/utils/questionBanks';
import type { UseQuizAssignmentsResult } from '@/hooks/quizAssignments/types';
import type {
  SetAssignmentTargetsCallInput,
  SetAssignmentTargetsCallResult,
} from '@/hooks/useSetAssignmentTargets';
import type { AssignTargetingValue } from '@/utils/studentTargetRef';
import { resolveQuizAssignContent } from '@/utils/quizAssignBankDraw';
import { quizMaxPoints } from '@/utils/quizMaxPoints';
import { sessionSectionsFor } from '@/utils/quizSections';
import {
  applyAssignTargetsCall,
  buildAssignCreateOptions,
  buildAssignQuizRef,
  buildAssignSettings,
  buildAssignTargetsCall,
  resolveAssignTargeting,
  saveAssignFinalScore,
} from './builders';
import { resolveQuizPlcLinkageForAssign } from './plcLinkage';
import { isDistrictLinkedCopy } from '@/utils/districtLibraryOrigin';

/** The course a Schoology or Classroom launch assigns to. */
export interface AssignCourse {
  /** Shown as the assignment's class label, like "Schoology". */
  className: string;
  classIds: string[];
  rosterIds: string[];
  periodNames: string[];
  classPeriodByClassId: Record<string, string>;
}

export interface AssignFromCourseDeps {
  loadBankContentsForQuiz: (
    quiz: Pick<QuizData, 'bankSlots'>
  ) => Promise<Map<string, BankContent>>;
  saveDriveSnapshot: (quiz: QuizData) => Promise<string>;
  createAssignment: UseQuizAssignmentsResult['createAssignment'];
  setAssignmentTargets: (
    input: SetAssignmentTargetsCallInput
  ) => Promise<SetAssignmentTargetsCallResult>;
  setAssignmentTargetSkippedCount: (
    assignmentId: string,
    count: number
  ) => Promise<void>;
  attachSyncLinkage: (
    quizId: string,
    linkage: { groupId: string; lastSyncedVersion: number }
  ) => Promise<unknown>;
  loadSyncedTranslations: Parameters<
    typeof resolveQuizPlcLinkageForAssign
  >[0]['loadSyncedTranslations'];
}

/** One quiz assign for a Schoology or Classroom launch: the Quiz widget's builders, open from the start. */
export async function assignFromCourse({
  uid,
  meta,
  data,
  behavior,
  targeting,
  dueAt,
  rosters,
  linkedRosterIds,
  course,
  teacherName,
  plc,
  plcLibrary,
  deps,
  notify,
  logScope,
}: {
  uid: string | undefined;
  meta: QuizMetadata;
  data: QuizData;
  behavior: QuizBehaviorSettings;
  /** The modifications and window, with the When step already applied. */
  targeting: AssignTargetingValue;
  dueAt: number | null;
  rosters: ClassRoster[];
  /** The SpartBoard rosters linked to the course, which expand to students. */
  linkedRosterIds: string[];
  course: AssignCourse;
  teacherName: string | undefined;
  /** The PLC the teacher shares results with, if any. */
  plc: Plc | undefined;
  plcLibrary: readonly PlcQuizEntry[];
  deps: AssignFromCourseDeps;
  notify: (message: string, type: 'warning' | 'error') => void;
  logScope: string;
}): Promise<{ assignmentId: string; code: string; maxPoints: number }> {
  const { sessionMode: mode, sessionOptions, attemptLimit } = behavior;
  // A District library copy is read-only, so it never becomes a PLC template.
  const districtCopy = isDistrictLinkedCopy(meta);
  const { plcLinkage, plcPoolSyncGroupId, plcTemplateSyncGroupId } =
    await resolveQuizPlcLinkageForAssign({
      plc: uid ? plc : undefined,
      uid: uid ?? '',
      meta,
      data,
      plcLibrary,
      canPromote: !districtCopy,
      attachSyncLinkage: deps.attachSyncLinkage,
      loadSyncedTranslations: deps.loadSyncedTranslations,
      logScope,
    });
  const content = await resolveQuizAssignContent(data, meta.driveFileId, deps, {
    freeze: true,
  });
  const { warnings, mixedTargeting, resolvedTargeting } =
    resolveAssignTargeting({
      questions: Array.isArray(data.questions) ? data.questions : [],
      assignQuestions: content.questions,
      targeting,
      stepperClasses: undefined,
      rosters,
      rosterIds: linkedRosterIds,
    });
  for (const warning of warnings) notify(warning, 'warning');

  // The grade scale is the points a student can earn, so a 17/20 quiz reads 17/20 in the course.
  const maxPoints = quizMaxPoints(
    content.questions,
    sessionSectionsFor(
      { ...data, questions: content.questions },
      content.bankSlots
    ),
    content.bankSlots
  );

  const plcOptions = {
    plcMode: !!plcLinkage,
    // An empty name stays off the assignment.
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    teacherName: teacherName || undefined,
    ...(course.periodNames.length > 0
      ? { periodNames: course.periodNames }
      : {}),
  };
  const { id: assignmentId, code } = await deps.createAssignment(
    buildAssignQuizRef({
      meta,
      data,
      driveFileId: content.driveFileId,
      questions: content.questions,
      stimuli: content.stimuli,
    }),
    {
      ...buildAssignSettings({
        mode,
        sessionOptions,
        attemptLimit,
        dueAt,
        dueAtByRosterId: undefined,
        plcOptions,
        plcLinkage,
        resolvedDriveFileId: content.resolvedDriveFileId,
        frozenDriveFileId: content.frozenDriveFileId,
      }),
      className: course.className,
    },
    buildAssignCreateOptions({
      mode,
      now: Date.now(),
      stepper: undefined,
      rosters,
      rosterIds: course.rosterIds,
      derived: course,
      periodGate: undefined,
      sessionPeriodAccess: null,
      resolvedTargeting,
      dueAt,
      dueAtByRosterId: undefined,
      sessionBankSlots: content.bankSlots,
      paperWritten: null,
      plcLinkage,
      plcPoolSyncGroupId,
      plcTemplateSyncGroupId,
      districtCopy,
      translationIndex: meta.translations,
      startsActive: true,
    })
  );

  if (uid) saveAssignFinalScore({ uid, assignmentId, behavior, logScope });
  await applyAssignTargetsCall({
    targetsCall: buildAssignTargetsCall({
      assignmentId,
      mixedTargeting,
      resolvedTargeting,
    }),
    setAssignmentTargets: deps.setAssignmentTargets,
    setAssignmentTargetSkippedCount: deps.setAssignmentTargetSkippedCount,
    notify,
    logScope,
    failedMessage:
      'Added for the whole class, but individual student targeting failed to save. Adjust it from the SpartBoard assignment.',
  });
  return { assignmentId, code, maxPoints };
}
