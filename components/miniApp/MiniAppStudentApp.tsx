/**
 * MiniAppStudentApp — student-facing MiniApp experience.
 * Accessible at /miniapp/:sessionId (no Google auth required).
 *
 * Flow:
 *  1. Anonymous Firebase auth (satisfies Firestore security rules)
 *  2. Load session from Firestore by sessionId
 *  3. If active: render the app HTML in a sandboxed iframe immediately
 *  4. If ended: show "session ended" screen
 *  5. If collectResults configured: forward SPART_MINIAPP_RESULT postMessages to Apps Script
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { Loader2, AlertCircle, CheckCircle2, Box } from 'lucide-react';
import { auth, db } from '@/config/firebase';
import { MiniAppSession } from '@/types';

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

// ─── App Viewer ────────────────────────────────────────────────────────────────

const AppViewer: React.FC<{ session: MiniAppSession }> = ({ session }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;

      const data = event.data as { type?: string; payload?: unknown } | null;
      if (data?.type === 'SPART_MINIAPP_RESULT' && session.submissionUrl) {
        try {
          await fetch(session.submissionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sheetId: session.googleSheetId ?? '',
              studentPin: 'Student',
              data: data.payload,
            }),
          });
        } catch (err) {
          console.error('[MiniAppStudentApp] Result submission failed:', err);
        }
      }
    },
    [session.submissionUrl, session.googleSheetId]
  );

  useEffect(() => {
    if (!session.submissionUrl) return;
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [session.submissionUrl, handleMessage]);

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
