import { doc, type Firestore, type WriteBatch } from 'firebase/firestore';
import type {
  AssignmentAudience,
  AssignmentMode,
  VideoActivityData,
  VideoActivitySession,
  VideoActivitySessionMode,
  VideoActivitySessionOptions,
  VideoActivitySessionSettings,
} from '@/types';
import type { WorkKind } from '@/utils/gradebook/gradebookCore';
import { withPageProtectionGate } from '@/utils/pageProtections';
import { tabAwaySessionFields } from '@/utils/tabAwayLimit';
import { audienceSessionFields } from '@/utils/staffAudience';
import { videoActivityPlayback } from '@/utils/videoActivityClip';
import { initialVideoActivityLiveState } from '@/utils/videoActivityLive';
import {
  splitVideoActivitySessionQuestions,
  VA_KEY_DOC_ID,
  VA_KEY_SUBCOLLECTION,
  type VideoActivitySessionKeyDoc,
} from '@/utils/videoActivityPublicQuestions';
import {
  QUIZ_CONTENT_COLLECTION,
  QUIZ_CONTENT_DOC,
} from '@/utils/quizSessionContent';

export const VIDEO_ACTIVITY_SESSIONS_COLLECTION = 'video_activity_sessions';

/** The schedule a session is created with; per-period sessions keep only `dueAt` and `workKind`. */
export interface VideoActivitySessionWindow {
  openAt?: number | null;
  closeAt?: number | null;
  dueAt?: number | null;
  workKind?: WorkKind;
}

/** Admin gates the session doc honours, read from `canAccessFeature` by the calling hook. */
export interface VideoActivitySessionGates {
  tabAwayTimerOn: boolean;
  pageProtectionsOn: boolean;
  allowAnonymousJoin: boolean;
}

export interface BuildVideoActivitySessionDocInput {
  sessionId: string;
  activity: Pick<
    VideoActivityData,
    'id' | 'title' | 'youtubeUrl' | 'questions' | 'clip' | 'notes'
  >;
  teacherUid: string;
  assignmentName: string;
  settings: VideoActivitySessionSettings;
  sessionOptions?: VideoActivitySessionOptions;
  /** Ignored for a live run, which always starts `waiting`. */
  status: 'active' | 'ended';
  now: number;
  gates: VideoActivitySessionGates;
  mode?: AssignmentMode;
  sessionMode?: VideoActivitySessionMode;
  allowedPins?: string[];
  classIds?: string[];
  periodNames?: string[];
  rosterIds?: string[];
  classPeriodByClassId?: Record<string, string>;
  periodGate?: Pick<VideoActivitySession, 'accessMode' | 'periodAccess'>;
  audience?: AssignmentAudience;
  window?: VideoActivitySessionWindow;
}

export interface VideoActivitySessionDocs {
  session: VideoActivitySession;
  key: VideoActivitySessionKeyDoc;
  /** Per-period sessions keep the student questions here until a period opens. */
  content?: { publicQuestions: VideoActivitySession['publicQuestions'] };
}

/** The only builder for a Video Activity session doc; every assign path goes through it. */
export function buildVideoActivitySessionDoc(
  input: BuildVideoActivitySessionDocInput
): VideoActivitySessionDocs {
  const {
    sessionId,
    activity,
    gates,
    periodGate,
    classIds = [],
    periodNames = [],
    rosterIds = [],
    classPeriodByClassId,
    window = {},
  } = input;
  const isLive = input.sessionMode === 'teacher';
  // Live mode: one answer per question, no require-correct (D10).
  const settings: VideoActivitySessionSettings = isLive
    ? { autoPlay: false, requireCorrectAnswer: false, allowSkipping: true }
    : input.settings;
  const options: VideoActivitySessionOptions | undefined = isLive
    ? {
        ...input.sessionOptions,
        rewindOnIncorrectSeconds: 0,
        pointPenaltyOnIncorrect: 0,
        attemptLimit: 1,
      }
    : input.sessionOptions;
  const status: VideoActivitySession['status'] = isLive
    ? 'waiting'
    : input.status;

  // Dedupes, so a duplicated question id can't inflate "Question X of N".
  const split = splitVideoActivitySessionQuestions(activity.questions);
  const inContent = !!periodGate?.periodAccess;
  // Per-period sessions carry each period's window instead of a shared one.
  const openAt = inContent ? null : (window.openAt ?? null);
  const closeAt = inContent ? null : (window.closeAt ?? null);
  const dueAt = window.dueAt ?? null;

  const session: VideoActivitySession = {
    id: sessionId,
    activityId: activity.id,
    activityTitle: activity.title,
    assignmentName: input.assignmentName,
    teacherUid: input.teacherUid,
    youtubeUrl: activity.youtubeUrl,
    ...videoActivityPlayback(activity),
    ...split.sessionFields,
    ...(inContent
      ? {
          publicQuestions: [],
          questionsInContent: true,
          accessMode: periodGate?.accessMode,
          periodAccess: periodGate?.periodAccess,
        }
      : {}),
    settings,
    status,
    ...(isLive
      ? {
          sessionMode: 'teacher' as const,
          live: initialVideoActivityLiveState(input.now),
        }
      : {}),
    allowedPins: input.allowedPins ?? [],
    allowAnonymousJoin: gates.allowAnonymousJoin,
    createdAt: input.now,
    ...(status === 'ended' ? { endedAt: input.now } : {}),
    // `classId` mirrors `classIds[0]` for rules written before multi-class targeting.
    ...(classIds.length > 0 ? { classIds, classId: classIds[0] } : {}),
    ...(periodNames.length > 0 ? { periodNames } : {}),
    ...(rosterIds.length > 0 ? { rosterIds } : {}),
    ...(classPeriodByClassId && Object.keys(classPeriodByClassId).length > 0
      ? { classPeriodByClassId }
      : {}),
    ...(options || gates.tabAwayTimerOn
      ? {
          sessionOptions: {
            ...withPageProtectionGate(gates.pageProtectionsOn, options ?? {}),
            ...tabAwaySessionFields(gates.tabAwayTimerOn, options ?? {}),
          },
        }
      : {}),
    ...(openAt != null ? { openAt } : {}),
    ...(closeAt != null ? { closeAt } : {}),
    ...(dueAt != null ? { dueAt } : {}),
    ...(window.workKind ? { workKind: window.workKind } : {}),
    mode: input.mode ?? 'submissions',
    ...audienceSessionFields(input.audience),
  };

  return {
    session,
    key: split.key,
    ...(inContent
      ? {
          content: {
            publicQuestions: split.sessionFields.publicQuestions ?? [],
          },
        }
      : {}),
  };
}

/** Adds the session doc, its answer key and any per-period content doc to one batch. */
export function setVideoActivitySessionDocs(
  batch: WriteBatch,
  db: Firestore,
  docs: VideoActivitySessionDocs
): void {
  const id = docs.session.id;
  batch.set(doc(db, VIDEO_ACTIVITY_SESSIONS_COLLECTION, id), docs.session);
  batch.set(
    doc(
      db,
      VIDEO_ACTIVITY_SESSIONS_COLLECTION,
      id,
      VA_KEY_SUBCOLLECTION,
      VA_KEY_DOC_ID
    ),
    docs.key
  );
  if (docs.content)
    batch.set(
      doc(
        db,
        VIDEO_ACTIVITY_SESSIONS_COLLECTION,
        id,
        QUIZ_CONTENT_COLLECTION,
        QUIZ_CONTENT_DOC
      ),
      docs.content
    );
}
