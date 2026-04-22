/**
 * MiniAppStudentApp — student-facing MiniApp experience.
 * Accessible at /miniapp/:sessionId.
 *
 * Flow:
 *  1. If no Firebase Auth user (legacy shared-link launch), sign in anonymously.
 *     Students launched via /my-assignments arrive already authenticated with
 *     a studentRole custom-token user — we keep that auth and do not re-sign.
 *  2. Load session from Firestore by sessionId
 *  3. If active: render the app HTML in a sandboxed iframe immediately
 *  4. If ended: show "session ended" screen
 *  5. When the iframe posts SPART_MINIAPP_RESULT, write a submission doc under
 *     `mini_app_sessions/{sessionId}/submissions/{docId}`. For studentRole
 *     users the docId is an opaque per-assignment pseudonym (via
 *     getAssignmentPseudonymV1) so grading can match-back without persisting
 *     PII; for anonymous users the docId is the anon Firebase Auth UID.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Box,
  RefreshCw,
} from 'lucide-react';
import { auth, db, functions } from '@/config/firebase';
import { MiniAppSession, MiniAppSubmission } from '@/types';

type SubmissionStatus =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; payload: unknown };

const SESSIONS_COLLECTION = 'mini_app_sessions';

// ─── Root ──────────────────────────────────────────────────────────────────────

export const MiniAppStudentApp: React.FC = () => {
  const [authReady, setAuthReady] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.warn('[MiniAppStudentApp] Anonymous auth failed:', err);
          setAuthFailed(true);
        }
      }
      setAuthReady(true);
    };
    void init();
  }, []);

  if (!authReady) {
    return <FullPageLoader message="Loading…" />;
  }

  if (authFailed) {
    return (
      <ErrorScreen message="Unable to connect. Please refresh and try again." />
    );
  }

  return <SessionLoader />;
};

// ─── Session Loader ────────────────────────────────────────────────────────────

const SessionLoader: React.FC = () => {
  const sessionId = window.location.pathname.replace(/^\/miniapp\/?/, '');

  const [session, setSession] = useState<MiniAppSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const isInvalidId = !sessionId || sessionId.includes('/');

  useEffect(() => {
    // Don't subscribe if the session ID is obviously invalid
    if (isInvalidId) return;

    const unsub = onSnapshot(
      doc(db, SESSIONS_COLLECTION, sessionId),
      (snap) => {
        if (!snap.exists()) {
          setNotFound(true);
        } else {
          setSession(snap.data() as MiniAppSession);
        }
        setLoading(false);
      },
      (err) => {
        console.error('[MiniAppStudentApp] Session load error:', err);
        setNotFound(true);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [sessionId, isInvalidId]);

  if (isInvalidId) {
    return (
      <ErrorScreen message="Invalid activity link. Please ask your teacher for the correct URL." />
    );
  }

  if (loading) {
    return <FullPageLoader message="Loading activity…" />;
  }

  if (notFound || !session) {
    return (
      <ErrorScreen message="Activity not found. Please check the link and try again." />
    );
  }

  if (session.status === 'ended') {
    return <EndedScreen appTitle={session.appTitle} />;
  }

  return <AppViewer session={session} />;
};

// ─── Submission doc-ID resolution ──────────────────────────────────────────────
//
// Pseudonym cache: sessionId -> pseudonym (Promise-valued so concurrent
// submissions within the same session de-dupe the callable round trip).
// Rebuild whenever the authenticated uid changes (tracked by
// `pseudonymCacheOwnerUid`). Mirrors the pattern in MyAssignmentsPage.

let pseudonymCacheOwnerUid: string | null = null;
let pseudonymCache: Map<string, Promise<string>> = new Map();

function getCachedPseudonym(
  sessionId: string,
  pseudonymUid: string
): Promise<string> {
  if (pseudonymCacheOwnerUid !== pseudonymUid) {
    pseudonymCache = new Map();
    pseudonymCacheOwnerUid = pseudonymUid;
  }
  const cached = pseudonymCache.get(sessionId);
  if (cached) return cached;

  const callable = httpsCallable<
    { assignmentId: string },
    { pseudonym?: string }
  >(functions, 'getAssignmentPseudonymV1');

  const promise = callable({ assignmentId: sessionId }).then((res) => {
    const p = res.data?.pseudonym;
    if (typeof p !== 'string' || p.length === 0) {
      throw new Error('Pseudonym missing from callable response.');
    }
    return p;
  });

  pseudonymCache.set(sessionId, promise);
  promise.catch(() => {
    if (pseudonymCache.get(sessionId) === promise) {
      pseudonymCache.delete(sessionId);
    }
  });

  return promise;
}

// ─── App Viewer ────────────────────────────────────────────────────────────────

const AppViewer: React.FC<{ session: MiniAppSession }> = ({ session }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<SubmissionStatus>({ kind: 'idle' });

  const submit = useCallback(
    async (payload: unknown) => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.warn('[MiniAppStudentApp] No auth user; skipping submission.');
        setStatus({ kind: 'error', payload });
        return;
      }

      setStatus({ kind: 'submitting' });
      try {
        // studentRole users (ClassLink-launched) submit under an opaque
        // per-assignment pseudonym so the teacher can match-back without
        // persisting PII. Anonymous shared-link users submit under their
        // anon Firebase Auth UID.
        const tokenResult = await currentUser.getIdTokenResult();
        const isStudentRole = tokenResult.claims?.studentRole === true;

        const docId = isStudentRole
          ? await getCachedPseudonym(session.id, currentUser.uid)
          : currentUser.uid;

        // Rules require `payload is map`; coerce non-object payloads into a
        // `{ value }` wrapper so mini-apps that post scalars or arrays still
        // persist instead of silently failing the write.
        const normalisedPayload =
          payload !== null &&
          typeof payload === 'object' &&
          !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : { value: payload };

        const submission: MiniAppSubmission = {
          submittedAt: Date.now(),
          payload: normalisedPayload,
        };

        await setDoc(
          doc(db, SESSIONS_COLLECTION, session.id, 'submissions', docId),
          submission
        );
        setStatus({ kind: 'saved', at: Date.now() });
      } catch (err) {
        console.error('[MiniAppStudentApp] Submission write failed:', err);
        setStatus({ kind: 'error', payload });
      }
    },
    [session.id]
  );

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { type?: string; payload?: unknown } | null;
      if (data?.type !== 'SPART_MINIAPP_RESULT') return;
      void submit(data.payload);
    },
    [submit]
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Auto-clear the transient "Saved" confirmation after 2.5s so it doesn't
  // linger over the activity.
  useEffect(() => {
    if (status.kind !== 'saved') return;
    const timeout = window.setTimeout(() => setStatus({ kind: 'idle' }), 2500);
    return () => window.clearTimeout(timeout);
  }, [status]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-900 flex flex-col">
      <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500 z-10" />
      <iframe
        ref={iframeRef}
        srcDoc={session.appHtml}
        title={session.appTitle}
        sandbox="allow-scripts allow-forms allow-modals"
        className="flex-1 w-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
      />
      <SubmissionStatusOverlay status={status} onRetry={submit} />
    </div>
  );
};

// ─── Submission status overlay ─────────────────────────────────────────────────

const SubmissionStatusOverlay: React.FC<{
  status: SubmissionStatus;
  onRetry: (payload: unknown) => void;
}> = ({ status, onRetry }) => {
  if (status.kind === 'idle') return null;

  const base =
    'fixed bottom-4 left-1/2 -translate-x-1/2 z-20 rounded-xl px-4 py-3 shadow-lg flex items-center gap-2 text-sm font-medium';

  if (status.kind === 'submitting') {
    return (
      <div className={`${base} bg-slate-800 text-white`} role="status">
        <Loader2 className="w-4 h-4 animate-spin" />
        Saving your answer…
      </div>
    );
  }

  if (status.kind === 'saved') {
    return (
      <div
        className={`${base} bg-emerald-600 text-white`}
        role="status"
        aria-live="polite"
      >
        <CheckCircle2 className="w-4 h-4" />
        Saved
      </div>
    );
  }

  return (
    <div
      className={`${base} bg-red-600 text-white`}
      role="alert"
      aria-live="assertive"
    >
      <AlertCircle className="w-4 h-4" />
      <span>Couldn&apos;t save your answer.</span>
      <button
        onClick={() => onRetry(status.payload)}
        className="inline-flex items-center gap-1 rounded-lg bg-white/20 hover:bg-white/30 px-2 py-1 text-xs font-bold"
      >
        <RefreshCw className="w-3 h-3" />
        Retry
      </button>
    </div>
  );
};

// ─── Supporting screens ────────────────────────────────────────────────────────

const FullPageLoader: React.FC<{ message: string }> = ({ message }) => (
  <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4">
    <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
    <p className="text-white/70 font-medium">{message}</p>
  </div>
);

const ErrorScreen: React.FC<{ message: string }> = ({ message }) => (
  <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 p-8 text-center">
    <AlertCircle className="w-12 h-12 text-red-400" />
    <h1 className="text-white text-xl font-bold">Something went wrong</h1>
    <p className="text-white/60 max-w-sm">{message}</p>
  </div>
);

const EndedScreen: React.FC<{ appTitle: string }> = ({ appTitle }) => (
  <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 p-8 text-center">
    <div className="w-16 h-16 rounded-2xl bg-slate-700 flex items-center justify-center mb-2">
      <Box className="w-8 h-8 text-slate-400" />
    </div>
    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
    <h1 className="text-white text-xl font-bold">Session Ended</h1>
    <p className="text-white/60 max-w-sm">
      The &ldquo;{appTitle}&rdquo; assignment has been closed by your teacher.
    </p>
  </div>
);
