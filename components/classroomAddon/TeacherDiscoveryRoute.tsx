/**
 * SPIKE — Google Classroom Add-on teacher discovery (Attachment Setup) page.
 *
 * Route: /classroom-addon/teacher  (set this as the add-on's Attachment Setup
 * URI on the test domain). Classroom opens this iframe when a teacher picks
 * SpartBoard from the assignment "Add-ons" menu, passing courseId/itemId/
 * itemType + an `addOnToken` (+ login_hint).
 *
 * Its only job in the de-risk slice: prove the TEACHER half of the handshake —
 *   1. Run Google OAuth in a popup (consent cannot redirect inside the iframe).
 *   2. Call `createClassroomAttachment`, which confirms via `getAddOnContext`
 *      that the launch is a teacher and creates an attachment whose
 *      studentViewUri points at `/classroom-addon/student`.
 * Once an attachment exists, a student can open it and the student spike runs.
 *
 * This is NOT the real teacher discovery UI (no quiz/VA library picker, no
 * grade-sync maxPoints). Delete once Phase 2 owns the real discovery flow.
 */
import React, { useCallback, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { ensureGis, requestAccessToken } from './gisOAuth';

// The teacher/discovery iframe creates attachments → needs the teacher scope.
const ADDON_TEACHER_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/classroom.addons.teacher',
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

  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [attachmentId, setAttachmentId] = useState<string>('');

  const append = useCallback((line: string) => {
    setLog((prev) => [...prev, `${new Date().toLocaleTimeString()}  ${line}`]);
  }, []);

  const runCreate = useCallback(async () => {
    setBusy(true);
    try {
      if (!courseId || !itemId) {
        append(
          'Missing courseId/itemId in the URL — set them as query params.'
        );
        return;
      }
      if (!addOnToken) {
        append(
          'Missing addOnToken — this route must be opened as the Attachment ' +
            'Setup URI (discovery), not the teacher view.'
        );
        return;
      }
      append('Loading Google Identity Services…');
      await ensureGis();
      append('Opening OAuth popup (teacher scope)…');
      const accessToken = await requestAccessToken(
        ADDON_TEACHER_SCOPES,
        loginHint
      );
      append('Got access token. Calling createClassroomAttachment…');

      const callable = httpsCallable<
        {
          accessToken: string;
          courseId: string;
          itemId: string;
          itemType: string;
          addOnToken: string;
          origin: string;
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
      });

      setAttachmentId(data.attachmentId);
      append(
        `Attachment created: ${data.attachmentId}. A student can now open it ` +
          'to run the student handshake spike.'
      );
    } catch (err) {
      append(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [append, courseId, itemId, itemType, addOnToken, loginHint]);

  return (
    <div className="min-h-screen bg-slate-900 p-6 font-sans text-slate-100">
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h1 className="text-xl font-bold">
            Classroom Add-on — teacher discovery spike
          </h1>
          <p className="text-sm text-slate-400">
            Throwaway de-risk page. Creates an add-on attachment whose student
            view points at the student handshake spike.
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
            <span className="text-slate-400">login_hint</span>
            <span className="break-all font-mono">{loginHint ?? '(none)'}</span>
            <span className="text-slate-400">attachmentId (url)</span>
            <span className="break-all font-mono">
              {existingAttachmentId === '' ? '(none)' : existingAttachmentId}
            </span>
          </div>
        </div>

        {existingAttachmentId ? (
          <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm">
            This is the teacher VIEW of an existing attachment (
            <span className="font-mono">{existingAttachmentId}</span>). Nothing
            to create — open it as a student to run the student spike.
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void runCreate()}
            disabled={busy}
            className="rounded bg-blue-500 px-4 py-2 font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Create attachment'}
          </button>
        )}

        {attachmentId && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
            <h2 className="mb-2 font-semibold">Created attachment</h2>
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
