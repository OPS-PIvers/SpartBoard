/**
 * Google Classroom Add-on teacher discovery (Attachment Setup) route.
 *
 * Route: /classroom-addon/teacher  (the add-on's Attachment Setup URI).
 * Classroom opens this iframe when a teacher picks SpartBoard from the
 * assignment "Add-ons" menu, passing courseId/itemId/itemType + an `addOnToken`
 * (+ login_hint).
 *
 * Flow (the real "attach an activity" pipe):
 *   1. Teacher signs into SpartBoard (Google) — gives a Firebase uid + a Drive
 *      access token so we can list/load their quiz / video-activity library.
 *   2. Teacher picks either a Quiz or a Video Activity from their library.
 *   3. We load the content and create a Classroom-targeted assignment
 *      (`classIds: [<linked sourcedId> | "classroom:<courseId>"]`):
 *        - Quiz → a persistent join `code` the student takes the quiz with.
 *        - Video Activity → a `sessionId` (VA has no join code); the student
 *          joins by sessionId.
 *      Both run async / self-paced (no live teacher session).
 *   4. A short GIS popup grants `classroom.addons.teacher`; the
 *      `createClassroomAttachment` CF validates the teacher launch via
 *      `getAddOnContext` and creates the attachment. The callable builds the
 *      studentViewUri from the params we pass:
 *        - Quiz → `/classroom-addon/student?code=<code>`
 *        - VA   → `/classroom-addon/student?kind=va&sessionId=<sessionId>`
 */
import React, { useCallback, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { db, functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useQuiz } from '@/hooks/useQuiz';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import { useVideoActivity } from '@/hooks/useVideoActivity';
import { useVideoActivityAssignments } from '@/hooks/useVideoActivityAssignments';
import type { VideoActivitySessionSettings } from '@/types';
import { ensureGis, requestAccessToken } from './gisOAuth';

// The teacher/discovery iframe creates attachments → needs the teacher scope.
// (The SpartBoard sign-in above grants Drive separately, via AuthContext.)
const ADDON_TEACHER_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/classroom.addons.teacher',
].join(' ');

// Conservative player defaults for an async Classroom attachment — mirrors the
// runner's own fallbacks (require a correct answer, no skipping, no autoplay).
const VA_SESSION_SETTINGS: VideoActivitySessionSettings = {
  autoPlay: false,
  requireCorrectAnswer: true,
  allowSkipping: false,
};

interface CreateAttachmentResult {
  attachmentId: string;
}

// Params the callable accepts. `quizCode` (quiz) and `sessionId`+`kind:'va'`
// (video activity) are mutually exclusive per the pinned contract; the callable
// builds the right studentViewUri from whichever set we pass.
interface CreateAttachmentParams {
  accessToken: string;
  courseId: string;
  itemId: string;
  itemType: string;
  addOnToken: string;
  origin: string;
  title: string;
  quizCode?: string;
  sessionId?: string;
  kind?: 'quiz' | 'va';
}

type ContentKind = 'quiz' | 'va';

