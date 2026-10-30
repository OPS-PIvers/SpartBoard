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

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useReducer,
} from 'react';
import {
  signInAnonymously,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Box,
  RefreshCw,
  Flag,
} from 'lucide-react';
import { auth, db, functions } from '@/config/firebase';
import { AssignmentExcludedNotice } from '@/components/student/AssignmentExcludedNotice';
import { logError } from '@/utils/logError';
import { dropPinLogin } from '@/utils/pinLoginScope';
import {
  MiniAppSession,
  MiniAppSubmission,
  StudentAssignmentPointer,
} from '@/types';
import { useSeatedPeriodContent } from '@/hooks/useSeatedPeriodContent';
import { useServerNow } from '@/hooks/useServerNow';
import { useStaffAudienceGate } from '@/components/student/useStaffAudienceGate';
import {
  isStaffAudience,
  readStaffIdentity,
  staffResponseFields,
} from '@/utils/staffAudience';
import {
  hasPeriodAccess,
  studentCanEnter,
  studentPeriodKeys,
} from '@/utils/periodAccess';
import {
  MA_CONTENT_DOC,
  mergeMiniAppSessionContent,
  type MiniAppSessionContent,
} from '@/utils/miniAppSessionContent';
import {
  MiniAppPeriodLockedScreen,
  MiniAppPeriodPausedOverlay,
} from './MiniAppPeriodLockedScreen';
import {
  MSG_BLOCK_CONTEXT_MENU,
  MSG_INIT,
  MSG_LEGACY_RESULT,
  MSG_SUBMIT,
  MSG_SUBMIT_RESULT,
  injectContextMenuGuard,
  injectMiniAppHelper,
  type MiniAppInitPayload,
} from '@/utils/miniAppHelper';
import {
  isStudentContextMenuBlockWatched,
  useObservedStudentContextMenuBlock,
} from '@/hooks/useStudentContextMenuBlock';
import { submitErrorCode, submitMiniAppResult } from '@/utils/miniAppResults';
import {
  initialMiniAppView,
  miniAppViewReducer,
  sessionLoadReducer,
  type SubmissionStatus,
  type SubmitRequest,
} from './miniAppViewState';

const SESSIONS_COLLECTION = 'mini_app_sessions';

// ─── Root ──────────────────────────────────────────────────────────────────────

export const MiniAppStudentApp: React.FC = () => {
  const [authReady, setAuthReady] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        // Await IndexedDB hydration so the `auth.currentUser` check below
        // reflects the persisted SSO session (if any) instead of the
        // synchronous null seen on a fresh page load. Treating hydration
        // failure as a hard auth error — rather than swallowing it and
        // falling through to signInAnonymously — is what prevents the
        // exact SSO-demotion bug this fix exists to address, since a
        // rejected hydration with null currentUser would otherwise route
        // an SSO student into a fresh anonymous session.
        await auth.authStateReady();
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        } else {
          await dropPinLogin(auth);
        }
      } catch (err) {
        logError('MiniAppStudentApp.authInit', err);
        setAuthFailed(true);
      } finally {
        setAuthReady(true);
      }
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

  const [load, dispatchLoad] = useReducer(sessionLoadReducer, {
    kind: 'loading',
  });

  const isInvalidId = !sessionId || sessionId.includes('/');
  const staffGate = useStaffAudienceGate(
    load.kind === 'loaded' && isStaffAudience(load.session)
  );

  useEffect(() => {
    // Don't subscribe if the session ID is obviously invalid
    if (isInvalidId) return;

    const unsub = onSnapshot(
      doc(db, SESSIONS_COLLECTION, sessionId),
      (snap) => {
        dispatchLoad({
          type: 'snapshot',
          session: snap.exists() ? (snap.data() as MiniAppSession) : null,
        });
      },
      (err) => {
        console.error('[MiniAppStudentApp] Session load error:', err);
        dispatchLoad({ type: 'listenerError' });
      }
    );

    return () => unsub();
  }, [sessionId, isInvalidId]);

  if (isInvalidId) {
    return (
      <ErrorScreen message="Invalid activity link. Please ask your teacher for the correct URL." />
    );
  }

  if (load.kind === 'loading') {
    return <FullPageLoader message="Loading activity…" />;
  }

  if (load.kind === 'notFound') {
    return (
      <ErrorScreen message="Activity not found. Please check the link and try again." />
    );
  }

  const { session } = load;
  if (staffGate.screen) return staffGate.screen;

  if (session.status === 'ended') {
    return <EndedScreen appTitle={session.appTitle} />;
  }

  if (hasPeriodAccess(session) && session.mode !== 'view-only') {
    return <PeriodGatedAppViewer session={session} />;
  }

  return <AppViewer session={session} />;
};

