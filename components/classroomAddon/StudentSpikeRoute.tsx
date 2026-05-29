/**
 * SPIKE — Google Classroom Add-on student handshake de-risk page.
 *
 * Route: /classroom-addon/student  (set this as the add-on's Student View URI
 * on the test domain, e.g. .../classroom-addon/student?courseId=…&itemId=…)
 *
 * The ONLY purpose of this throwaway page is to answer the single riskiest
 * question in the whole integration, against a REAL Classroom iframe:
 *   1. Can we run Google OAuth in a popup from inside the partitioned iframe?
 *   2. Does `classroomAddonLoginV1` (server-side getAddOnContext) return the
 *      student role + submissionId and mint a Firebase custom token?
 *   3. After `signInWithCustomToken`, does the Firebase `studentRole` session
 *      SURVIVE A RELOAD inside the partitioned iframe? (Use the "Reload" button
 *      below — if the session is gone after reload, we need CHIPS / Storage
 *      Access API and must plan for it before building the real runner.)
 *
 * This is NOT the real student runner — no quiz, no Firestore writes. Delete
 * once the handshake is proven and Phase 3-shell takes over.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { auth, functions } from '@/config/firebase';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

// The student iframe only needs to read context + identity.
const ADDON_STUDENT_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/classroom.addons.student',
].join(' ');

const GIS_SRC = 'https://accounts.google.com/gsi/client';

interface ClassroomAddonLoginResult {
  role: 'student' | 'teacher' | 'unknown';
  studentRole: boolean;
  customToken?: string;
  submissionId?: string;
}

interface SessionInfo {
  uid: string;
  isAnonymous: boolean;
  studentRole: boolean;
  classIds: unknown;
}

/** Inject the GIS script once and resolve when `google.accounts.oauth2` is ready. */
function ensureGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Not in a browser.'));
      return;
    }
    const ready = () =>
      typeof window.google !== 'undefined' && !!window.google.accounts?.oauth2;
    if (ready()) {
      resolve();
      return;
    }
    let script = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SRC}"]`
    );
    if (!script) {
      script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    const deadline = Date.now() + 8000;
    const poll = window.setInterval(() => {
      if (ready()) {
        window.clearInterval(poll);
        resolve();
      } else if (Date.now() > deadline) {
        window.clearInterval(poll);
        reject(new Error('GIS script did not load.'));
      }
    }, 100);
  });
}

/** Run the OAuth token popup, resolving with an access token (or rejecting). */
function requestAccessToken(loginHint: string | undefined): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!CLIENT_ID) {
      reject(new Error('VITE_GOOGLE_CLIENT_ID is not set in this build.'));
      return;
    }
    // `hint` isn't in older @types/google.accounts; widen the config type.
    const init = window.google.accounts.oauth2.initTokenClient as (config: {
      client_id: string;
      scope: string;
      hint?: string;
      callback: (resp: { access_token?: string; error?: string }) => void;
    }) => { requestAccessToken: () => void };

    const client = init({
      client_id: CLIENT_ID,
      scope: ADDON_STUDENT_SCOPES,
      hint: loginHint,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(`OAuth error: ${resp.error}`));
          return;
        }
        if (!resp.access_token) {
          reject(new Error('No access token returned.'));
          return;
        }
        resolve(resp.access_token);
      },
    });
    client.requestAccessToken();
  });
}