export const ClassroomAddonTeacherSpike: React.FC = () => {
  const params =
    typeof window === 'undefined'
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const loginHint = params.get('login_hint') ?? undefined;
  const courseId = params.get('courseId') ?? '';
  const itemId = params.get('itemId') ?? '';
  const itemType = params.get('itemType') ?? 'courseWork';
  const addOnToken = params.get('addOnToken') ?? '';
  // Present when Classroom re-opens this route as the teacher VIEW of an
  // already-created attachment (no addOnToken in that iframe).
  const existingAttachmentId = params.get('attachmentId') ?? '';

  const { user, signInWithGoogle, googleAccessToken } = useAuth();
  const { quizzes, loadQuizData, loading: quizzesLoading } = useQuiz(user?.uid);
  const { createAssignment } = useQuizAssignments(user?.uid);
  const {
    activities,
    loadActivityData,
    loading: activitiesLoading,
  } = useVideoActivity(user?.uid);
  const { createAssignment: createVideoActivityAssignment } =
    useVideoActivityAssignments(user?.uid);

  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<ContentKind>('quiz');
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [attachmentId, setAttachmentId] = useState('');

  const append = useCallback((line: string) => {
    setLog((prev) => [...prev, `${new Date().toLocaleTimeString()}  ${line}`]);
  }, []);

  const selectedQuiz = useMemo(
    () => quizzes.find((q) => q.id === selectedQuizId),
    [quizzes, selectedQuizId]
  );
  const selectedActivity = useMemo(
    () => activities.find((a) => a.id === selectedActivityId),
    [activities, selectedActivityId]
  );

  const signIn = useCallback(async () => {
    setBusy(true);
    try {
      append('Signing in to SpartBoard…');
      await signInWithGoogle();
      append('Signed in. Pick something to attach.');
    } catch (err) {
      append(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [append, signInWithGoogle]);

  // Resolve the assignment's classId. If this Google course is linked to a
  // ClassLink class, use that real sourcedId so the assignment's classIds
  // MATCH the token classroomAddonLoginV1 mints for the student (which is also
  // the linked sourcedId) — that's what lets the class-gate authorize their
  // responses AND lets the monitor resolve real names. If unlinked, both sides
  // fall back to "classroom:<courseId>" (works, but nameless). Shared by both
  // the quiz and video-activity attach paths.
  const resolveClassIds = useCallback(async (): Promise<string[]> => {
    let classIds = [`classroom:${courseId}`];
    try {
      const linkSnap = await getDoc(
        doc(db, 'classroom_course_links', courseId)
      );
      const linkedClassId = linkSnap.exists()
        ? (linkSnap.data().classlinkClassId as string | undefined)
        : undefined;
      if (linkedClassId) {
        classIds = [linkedClassId];
        append(`Course is linked to ClassLink class ${linkedClassId}.`);
      } else {
        append(
          'Course not linked to a ClassLink class — students will be ' +
            'anonymous in the monitor. Link it from your roster to show names.'
        );
      }
    } catch {
      // Fall back to the courseId-scoped classId.
    }
    return classIds;
  }, [append, courseId]);

  // Mint the addons.teacher access token + create the Classroom attachment.
  // `contentParams` carries the quiz-vs-VA discriminator (quizCode vs
  // sessionId+kind) per the pinned createClassroomAttachment contract.
  const createAttachment = useCallback(
    async (
      title: string,
      contentParams:
        | { quizCode: string; kind: 'quiz' }
        | { sessionId: string; kind: 'va' }
    ): Promise<void> => {
      // The addons.teacher grant is what getAddOnContext validates the teacher
      // launch against — a separate, minimal grant from the SpartBoard Drive
      // sign-in above.
      append('Granting Classroom add-on permission…');
      await ensureGis();
      const accessToken = await requestAccessToken(
        ADDON_TEACHER_SCOPES,
        loginHint
      );

      append('Creating the Classroom attachment…');
      const callable = httpsCallable<
        CreateAttachmentParams,
        CreateAttachmentResult
      >(functions, 'createClassroomAttachment');
      const { data } = await callable({
        accessToken,
        courseId,
        itemId,
        itemType,
        addOnToken,
        origin: window.location.origin,
        title,
        ...contentParams,
      });
      setAttachmentId(data.attachmentId);
    },
    [append, courseId, itemId, itemType, addOnToken, loginHint]
  );

  const attachQuiz = useCallback(async () => {
    if (!selectedQuiz) {
      append('Pick a quiz first.');
      return;
    }
    if (!googleAccessToken) {
      append('No Google Drive token — sign in to SpartBoard again.');
      return;
    }

    append(`Loading "${selectedQuiz.title}"…`);
    const quizData = await loadQuizData(selectedQuiz.driveFileId);

    const classIds = await resolveClassIds();

    // sessionMode 'student' = self-paced/async, which is how a Classroom
    // attachment is taken (no live teacher session).
    append('Creating a class-targeted assignment…');
    const { code } = await createAssignment(
      {
        id: selectedQuiz.id,
        title: selectedQuiz.title,
        driveFileId: selectedQuiz.driveFileId,
        questions: quizData.questions,
      },
      {
        className: 'Google Classroom',
        sessionMode: 'student',
        sessionOptions: {},
      },
      {
        classIds,
        initialStatus: 'active',
      }
    );
    append(`Assignment created (join code ${code}).`);

    await createAttachment(`SpartBoard: ${selectedQuiz.title}`, {
      quizCode: code,
      kind: 'quiz',
    });
    append(
      `Attached "${selectedQuiz.title}". Students can now open it and take ` +
        'the quiz inside Classroom.'
    );
  }, [
    append,
    selectedQuiz,
    googleAccessToken,
    loadQuizData,
    resolveClassIds,
    createAssignment,
    createAttachment,
  ]);

  const attachVideoActivity = useCallback(async () => {
    if (!selectedActivity) {
      append('Pick a video activity first.');
      return;
    }
    if (!googleAccessToken) {
      append('No Google Drive token — sign in to SpartBoard again.');
      return;
    }

    append(`Loading "${selectedActivity.title}"…`);
    const activityData = await loadActivityData(selectedActivity.driveFileId);

    const classIds = await resolveClassIds();

    // VA has no join code — the assignment is identified by its sessionId
    // (== assignment id). `createAssignment`'s args are POSITIONAL:
    // (activity, settings, initialStatus?, classIds?, periodNames?, rosterIds?, mode?).
    append('Creating a class-targeted video-activity assignment…');
    const { id: sessionId } = await createVideoActivityAssignment(
      {
        id: selectedActivity.id,
        title: selectedActivity.title,
        driveFileId: selectedActivity.driveFileId,
        youtubeUrl: activityData.youtubeUrl,
        questions: activityData.questions,
      },
      {
        className: 'Google Classroom',
        sessionSettings: VA_SESSION_SETTINGS,
      },
      'active',
      classIds
    );
    append(`Video-activity session created (sessionId ${sessionId}).`);

    await createAttachment(`SpartBoard: ${selectedActivity.title}`, {
      sessionId,
      kind: 'va',
    });
    append(
      `Attached "${selectedActivity.title}". Students can now open it and ` +
        'complete the video activity inside Classroom.'
    );
  }, [
    append,
    selectedActivity,
    googleAccessToken,
    loadActivityData,
    resolveClassIds,
    createVideoActivityAssignment,
    createAttachment,
  ]);

  const runAttach = useCallback(async () => {
    setBusy(true);
    try {
      if (!courseId || !itemId) {
        append('Missing courseId/itemId in the URL.');
        return;
      }
      if (!addOnToken) {
        append(
          'Missing addOnToken — this route must be opened as the Attachment ' +
            'Setup URI (discovery), not the teacher view.'
        );
        return;
      }
      if (kind === 'quiz') {
        await attachQuiz();
      } else {
        await attachVideoActivity();
      }
    } catch (err) {
      append(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [
    append,
    courseId,
    itemId,
    addOnToken,
    kind,
    attachQuiz,
    attachVideoActivity,
  ]);

  const tabBtn = (value: ContentKind, label: string) => (
    <button
      type="button"
      onClick={() => setKind(value)}
      disabled={busy}
      aria-pressed={kind === value}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
        kind === value
          ? 'bg-blue-500 text-white'
          : 'text-slate-300 hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  );

  const canAttach = kind === 'quiz' ? !!selectedQuizId : !!selectedActivityId;

  return (
    <div className="min-h-screen bg-slate-900 p-6 font-sans text-slate-100">
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h1 className="text-xl font-bold">Attach a SpartBoard activity</h1>
          <p className="text-sm text-slate-400">
            Pick a quiz or video activity from your library to attach to this
            Classroom assignment. Students complete it inside Classroom.
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
          <div className="grid grid-cols-[8rem_1fr] gap-y-1">
            <span className="text-slate-400">courseId</span>
            <span className="break-all font-mono">
              {courseId === '' ? '(missing)' : courseId}
            </span>
            <span className="text-slate-400">itemId</span>
            <span className="break-all font-mono">
              {itemId === '' ? '(missing)' : itemId}
            </span>
            <span className="text-slate-400">itemType</span>
            <span className="font-mono">{itemType}</span>
            <span className="text-slate-400">addOnToken</span>
            <span className="break-all font-mono">
              {addOnToken === '' ? '(none — teacher view?)' : '(present)'}
            </span>
          </div>
        </div>

        {existingAttachmentId ? (
          <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm">
            This is the teacher view of an existing attachment (
            <span className="font-mono">{existingAttachmentId}</span>). Students
            open it to complete the attached activity.
          </div>
        ) : !user ? (
          <button
            type="button"
            onClick={() => void signIn()}
            disabled={busy}
            className="rounded bg-blue-500 px-4 py-2 font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Sign in to SpartBoard'}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
              {tabBtn('quiz', 'Quiz')}
              {tabBtn('va', 'Video Activity')}
            </div>

            {kind === 'quiz' ? (
              <label className="block text-sm">
                <span className="mb-1 block text-slate-400">Quiz</span>
                <select
                  value={selectedQuizId}
                  onChange={(e) => setSelectedQuizId(e.target.value)}
                  disabled={busy || quizzesLoading}
                  className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-white"
                >
                  <option value="">
                    {quizzesLoading
                      ? 'Loading your quizzes…'
                      : quizzes.length === 0
                        ? 'No quizzes in your library yet'
                        : 'Select a quiz…'}
                  </option>
                  {quizzes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block text-sm">
                <span className="mb-1 block text-slate-400">
                  Video Activity
                </span>
                <select
                  value={selectedActivityId}
                  onChange={(e) => setSelectedActivityId(e.target.value)}
                  disabled={busy || activitiesLoading}
                  className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-white"
                >
                  <option value="">
                    {activitiesLoading
                      ? 'Loading your video activities…'
                      : activities.length === 0
                        ? 'No video activities in your library yet'
                        : 'Select a video activity…'}
                  </option>
                  {activities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button
              type="button"
              onClick={() => void runAttach()}
              disabled={busy || !canAttach}
              className="rounded bg-blue-500 px-4 py-2 font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
            >
              {busy
                ? 'Working…'
                : kind === 'quiz'
                  ? 'Attach quiz'
                  : 'Attach video activity'}
            </button>
          </div>
        )}

        {attachmentId && (
          <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm">
            <h2 className="mb-1 font-semibold">Attached ✓</h2>
            <p className="break-all font-mono">{attachmentId}</p>
          </div>
        )}

        <div className="rounded-lg border border-white/10 bg-black/30 p-4">
          <h2 className="mb-2 text-sm font-semibold">Log</h2>
          <pre className="whitespace-pre-wrap break-all font-mono text-xs text-slate-300">
            {log.length ? log.join('\n') : '(no output yet)'}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default ClassroomAddonTeacherSpike;