// ─── Per-period gate ───────────────────────────────────────────────────────────

type SeatState =
  | { kind: 'claims' }
  | { kind: 'pick' }
  | { kind: 'seating' }
  | { kind: 'seated' }
  | { kind: 'error'; message: string };

const NOT_ASSIGNED =
  "You're not in a class this activity was assigned to. Ask your teacher.";

/** Seats the student in their period, then shows the app only while it is open. */
const PeriodGatedAppViewer: React.FC<{ session: MiniAppSession }> = ({
  session,
}) => {
  const uid = auth.currentUser?.uid ?? null;
  const { periodKeys, content, contentPending, takeSeat } =
    useSeatedPeriodContent<MiniAppSessionContent>({
      sessionCollection: SESSIONS_COLLECTION,
      sessionId: session.id,
      session,
      inContent: session.appInContent === true,
      contentDoc: MA_CONTENT_DOC,
      uid,
    });
  const [claims, setClaims] = useState<{
    studentRole: boolean;
    classIds: string[];
  } | null>(null);
  const [seat, setSeat] = useState<SeatState>({ kind: 'claims' });
  const now = useServerNow(5000);
  const canEnter = studentCanEnter(session, periodKeys, uid, now);

  const seatIn = useCallback(
    async (keys: string[]) => {
      setSeat({ kind: 'seating' });
      try {
        const seated = await takeSeat(keys);
        setSeat(
          seated ? { kind: 'seated' } : { kind: 'error', message: NOT_ASSIGNED }
        );
      } catch (err) {
        logError('MiniAppStudentApp.seat', err, { sessionId: session.id });
        setSeat({
          kind: 'error',
          message: "Couldn't join your class. Please refresh and try again.",
        });
      }
    },
    [takeSeat, session.id]
  );

  // A signed-in student is seated from their class claim; an anonymous one picks a period.
  const seatStarted = useRef(false);
  useEffect(() => {
    if (seatStarted.current) return;
    seatStarted.current = true;
    const load = async () => {
      let next = { studentRole: false, classIds: [] as string[] };
      try {
        const token = await auth.currentUser?.getIdTokenResult();
        const raw: unknown = token?.claims?.classIds;
        next = {
          studentRole: token?.claims?.studentRole === true,
          classIds: Array.isArray(raw)
            ? raw.filter((c): c is string => typeof c === 'string')
            : [],
        };
      } catch (err) {
        logError('MiniAppStudentApp.claims', err, { sessionId: session.id });
      }
      setClaims(next);
      if (!next.studentRole) {
        setSeat({ kind: 'pick' });
        return;
      }
      await seatIn(studentPeriodKeys(session, next.classIds));
    };
    void load();
  }, [session, seatIn]);

  // Once the app has shown, a later close pauses it in place rather than swapping screens.
  const [entered, setEntered] = useState(false);
  if (!entered && seat.kind === 'seated' && canEnter && !contentPending) {
    setEntered(true);
  }

  // Assessment mode refuses a join without a school sign-in, whose self-picked period no rule can check.
  if (claims && !claims.studentRole && session.accessMode === 'assessment') {
    return (
      <ErrorScreen message="This activity needs your school sign-in. Sign in with your school account to join." />
    );
  }
  if (seat.kind === 'error') return <ErrorScreen message={seat.message} />;
  if (seat.kind === 'pick') {
    return (
      <PeriodPicker
        session={session}
        onPick={(label) => void seatIn(studentPeriodKeys(session, [], label))}
      />
    );
  }
  if (seat.kind !== 'seated') {
    return <FullPageLoader message="Joining your class…" />;
  }
  if (!entered) {
    if (!canEnter) {
      return (
        <MiniAppPeriodLockedScreen
          session={session}
          periodKeys={periodKeys}
          now={now}
        />
      );
    }
    return <FullPageLoader message="Loading activity…" />;
  }
  return (
    <AppViewer
      session={mergeMiniAppSessionContent(session, content)}
      paused={!canEnter}
    />
  );
};

