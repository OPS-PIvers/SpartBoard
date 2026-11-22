// One-time reads behind View Student Page's Open: each assignment's student content, read as its teacher.
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  ActivityWallSession,
  ActivityWallSubmission,
  FlashcardSession,
  GuidedLearningSession,
  MiniAppAnswerKey,
  MiniAppManifest,
  ProjectRun,
  VideoActivityQuestion,
  VideoActivitySession,
  WritingAssignmentSession,
} from '@/types';
import type { SessionKind } from '@/hooks/useStudentAssignments';
import { normalizeStudentSession } from '@/hooks/useGuidedLearningSession';
import { loadAssignedStudentView } from '@/utils/quizAssignedStudentViewLoad';
import type { AssignedStudentView } from '@/utils/quizStudentViewSession';
import { QUIZ_CONTENT_DOC } from '@/utils/quizSessionContent';
import { normalizeVideoActivitySession } from '@/utils/videoActivityNormalize';
import {
  VA_KEY_DOC_ID,
  VA_KEY_SUBCOLLECTION,
  type VideoActivitySessionKeyDoc,
} from '@/utils/videoActivityPublicQuestions';
import {
  GL_CONTENT_DOC,
  mergeGuidedLearningSessionContent,
  type GuidedLearningSessionContent,
} from '@/utils/guidedLearningSessionContent';
import {
  MA_CONTENT_DOC,
  mergeMiniAppSessionContent,
  type MiniAppSessionContent,
} from '@/utils/miniAppSessionContent';
import { normalizeMiniAppSession } from '@/utils/miniAppNormalize';
import {
  normalizeActivityWallSession,
  normalizeActivityWallSubmission,
} from '@/utils/activityWallNormalize';
import {
  FC_CONTENT_DOC,
  mergeFlashcardSessionContent,
  type FlashcardSessionContent,
} from '@/utils/flashcardSessionContent';

export type StudentPagePreviewItem =
  | { kind: 'quiz'; view: AssignedStudentView }
  | {
      kind: 'video-activity';
      session: VideoActivitySession;
      key: VideoActivityQuestion[];
    }
  | { kind: 'guided-learning'; session: GuidedLearningSession }
  | {
      kind: 'mini-app';
      title: string;
      html: string;
      manifest: MiniAppManifest;
      answerKey: MiniAppAnswerKey;
    }
  | {
      kind: 'activity-wall';
      session: ActivityWallSession;
      posts: ActivityWallSubmission[];
    }
  | { kind: 'flashcards'; session: FlashcardSession }
  | { kind: 'projects'; run: ProjectRun }
  | { kind: 'writing'; session: WritingAssignmentSession };

const COLLECTIONS: Record<SessionKind, string> = {
  quiz: 'quiz_sessions',
  'video-activity': 'video_activity_sessions',
  'guided-learning': 'guided_learning_sessions',
  'mini-app': 'mini_app_sessions',
  'activity-wall': 'activity_wall_sessions',
  flashcards: 'flashcard_sessions',
  projects: 'project_runs',
  writing: 'writing_assignment_sessions',
};

const readDoc = async (
  kind: SessionKind,
  sessionId: string,
  ...path: string[]
): Promise<Record<string, unknown> | null> => {
  const snap = await getDoc(doc(db, COLLECTIONS[kind], sessionId, ...path));
  return snap.exists() ? snap.data() : null;
};

const readContent = <T>(
  kind: SessionKind,
  sessionId: string,
  inContent: boolean,
  contentDoc: string
): Promise<T | null> =>
  inContent
    ? (readDoc(kind, sessionId, 'content', contentDoc) as Promise<T | null>)
    : Promise.resolve(null);

/** Null when the session is gone. */
export async function loadStudentPagePreviewItem(
  kind: SessionKind,
  sessionId: string
): Promise<StudentPagePreviewItem | null> {
  if (kind === 'quiz') {
    const view = await loadAssignedStudentView(sessionId);
    return view ? { kind, view } : null;
  }
  const data = await readDoc(kind, sessionId);
  if (!data) return null;
  switch (kind) {
    case 'video-activity': {
      const base = normalizeVideoActivitySession(sessionId, data);
      const [content, key] = await Promise.all([
        readContent<{ publicQuestions?: unknown }>(
          kind,
          sessionId,
          base.questionsInContent === true,
          QUIZ_CONTENT_DOC
        ),
        readDoc(kind, sessionId, VA_KEY_SUBCOLLECTION, VA_KEY_DOC_ID),
      ]);
      const session: VideoActivitySession =
        content && Array.isArray(content.publicQuestions)
          ? {
              ...base,
              publicQuestions:
                content.publicQuestions as VideoActivitySession['publicQuestions'],
            }
          : base;
      const questions = (key as VideoActivitySessionKeyDoc | null)?.questions;
      return {
        kind,
        session,
        key: Array.isArray(questions) ? questions : [],
      };
    }
    case 'guided-learning': {
      const raw = { ...data, id: sessionId } as GuidedLearningSession;
      const content = await readContent<GuidedLearningSessionContent>(
        kind,
        sessionId,
        raw.stepsInContent === true,
        GL_CONTENT_DOC
      );
      const merged = mergeGuidedLearningSessionContent(raw, content);
      return {
        kind,
        session: normalizeStudentSession({
          ...merged,
          publicSteps: Array.isArray(merged.publicSteps)
            ? merged.publicSteps
            : [],
        }),
      };
    }
    case 'mini-app': {
      const base = normalizeMiniAppSession(sessionId, data);
      const [content, key] = await Promise.all([
        readContent<MiniAppSessionContent>(
          kind,
          sessionId,
          base.appInContent === true,
          MA_CONTENT_DOC
        ),
        base.resultsVersion
          ? readDoc(kind, sessionId, 'private', 'key')
          : Promise.resolve(null),
      ]);
      const session = mergeMiniAppSessionContent(base, content);
      return {
        kind,
        title: session.appTitle,
        html: session.appHtml ?? '',
        manifest: session.manifest ?? { questions: [] },
        answerKey: (key as MiniAppAnswerKey | null) ?? { questions: {} },
      };
    }
    case 'activity-wall': {
      const session = normalizeActivityWallSession(sessionId, data);
      // Legacy walls (no layout) show students only their own posts unless shared publicly.
      const hidden =
        session.studentsCanSeePosts === false ||
        (!('layout' in data) && data.publiclyShared !== true);
      const posts = hidden
        ? []
        : (
            await getDocs(
              query(
                collection(db, COLLECTIONS[kind], sessionId, 'submissions'),
                where('status', '==', 'approved')
              )
            )
          ).docs.map((d) =>
            normalizeActivityWallSubmission(
              d.id,
              d.data() as Partial<ActivityWallSubmission>
            )
          );
      return { kind, session, posts };
    }
    case 'flashcards': {
      const base = { ...data, id: sessionId } as FlashcardSession;
      const content = await readContent<FlashcardSessionContent>(
        kind,
        sessionId,
        base.cardsInContent === true,
        FC_CONTENT_DOC
      );
      const session = mergeFlashcardSessionContent(base, content);
      return {
        kind,
        session: {
          ...session,
          cards: Array.isArray(session.cards) ? session.cards : [],
        },
      };
    }
    case 'projects': {
      const run = { ...data, id: sessionId } as ProjectRun;
      return {
        kind,
        run: { ...run, steps: Array.isArray(run.steps) ? run.steps : [] },
      };
    }
    case 'writing':
      return {
        kind,
        session: { ...data, id: sessionId } as WritingAssignmentSession,
      };
  }
}
