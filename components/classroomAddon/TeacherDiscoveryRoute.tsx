/**
 * Google Classroom Add-on teacher discovery (Attachment Setup) route.
 *
 * Route: /classroom-addon/teacher  (the add-on's Attachment Setup URI).
 * Classroom opens this iframe when a teacher picks SpartBoard from the
 * assignment "Add-ons" menu, passing courseId/itemId/itemType + an `addOnToken`
 * (+ login_hint).
 *
 * Flow (the real "attach a quiz" pipe):
 *   1. Teacher signs into SpartBoard (Google) — gives a Firebase uid + a Drive
 *      access token so we can list/load their quiz library.
 *   2. Teacher picks a quiz from their library.
 *   3. We load the quiz content and create a Classroom-targeted assignment
 *      (`classIds: ["classroom:<courseId>"]`) → a persistent join `code` the
 *      student takes the quiz with, async/self-paced.
 *   4. A short GIS popup grants `classroom.addons.teacher`; the
 *      `createClassroomAttachment` CF validates the teacher launch via
 *      `getAddOnContext` and creates the attachment whose studentViewUri is
 *      `/classroom-addon/student?code=<code>`.
 *
 * NOTE: this still carries throwaway de-risk affordances (the param grid + log)
 * pending Phase 2 polish, but the attach path is the real one.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { db, functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useQuiz } from '@/hooks/useQuiz';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import { ensureGis, requestAccessToken } from './gisOAuth';

// The teacher/discovery iframe creates attachments → needs the teacher scope.
// (The SpartBoard sign-in above grants Drive separately, via AuthContext.)
const ADDON_TEACHER_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/classroom.addons.teacher',
].join(' ');

// PROBE (temporary): read-only Classroom course scope so we can call
// courses.aliases.list and confirm whether ClassLink preserves the class
// sourcedId in the course alias (the bridge to the existing ClassLink roster /
// name-resolution pipeline). Requires `classroom.courses.readonly` to be
// declared on the OAuth consent screen or Google will drop it.
const COURSE_READONLY_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/classroom.courses.readonly',
].join(' ');

interface CreateAttachmentResult {
  attachmentId: string;
}

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

  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [attachmentId, setAttachmentId] = useState('');

  const append = useCallback((line: string) => {
    setLog((prev) => [...prev, `${new Date().toLocaleTimeString()}  ${line}`]);
  }, []);

  const selectedQuiz = useMemo(
    () => quizzes.find((q) => q.id === selectedQuizId),
    [quizzes, selectedQuizId]
  );

  const signIn = useCallback(async () => {
    setBusy(true);
    try {
      append('Signing in to SpartBoard…');
      await signInWithGoogle();
      append('Signed in. Pick a quiz to attach.');
    } catch (err) {
      append(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [append, signInWithGoogle]);

  // PROBE (temporary): does the Classroom course alias carry the ClassLink
  // sourcedId? Reads courses.aliases.list with a read-only Classroom token.
  const checkAlias = useCallback(async () => {
    setBusy(true);
    try {
      if (!courseId) {
        append('No courseId in the URL.');
        return;
      }
      append('Requesting Classroom course read permission…');
      await ensureGis();
      const token = await requestAccessToken(COURSE_READONLY_SCOPES, loginHint);
      append(`Reading aliases for course ${courseId}…`);
      const res = await fetch(
        `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(
          courseId
        )}/aliases`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const text = await res.text();
      append(`aliases.list → ${res.status}: ${text.slice(0, 600)}`);
    } catch (err) {
      append(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [append, courseId, loginHint]);

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

      // Resolve the assignment's classId. If this Google course is linked to a
      // ClassLink class, use that real sourcedId so the assignment's classIds
      // MATCH the token classroomAddonLoginV1 mints for the student (which is
      // also the linked sourcedId) — that's what lets the class-gate authorize
      // their responses AND lets the monitor resolve real names. If unlinked,
      // both sides fall back to "classroom:<courseId>" (works, but nameless).
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
        {
          accessToken: string;
          courseId: string;
          itemId: string;
          itemType: string;
          addOnToken: string;
          origin: string;
          quizCode: string;
          title: string;
        },
        CreateAttachmentResult
      >(functions, 'createClassroomAttachment');
      const { data } = await callable({
        accessToken,
        courseId,
        itemId,
        itemType,
        addOnToken,
        origin: window.location.origin,
        quizCode: code,
        title: `SpartBoard: ${selectedQuiz.title}`,
      });

      setAttachmentId(data.attachmentId);
      append(
        `Attached "${selectedQuiz.title}". Students can now open it and take ` +
          'the quiz inside Classroom.'
      );
    } catch (err) {
      append(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [
    append,
    courseId,
    itemId,
    itemType,
    addOnToken,
    loginHint,
    selectedQuiz,
    googleAccessToken,
    loadQuizData,
    createAssignment,
  ]);

  return (
    <div className="min-h-screen bg-slate-900 p-6 font-sans text-slate-100">
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h1 className="text-xl font-bold">Attach a SpartBoard quiz</h1>
          <p className="text-sm text-slate-400">
            Pick a quiz from your library to attach to this Classroom
            assignment. Students take it inside Classroom.
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

        {/* PROBE (temporary): verify the ClassLink sourcedId is in the course
            alias. Independent of sign-in — does its own read-only OAuth popup. */}
        {courseId && (
          <button
            type="button"
            onClick={() => void checkAlias()}
            disabled={busy}
            className="rounded border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-400/20 disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Check course alias (debug)'}
          </button>
        )}

        {existingAttachmentId ? (
          <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm">
            This is the teacher view of an existing attachment (
            <span className="font-mono">{existingAttachmentId}</span>). Students
            open it to take the attached quiz.
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
            <button
              type="button"
              onClick={() => void runAttach()}
              disabled={busy || !selectedQuizId}
              className="rounded bg-blue-500 px-4 py-2 font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Attach quiz'}
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