const PeriodPicker: React.FC<{
  session: MiniAppSession;
  onPick: (label: string) => void;
}> = ({ session, onPick }) => {
  const labels = [
    ...new Set(Object.values(session.periodAccess ?? {}).map((p) => p.label)),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return (
    <div className="h-screen h-dvh overflow-y-auto bg-slate-900 flex items-center items-center-safe justify-center p-6">
      <div className="bg-slate-800 border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
        <p className="text-slate-300 text-sm font-semibold truncate mb-2">
          {session.appTitle}
        </p>
        <h1 className="text-white font-bold text-xl mb-6">
          Which class are you in?
        </h1>
        <div className="flex flex-col gap-2">
          {labels.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => onPick(label)}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
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

/** A Staff-audience submission's name and email, from the signed-in staff member's token. */
async function staffFieldsFor(session: MiniAppSession, currentUser: User) {
  if (!isStaffAudience(session)) return {};
  return staffResponseFields(await readStaffIdentity(currentUser));
}

// v1 "I'm Done": mergeFields keeps any payload the app already saved.
async function writeDoneMarker(session: MiniAppSession, currentUser: User) {
  const sessionId = session.id;
  const tokenResult = await currentUser.getIdTokenResult();
  const isStudentRole = tokenResult.claims?.studentRole === true;
  const docId = isStudentRole
    ? await getCachedPseudonym(sessionId, currentUser.uid)
    : currentUser.uid;
  const staff = await staffFieldsFor(session, currentUser);
  const completion: MiniAppSubmission = {
    submittedAt: Date.now(),
    studentUid: currentUser.uid,
    payload: { completed: true },
    ...staff,
  };
  await setDoc(
    doc(db, SESSIONS_COLLECTION, sessionId, 'submissions', docId),
    completion,
    {
      mergeFields: [
        'submittedAt',
        'studentUid',
        'payload.completed',
        ...Object.keys(staff),
      ],
    }
  );
}

// ─── App Viewer ────────────────────────────────────────────────────────────────

const IDLE: SubmissionStatus = { kind: 'idle' };

const AppViewer: React.FC<{
  session: MiniAppSession;
  /** The student's period is shut: cover the app and hold submissions. */
  paused?: boolean;
}> = ({ session, paused = false }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // The latest submission the app posted while paused, sent once it reopens.
  const heldPayloadRef = useRef<{ payload: unknown } | null>(null);
  const [view, dispatch] = useReducer(miniAppViewReducer, initialMiniAppView);
  // A skipped student's progress keeps tracking behind the notice.
  const active = view.kind === 'excluded' ? view.behind : view;
  const status: SubmissionStatus = active.kind === 'open' ? active.save : IDLE;
  // Anything submitted (app or "I'm Done") keeps the Done button hidden after the toast clears.
  const hasSubmitted = active.kind === 'open' ? active.submitted : true;
  const isViewOnly = session.mode === 'view-only';
  // View-only sessions never accept submissions, regardless of the
  // submissionsEnabled flag stored on the session doc.
  const submissionsEnabled = !isViewOnly && session.submissionsEnabled === true;
  // Results v2 (MINI_APP_RESULTS.md): every write goes through submitMiniAppResultV1.
  const isV2 = session.resultsVersion === 2 && !isViewOnly;
  const { enabled: blockContextMenu } = useObservedStudentContextMenuBlock();
  // Fixed at mount so the switch loading or flipping later never reloads the app mid-work.
  const [menuGuardInjected] = useState(isStudentContextMenuBlockWatched);
  const attemptLimit =
    typeof session.attemptLimit === 'number' ? session.attemptLimit : null;
  const attemptsLeft =
    attemptLimit === null
      ? null
      : Math.max(0, attemptLimit - active.attemptsUsed);
  const heldRequestRef = useRef<{
    payload: unknown;
    request: SubmitRequest;
  } | null>(null);
  // One save at a time; an app post that lands mid-save waits here, newest wins.
  const savingRef = useRef(false);
  const queuedPostRef = useRef<{ payload: unknown } | null>(null);

  // Subscribe to auth so the view-log effect re-runs when anon sign-in
  // resolves; `auth.currentUser` alone is non-reactive.
  const [authedUid, setAuthedUid] = useState<string | null>(
    auth.currentUser?.uid ?? null
  );
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => setAuthedUid(user?.uid ?? null));
  }, []);

  // Per-student accommodation override (M17 C3, fixed M17 E2 F1): the pointer
  // doc lives at /student_assignments/{auth.uid}/items/{assignmentId} keyed
  // by the STABLE auth uid, not the per-assignment submission pseudonym — the
  // pointer path is server-fanned-out by setAssignmentTargetsV1, which keys
  // mini-app pointers by the archive assignment id (distinct from the session
  // id for this kind only). `session.assignmentId` carries that id; fall back
  // to `session.id` for legacy sessions created before the field existed.
  // Legacy/anonymous shared-link launches never have a pointer doc and get no
  // multiplier.
  const [timeMultiplier, setTimeMultiplier] = useState<
    number | 'unlimited' | undefined
  >(undefined);
  useEffect(() => {
    let cancelled = false;
    const loadOverride = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      try {
        const tokenResult = await currentUser.getIdTokenResult();
        if (tokenResult.claims?.studentRole !== true) return;
        const pointerId = session.assignmentId ?? session.id;
        const snap = await getDoc(
          doc(db, 'student_assignments', currentUser.uid, 'items', pointerId)
        );
        if (cancelled || !snap.exists()) return;
        const pointer = snap.data() as StudentAssignmentPointer;
        dispatch({
          type: 'pointerLoaded',
          excluded: pointer.excluded === true,
        });
        const multiplier = pointer.override?.timeMultiplier;
        if (multiplier !== undefined) setTimeMultiplier(multiplier);
      } catch {
        // No pointer doc, or not entitled — treat as no accommodation.
      }
    };
    void loadOverride();
    return () => {
      cancelled = true;
    };
  }, [session.id, session.assignmentId, authedUid]);

  // View tracking — log each pageview of a view-only Share link as an
  // immutable doc in the session's `views/` subcollection. The teacher's
  // Shared archive aggregates the count via getCountFromServer(). Best-effort
  // and fire-and-forget. `wroteViewRef` dedupes within a single mount
  // (StrictMode double-invoke, session-doc re-emits) — refresh-inflation
  // across mounts is accepted per the "URL opens" framing.
  const wroteViewRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isViewOnly || !authedUid) return;
    if (wroteViewRef.current === session.id) return;
    wroteViewRef.current = session.id;
    const sessionId = session.id;
    void addDoc(collection(db, SESSIONS_COLLECTION, sessionId, 'views'), {
      viewedAt: serverTimestamp(),
    }).catch((err) => {
      // logError so sustained failures surface in error-level filters.
      logError('MiniAppStudentApp.viewLog', err, { sessionId });
    });
  }, [session.id, isViewOnly, authedUid]);

  // On mount, check Firestore for an existing submission so `hasSubmitted`
  // survives page refreshes. If the doc already exists we hide the "I'm Done"
  // button immediately without waiting for a user action.
  useEffect(() => {
    const checkExisting = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      try {
        const tokenResult = await currentUser.getIdTokenResult();
        const isStudentRole = tokenResult.claims?.studentRole === true;
        const docId = isStudentRole
          ? await getCachedPseudonym(session.id, currentUser.uid)
          : currentUser.uid;
        const snap = await getDoc(
          doc(db, SESSIONS_COLLECTION, session.id, 'submissions', docId)
        );
        if (snap.exists()) {
          const used = (snap.data() as MiniAppSubmission).attemptCount;
          dispatch({
            type: 'existingFound',
            attemptCount: isV2 && typeof used === 'number' ? used : undefined,
            attemptLimit,
          });
        }
      } catch {
        // Doc doesn't exist yet or network error — leave hasSubmitted false.
      }
    };
    void checkExisting();
  }, [session.id, isV2, attemptLimit]);

  // Handshake: post SPART_MINIAPP_INIT into the iframe once it loads so the
  // app knows whether to reveal its [data-spart-submit] button. The app is
  // expected to listen for this message and hide submit controls when
  // submissionsEnabled is false.
  // timeMultiplier must be applied silently by the generated app: never displayed, never labeled as extended/modified.
  const initPayload = useMemo<MiniAppInitPayload>(
    () =>
      isV2
        ? { submissionsEnabled, timeMultiplier, attemptsLeft }
        : { submissionsEnabled, timeMultiplier },
    [isV2, submissionsEnabled, timeMultiplier, attemptsLeft]
  );
  const handleIframeLoad = useCallback(() => {
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    if (menuGuardInjected) {
      target.postMessage(
        { type: MSG_BLOCK_CONTEXT_MENU, enabled: blockContextMenu },
        '*'
      );
    }
    target.postMessage({ type: MSG_INIT, payload: initPayload }, '*');
  }, [initPayload, menuGuardInjected, blockContextMenu]);

  // Re-post INIT whenever submissionsEnabled or timeMultiplier changes, so a
  // teacher toggling the assignment (or an accommodation resolving after
  // load) propagates to already-loaded iframes.
  useEffect(() => {
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    target.postMessage({ type: MSG_INIT, payload: initPayload }, '*');
  }, [initPayload]);

  const writeSubmission = useCallback(
    async (payload: unknown) => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.warn('[MiniAppStudentApp] No auth user; skipping submission.');
        dispatch({ type: 'saveFailed', payload });
        return;
      }

      dispatch({ type: 'saveStarted' });
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
          studentUid: currentUser.uid,
          payload: normalisedPayload,
          ...(await staffFieldsFor(session, currentUser)),
        };

        await setDoc(
          doc(db, SESSIONS_COLLECTION, session.id, 'submissions', docId),
          submission
        );
        dispatch({ type: 'saveSucceeded', at: Date.now() });
      } catch (err) {
        console.error('[MiniAppStudentApp] Submission write failed:', err);
        dispatch({ type: 'saveFailed', payload });
      }
    },
    [session]
  );

  const submit = useCallback(
    async (payload: unknown) => {
      if (paused && submissionsEnabled) {
        heldPayloadRef.current = { payload };
        return;
      }
      if (!submissionsEnabled) return;
      if (savingRef.current) {
        queuedPostRef.current = { payload };
        return;
      }
      savingRef.current = true;
      try {
        let next: { payload: unknown } | null = { payload };
        while (next) {
          await writeSubmission(next.payload);
          next = queuedPostRef.current;
          queuedPostRef.current = null;
        }
      } finally {
        savingRef.current = false;
      }
    },
    [submissionsEnabled, paused, writeSubmission]
  );

  // Held submissions go out once the period reopens.
  useEffect(() => {
    if (paused || !heldPayloadRef.current) return;
    const { payload } = heldPayloadRef.current;
    heldPayloadRef.current = null;
    void submit(payload);
  }, [paused, submit]);

  const replyToFrame = useCallback(
    (requestId: string | undefined, message: Record<string, unknown>) => {
      if (!requestId) return;
      iframeRef.current?.contentWindow?.postMessage(
        { type: MSG_SUBMIT_RESULT, requestId, ...message },
        '*'
      );
    },
    []
  );

  const sendV2 = useCallback(
    async (payload: unknown, request: SubmitRequest) => {
      dispatch({ type: 'saveStarted' });
      try {
        const result = await submitMiniAppResult(
          session.id,
          request.kind,
          payload
        );
        dispatch({
          type: 'saveSucceeded',
          at: Date.now(),
          attemptsUsed: result.attempt,
        });
        replyToFrame(request.requestId, { ok: true, result });
      } catch (err) {
        const code = submitErrorCode(err);
        replyToFrame(request.requestId, {
          ok: false,
          error: {
            code,
            message: err instanceof Error ? err.message : 'Not saved.',
          },
        });
        if (code === 'attempts-exhausted') {
          dispatch({ type: 'attemptsExhausted' });
        } else if (code === 'invalid-result') {
          logError('MiniAppStudentApp.invalidResult', err, {
            sessionId: session.id,
          });
          dispatch({ type: 'saveCleared' });
        } else {
          dispatch({ type: 'saveFailed', payload, request });
        }
      }
    },
    [session.id, replyToFrame]
  );

  const submitV2 = useCallback(
    async (payload: unknown, request: SubmitRequest) => {
      if (!submissionsEnabled) {
        replyToFrame(request.requestId, {
          ok: false,
          error: {
            code: 'submissions-off',
            message: 'Not taking submissions.',
          },
        });
        return;
      }
      if (paused) {
        heldRequestRef.current = { payload, request };
        return;
      }
      if (savingRef.current) {
        // Legacy apps post progress repeatedly and never retry, so keep the newest.
        if (request.kind === 'legacy') {
          queuedPostRef.current = { payload };
          return;
        }
        replyToFrame(request.requestId, {
          ok: false,
          error: { code: 'busy', message: 'Already saving.' },
        });
        return;
      }
      savingRef.current = true;
      try {
        let next: { payload: unknown; request: SubmitRequest } | null = {
          payload,
          request,
        };
        while (next) {
          await sendV2(next.payload, next.request);
          const queued: { payload: unknown } | null = queuedPostRef.current;
          queuedPostRef.current = null;
          next = queued
            ? { payload: queued.payload, request: { kind: 'legacy' } }
            : null;
        }
      } finally {
        savingRef.current = false;
      }
    },
    [submissionsEnabled, paused, replyToFrame, sendV2]
  );

  useEffect(() => {
    if (paused || !heldRequestRef.current) return;
    const { payload, request } = heldRequestRef.current;
    heldRequestRef.current = null;
    void submitV2(payload, request);
  }, [paused, submitV2]);

  // Writes a minimal {completed: true} completion marker so the student's
  // assignment badge in /my-assignments shows "Completed". Works for both
  // view-only (submissionsEnabled=false) and submission-enabled sessions.
  // The Firestore rule allows this write regardless of submissionsEnabled.
  const markDone = useCallback(async () => {
    if (hasSubmitted || paused || savingRef.current) return;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.warn('[MiniAppStudentApp] No auth user; skipping mark-done.');
      return;
    }
    savingRef.current = true;
    dispatch({ type: 'saveStarted' });
    try {
      if (isV2) {
        await submitMiniAppResult(session.id, 'done', null);
      } else {
        await writeDoneMarker(session, currentUser);
      }
      dispatch({ type: 'saveSucceeded', at: Date.now() });
    } catch (err) {
      console.error('[MiniAppStudentApp] Mark-done write failed:', err);
      dispatch({ type: 'saveCleared' });
    } finally {
      savingRef.current = false;
    }
    const queued = queuedPostRef.current;
    queuedPostRef.current = null;
    if (queued) {
      void (isV2
        ? submitV2(queued.payload, { kind: 'legacy' })
        : submit(queued.payload));
    }
  }, [session, hasSubmitted, paused, isV2, submit, submitV2]);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as {
        type?: string;
        payload?: unknown;
        requestId?: unknown;
      } | null;
      if (isV2) {
        if (data?.type === MSG_SUBMIT && typeof data.requestId === 'string')
          void submitV2(data.payload, {
            kind: 'result',
            requestId: data.requestId,
          });
        else if (data?.type === MSG_LEGACY_RESULT)
          void submitV2(data.payload, { kind: 'legacy' });
        return;
      }
      if (data?.type !== MSG_LEGACY_RESULT) return;
      void submit(data.payload);
    },
    [submit, submitV2, isV2]
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Auto-clear the transient "Saved" confirmation after 2.5s so it doesn't
  // linger over the activity.
  useEffect(() => {
    if (status.kind !== 'saved') return;
    const timeout = window.setTimeout(
      () => dispatch({ type: 'savedToastExpired' }),
      2500
    );
    return () => window.clearTimeout(timeout);
  }, [status]);

  const srcDoc = useMemo(() => {
    const html = isV2 ? injectMiniAppHelper(session.appHtml) : session.appHtml;
    return menuGuardInjected ? injectContextMenuGuard(html) : html;
  }, [isV2, session.appHtml, menuGuardInjected]);

  useEffect(() => {
    if (!menuGuardInjected) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: MSG_BLOCK_CONTEXT_MENU, enabled: blockContextMenu },
      '*'
    );
  }, [menuGuardInjected, blockContextMenu]);

  // Teacher skipped this student for this assignment.
  if (view.kind === 'excluded') return <AssignmentExcludedNotice />;
  if (view.kind === 'turnedIn') {
    return <TurnedInScreen appTitle={session.appTitle} />;
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-900 flex flex-col">
      <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500 z-10" />
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        title={session.appTitle}
        sandbox="allow-scripts allow-forms allow-modals"
        className="flex-1 w-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
        onLoad={handleIframeLoad}
      />
      {paused && <MiniAppPeriodPausedOverlay />}
      <SubmissionStatusOverlay
        status={status}
        onRetry={(payload) =>
          status.kind === 'error' && status.request
            ? void submitV2(payload, { kind: status.request.kind })
            : void submit(payload)
        }
      />
      {/* "I'm Done" button — allows students to mark the assignment complete
          regardless of whether the mini-app itself has a submit button.
          Hidden for view-only shares (no submissions tracked) and once the
          student has submitted (via app or this button). */}
      {!isViewOnly && !hasSubmitted && !paused && (
        <button
          type="button"
          onClick={() => void markDone()}
          disabled={status.kind === 'submitting'}
          aria-label="Mark this assignment as done"
          className="fixed bottom-4 right-4 z-20 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/90 text-white text-xs font-semibold hover:bg-slate-700 border border-slate-600/50 shadow-lg backdrop-blur-xs transition-all disabled:opacity-50 select-none"
        >
          {status.kind === 'submitting' ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Flag className="w-3.5 h-3.5 text-emerald-400" />
              I&apos;m Done
            </>
          )}
        </button>
      )}
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

const TurnedInScreen: React.FC<{ appTitle: string }> = ({ appTitle }) => (
  <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 p-8 text-center">
    <CheckCircle2 className="w-10 h-10 text-emerald-400" />
    <h1 className="text-white text-xl font-bold">Turned in</h1>
    <p className="text-white/60 max-w-sm">{appTitle}</p>
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