export const ClassroomAddonStudentSpike: React.FC = () => {
  const params =
    typeof window === 'undefined'
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const loginHint = params.get('login_hint') ?? undefined;
  const courseId = params.get('courseId') ?? '';
  const itemId = params.get('itemId') ?? '';
  const itemType = params.get('itemType') ?? 'courseWork';

  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);

  const append = useCallback((line: string) => {
    setLog((prev) => [...prev, `${new Date().toLocaleTimeString()}  ${line}`]);
  }, []);

  // Report whatever Firebase session is already present on mount — this is the
  // persistence check: after a reload inside the iframe, does the studentRole
  // user come back?
  useEffect(() => {
    // `active` guards the async `getIdTokenResult` continuation so we don't
    // setState after the component unmounts (the listener can resolve late).
    let active = true;
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        if (active) setSession(null);
        return;
      }
      try {
        const token = await user.getIdTokenResult();
        if (!active) return;
        setSession({
          uid: user.uid,
          isAnonymous: user.isAnonymous,
          studentRole: token.claims.studentRole === true,
          classIds: token.claims.classIds,
        });
      } catch {
        if (!active) return;
        setSession({
          uid: user.uid,
          isAnonymous: user.isAnonymous,
          studentRole: false,
          classIds: undefined,
        });
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  const runHandshake = useCallback(async () => {
    setBusy(true);
    try {
      if (!courseId || !itemId) {
        append(
          'Missing courseId/itemId in the URL — set them as query params.'
        );
        return;
      }
      append('Loading Google Identity Services…');
      await ensureGis();
      append('Opening OAuth popup…');
      const accessToken = await requestAccessToken(loginHint);
      append('Got access token. Calling classroomAddonLoginV1…');

      const callable = httpsCallable<
        {
          accessToken: string;
          courseId: string;
          itemId: string;
          itemType: string;
        },
        ClassroomAddonLoginResult
      >(functions, 'classroomAddonLoginV1');
      const { data } = await callable({
        accessToken,
        courseId,
        itemId,
        itemType,
      });

      append(`Server says role=${data.role}, studentRole=${data.studentRole}.`);
      if (data.role !== 'student' || !data.customToken) {
        append(
          'Not a student launch — no token minted. (Expected for teachers.)'
        );
        return;
      }
      append(
        `submissionId=${data.submissionId}. Signing in with custom token…`
      );
      await signInWithCustomToken(auth, data.customToken);
      append(
        'signInWithCustomToken OK. Now RELOAD to test session persistence.'
      );
    } catch (err) {
      append(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [append, courseId, itemId, itemType, loginHint]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 font-sans">
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h1 className="text-xl font-bold">
            Classroom Add-on — student handshake spike
          </h1>
          <p className="text-sm text-slate-400">
            Throwaway de-risk page. Proves OAuth-popup → getAddOnContext →
            custom-token sign-in survives Classroom&apos;s partitioned iframe.
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
          <div className="grid grid-cols-[8rem_1fr] gap-y-1">
            <span className="text-slate-400">courseId</span>
            <span className="font-mono break-all">
              {courseId === '' ? '(missing)' : courseId}
            </span>
            <span className="text-slate-400">itemId</span>
            <span className="font-mono break-all">
              {itemId === '' ? '(missing)' : itemId}
            </span>
            <span className="text-slate-400">itemType</span>
            <span className="font-mono">{itemType}</span>
            <span className="text-slate-400">login_hint</span>
            <span className="font-mono break-all">{loginHint ?? '(none)'}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void runHandshake()}
            disabled={busy}
            className="rounded bg-blue-500 px-4 py-2 font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Run handshake'}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded border border-white/20 px-4 py-2 font-medium transition hover:bg-white/10"
          >
            Reload (test persistence)
          </button>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
          <h2 className="mb-2 font-semibold">Current Firebase session</h2>
          {session ? (
            <div className="grid grid-cols-[8rem_1fr] gap-y-1">
              <span className="text-slate-400">uid</span>
              <span className="font-mono break-all">{session.uid}</span>
              <span className="text-slate-400">isAnonymous</span>
              <span className="font-mono">{String(session.isAnonymous)}</span>
              <span className="text-slate-400">studentRole</span>
              <span className="font-mono">{String(session.studentRole)}</span>
              <span className="text-slate-400">classIds</span>
              <span className="font-mono break-all">
                {JSON.stringify(session.classIds)}
              </span>
            </div>
          ) : (
            <p className="text-slate-400">
              No Firebase user. (After reload, this is the persistence signal.)
            </p>
          )}
        </div>

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

export default ClassroomAddonStudentSpike;
