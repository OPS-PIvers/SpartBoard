import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Image as ImageIcon,
  Inbox,
  Loader2,
  LogOut,
  PlayCircle,
  Puzzle,
  Sparkles,
} from 'lucide-react';
import { db, functions } from '@/config/firebase';
import { APP_NAME } from '@/config/constants';
import { useStudentAuth } from '@/context/useStudentAuth';

/**
 * MyAssignmentsPage — Phase 2C of the ClassLink-via-Google auth flow.
 *
 * Landing page for a signed-in student. Subscribes to the five session
 * collections (`quiz_sessions`, `video_activity_sessions`,
 * `guided_learning_sessions`, `mini_app_sessions`, `activity_wall_sessions`),
 * filtered by `classId in classIds`, and renders the union as a single list.
 *
 * PII-free: reads only session-level fields (title, status, code, classId).
 * Never reads, logs, or persists email / displayName / sub. The only
 * identifier we touch is the custom-token pseudonym UID from
 * `useStudentAuth`.
 *
 * Completion check strategy: LAZY per-row. Each `AssignmentCard` kicks off
 * a single `getAssignmentPseudonymV1` callable (results cached across the
 * page lifetime via a shared `Map` ref) and then a single `getDoc`
 * existence check against the correct response subcollection. This lets
 * React render the list immediately and fill in completion badges as they
 * resolve, rather than blocking on a large Promise.all.
 *
 * Firestore `in` cap: `classIds` is capped at 20 by `studentLoginV1`.
 * Firestore's `where('x', 'in', arr)` supports up to 30 values. Do NOT
 * raise the `studentLoginV1` cap past 30 without splitting this query
 * into chunks.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SessionKind =
  | 'quiz'
  | 'video-activity'
  | 'guided-learning'
  | 'mini-app'
  | 'activity-wall';

interface AssignmentSummary {
  /** `${kind}:${sessionId}` — stable React key across collections. */
  compositeId: string;
  kind: SessionKind;
  sessionId: string;
  title: string;
  /** Fully-qualified path the student can click to open the session. */
  openHref: string;
  /** When the session was created (for sorting). May be undefined for ad-hoc docs. */
  createdAt?: number;
}

type LoadState = 'loading' | 'ready';

interface KindConfig {
  collectionName: string;
  /** Firestore status filter, or `null` when the collection has no status field. */
  statusFilter: { field: 'status'; value: 'active' } | null;
  /**
   * How this collection stores its class targeting:
   *   - `single` — a string `classId` field (queried with `where(..., 'in', classIds)`)
   *   - `list`   — an array `classIds` field (queried with `where(..., 'array-contains-any', classIds)`)
   * Mini-app sessions are `list` (multi-class targeting); every other kind
   * is still single-class.
   */
  classFilterShape: 'single' | 'list';
  /** Subcollection where per-student response/submission docs live; null when absent. */
  responseSubcollection: string | null;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Tailwind gradient for the card accent badge. */
  accent: string;
  /** Given a raw session document, build the display title. */
  titleFrom: (data: DocumentData) => string;
  /** Given a session id and the raw session doc, build the /open URL. */
  hrefFrom: (sessionId: string, data: DocumentData) => string;
}

// ---------------------------------------------------------------------------
// Per-kind configuration
// ---------------------------------------------------------------------------
//
// Fields verified against:
//   - `types.ts` (QuizSession, VideoActivitySession, MiniAppSession,
//     GuidedLearningSession)
//   - `firestore.rules` — each collection's `passesStudentClassGate` read rule
//   - `components/widgets/ActivityWall/Widget.tsx` (session doc is created
//     ad-hoc without a TS interface — fields confirmed from the setDoc call)
//
// Notes:
//   - guided_learning_sessions and activity_wall_sessions have NO status
//     field on the session document. The GL assignment wrapper lives in
//     /users/{teacherUid}/guided_learning_assignments and ActivityWall uses
//     the session's existence as liveness. We intentionally do not filter
//     those by status.
//   - mini_app_sessions submissions live under the `submissions` subcollection
//     (doc ID = per-assignment pseudonym for studentRole launches, auth uid
//     for anonymous launches). See MiniAppStudentApp.tsx for the write path
//     and firestore.rules for the matching read/create rules.

const KIND_CONFIG: Record<SessionKind, KindConfig> = {
  quiz: {
    collectionName: 'quiz_sessions',
    statusFilter: { field: 'status', value: 'active' },
    classFilterShape: 'single',
    responseSubcollection: 'responses',
    label: 'Quiz',
    icon: ClipboardList,
    accent: 'from-blue-500 to-indigo-600',
    titleFrom: (data) =>
      typeof data.quizTitle === 'string' && data.quizTitle.length > 0
        ? data.quizTitle
        : 'Untitled quiz',
    hrefFrom: (sessionId, data) => {
      // Quiz student app joins via ?code=<code> (the 6-char join code) rather
      // than sessionId. Fall back to sessionId if code isn't present on the
      // doc (shouldn't happen in practice, but keeps the link functional).
      const code =
        typeof data.code === 'string' && data.code.length > 0
          ? data.code
          : sessionId;
      return `/quiz?code=${encodeURIComponent(code)}`;
    },
  },
  'video-activity': {
    collectionName: 'video_activity_sessions',
    statusFilter: { field: 'status', value: 'active' },
    classFilterShape: 'single',
    responseSubcollection: 'responses',
    label: 'Video Activity',
    icon: PlayCircle,
    accent: 'from-rose-500 to-red-600',
    titleFrom: (data) => {
      if (
        typeof data.activityTitle === 'string' &&
        data.activityTitle.length > 0
      )
        return data.activityTitle;
      if (
        typeof data.assignmentName === 'string' &&
        data.assignmentName.length > 0
      )
        return data.assignmentName;
      return 'Video activity';
    },
    hrefFrom: (sessionId) => `/activity/${encodeURIComponent(sessionId)}`,
  },
  'guided-learning': {
    collectionName: 'guided_learning_sessions',
    statusFilter: null, // No status field; session presence = live.
    classFilterShape: 'single',
    responseSubcollection: 'responses',
    label: 'Guided Learning',
    icon: Sparkles,
    accent: 'from-emerald-500 to-teal-600',
    titleFrom: (data) =>
      typeof data.title === 'string' && data.title.length > 0
        ? data.title
        : 'Guided learning',
    hrefFrom: (sessionId) =>
      `/guided-learning/${encodeURIComponent(sessionId)}`,
  },
  'mini-app': {
    collectionName: 'mini_app_sessions',
    statusFilter: { field: 'status', value: 'active' },
    classFilterShape: 'list',
    responseSubcollection: 'submissions',
    label: 'Mini App',
    icon: Puzzle,
    accent: 'from-violet-500 to-purple-600',
    titleFrom: (data) => {
      if (typeof data.appTitle === 'string' && data.appTitle.length > 0)
        return data.appTitle;
      if (
        typeof data.assignmentName === 'string' &&
        data.assignmentName.length > 0
      )
        return data.assignmentName;
      return 'Mini app';
    },
    hrefFrom: (sessionId) => `/miniapp/${encodeURIComponent(sessionId)}`,
  },
  'activity-wall': {
    collectionName: 'activity_wall_sessions',
    statusFilter: null, // No status field on the session doc.
    classFilterShape: 'single',
    // ActivityWall submissions are a LIST per student (students can post
    // multiple). We still use existence as a "has the student participated
    // yet?" signal — but the doc id is the pseudonym, so this is a
    // best-effort hint, not a true completion.
    responseSubcollection: 'submissions',
    label: 'Activity Wall',
    icon: ImageIcon,
    accent: 'from-amber-500 to-orange-600',
    titleFrom: (data) =>
      typeof data.title === 'string' && data.title.length > 0
        ? data.title
        : 'Activity wall',
    hrefFrom: (sessionId) =>
      // ActivityWall student app normally expects a `?data=<base64>` payload
      // that the teacher builds. A class-targeted launch doesn't carry that
      // payload yet (Phase 3E will wire it). For now we link to the session
      // route — the student app may show an error until Phase 3E lands.
      `/activity-wall/${encodeURIComponent(sessionId)}`,
  },
};

const SESSION_KINDS: readonly SessionKind[] = [
  'quiz',
  'video-activity',
  'guided-learning',
  'mini-app',
  'activity-wall',
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

interface AssignmentsByKind {
  [kind: string]: AssignmentSummary[];
}

const MyAssignmentsPage: React.FC = () => {
  const { classIds, pseudonymUid, signOut } = useStudentAuth();
  const [byKind, setByKind] = useState<AssignmentsByKind>(() =>
    Object.fromEntries(SESSION_KINDS.map((k) => [k, []]))
  );
  const [loadState, setLoadState] = useState<LoadState>('loading');

  // Track which kinds have delivered their first snapshot so we can flip
  // from `loading` -> `ready` only once every subscription has settled.
  const settledKindsRef = useRef<Set<SessionKind>>(new Set());

  // Stable subscription identity: we only re-subscribe when classIds actually
  // changes, not on every render.
  const classIdsKey = useMemo(
    () => classIds.slice().sort().join('|'),
    [classIds]
  );

  useEffect(() => {
    // No classes → no queries (Firestore rejects `in` with []).
    if (classIds.length === 0) {
      setByKind(Object.fromEntries(SESSION_KINDS.map((k) => [k, []])));
      setLoadState('ready');
      return;
    }

    setLoadState('loading');
    settledKindsRef.current = new Set();

    const unsubs: Array<() => void> = [];

    const handleSnapshot = (
      kind: SessionKind,
      snap: QuerySnapshot<DocumentData>
    ) => {
      const config = KIND_CONFIG[kind];
      const items: AssignmentSummary[] = snap.docs.map((d) => {
        const data = d.data();
        const createdAtRaw: unknown = (data as Record<string, unknown>)
          .createdAt;
        return {
          compositeId: `${kind}:${d.id}`,
          kind,
          sessionId: d.id,
          title: config.titleFrom(data),
          openHref: config.hrefFrom(d.id, data),
          createdAt:
            typeof createdAtRaw === 'number' ? createdAtRaw : undefined,
        };
      });

      setByKind((prev) => ({ ...prev, [kind]: items }));
      settledKindsRef.current.add(kind);
      if (settledKindsRef.current.size === SESSION_KINDS.length) {
        setLoadState('ready');
      }
    };

    const handleError = (kind: SessionKind, err: unknown) => {
      // PII safety: never log the error message or data — it may contain
      // diagnostic data derived from the query. Log only the collection
      // name and Firestore error code.
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: unknown }).code)
          : 'unknown';
      console.warn(
        `[MyAssignments] snapshot failed for ${KIND_CONFIG[kind].collectionName}:`,
        code
      );
      // Mark as settled with an empty list so loading state can progress.
      setByKind((prev) => ({ ...prev, [kind]: [] }));
      settledKindsRef.current.add(kind);
      if (settledKindsRef.current.size === SESSION_KINDS.length) {
        setLoadState('ready');
      }
    };

    for (const kind of SESSION_KINDS) {
      const config = KIND_CONFIG[kind];
      const col = collection(db, config.collectionName);
      const constraints =
        config.classFilterShape === 'list'
          ? [where('classIds', 'array-contains-any', classIds)]
          : [where('classId', 'in', classIds)];
      if (config.statusFilter) {
        constraints.push(
          where(config.statusFilter.field, '==', config.statusFilter.value)
        );
      }
      const q = query(col, ...constraints);
      const unsub = onSnapshot(
        q,
        (snap) => handleSnapshot(kind, snap),
        (err) => handleError(kind, err)
      );
      unsubs.push(unsub);
    }

    return () => {
      for (const u of unsubs) u();
    };
    // `classIds` drives the `in` filter; re-subscribe only when the key
    // changes. `classIdsKey` is derived from `classIds` and gives us a
    // value-based comparison instead of reference identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classIdsKey]);

  // Flatten + sort: newest first, grouped visually by kind order inside a
  // single list. Sort is stable on `createdAt` (desc), then by title to
  // keep ordering deterministic when createdAt is missing.
  const assignments: AssignmentSummary[] = useMemo(() => {
    const merged: AssignmentSummary[] = [];
    for (const kind of SESSION_KINDS) {
      const list = byKind[kind] ?? [];
      merged.push(...list);
    }
    merged.sort((a, b) => {
      const ac = a.createdAt ?? 0;
      const bc = b.createdAt ?? 0;
      if (ac !== bc) return bc - ac;
      return a.title.localeCompare(b.title);
    });
    return merged;
  }, [byKind]);

  const handleDone = useCallback(() => {
    void signOut();
  }, [signOut]);

  return (
    <div className="relative min-h-screen w-screen bg-slate-50 overflow-x-hidden font-sans">
      {/* Ambient background, matches StudentLoginPage */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-50" />
      <div className="pointer-events-none absolute top-[-10%] left-[-15%] w-[500px] h-[500px] rounded-full blur-[120px] bg-brand-blue-primary/15" />
      <div className="pointer-events-none absolute bottom-[-15%] right-[-10%] w-[500px] h-[500px] bg-brand-red-primary/10 rounded-full blur-[120px]" />

      <div className="relative z-10 flex flex-col min-h-screen">
        <Header onDone={handleDone} />

        <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">
              My Assignments
            </h2>
            <p className="text-slate-500 text-sm sm:text-base mt-1.5 font-medium">
              Everything your teachers have active for your classes right now.
            </p>
          </div>

          <AssignmentsBody
            loadState={loadState}
            classIds={classIds}
            assignments={assignments}
            pseudonymUid={pseudonymUid}
          />
        </main>

        <footer className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 text-center text-xs text-slate-400 font-medium">
          {APP_NAME}
        </footer>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Header — brand + "Done" sign-out
// ---------------------------------------------------------------------------

const Header: React.FC<{ onDone: () => void }> = ({ onDone }) => (
  <header className="w-full max-w-3xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 flex items-center justify-between gap-4">
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-10 h-10 bg-gradient-to-br from-brand-blue-primary to-brand-blue-dark rounded-xl flex items-center justify-center shadow-md shadow-brand-blue-primary/20 shrink-0">
        <GraduationCap className="w-5 h-5 text-white" strokeWidth={2.5} />
      </div>
      <span className="text-lg sm:text-xl font-black text-slate-800 tracking-tight truncate">
        {APP_NAME}
      </span>
    </div>

    <button
      type="button"
      onClick={onDone}
      aria-label="Done — sign out"
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/70 backdrop-blur-sm border border-slate-200 text-slate-700 hover:bg-white hover:border-slate-300 text-sm font-semibold shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
    >
      <LogOut className="w-4 h-4" strokeWidth={2.25} />
      <span>Done</span>
    </button>
  </header>
);

// ---------------------------------------------------------------------------
// Body — loading / empty / list
// ---------------------------------------------------------------------------

interface AssignmentsBodyProps {
  loadState: LoadState;
  classIds: string[];
  assignments: AssignmentSummary[];
  pseudonymUid: string | null;
}

const AssignmentsBody: React.FC<AssignmentsBodyProps> = ({
  loadState,
  classIds,
  assignments,
  pseudonymUid,
}) => {
  if (loadState === 'loading') {
    return (
      <div className="min-h-[200px] flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-brand-blue-primary" />
        <p className="text-sm font-medium">Loading your assignments…</p>
      </div>
    );
  }

  if (classIds.length === 0) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="You're not on a roster yet"
        body="You're not on any class rosters yet. If you just started at your school, ask a teacher to sync their roster."
        tone="soft"
      />
    );
  }

  if (assignments.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="All caught up"
        body="You're all caught up — no active assignments right now."
        tone="soft"
      />
    );
  }

  return (
    <ul className="space-y-3">
      {assignments.map((a) => (
        <li key={a.compositeId}>
          <AssignmentCard assignment={a} pseudonymUid={pseudonymUid} />
        </li>
      ))}
    </ul>
  );
};

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  body: string;
  tone: 'soft' | 'error';
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  body,
  tone,
}) => {
  const isSoft = tone === 'soft';
  return (
    <div className="min-h-[240px] flex flex-col items-center justify-center gap-4 text-center px-6 py-12">
      <div
        className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
          isSoft ? 'bg-slate-100' : 'bg-brand-red-primary/10'
        }`}
      >
        <Icon
          className={`w-7 h-7 ${
            isSoft ? 'text-slate-400' : 'text-brand-red-primary'
          }`}
          strokeWidth={2}
        />
      </div>
      <div className="max-w-sm space-y-1.5">
        <h3 className="text-base font-bold text-slate-800">{title}</h3>
        <p className="text-sm text-slate-500 leading-relaxed">{body}</p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Assignment card — lazy completion check
// ---------------------------------------------------------------------------
//
// Pseudonym cache: sessionId -> pseudonym (Promise-valued so concurrent
// readers de-dupe the callable). This is module-local, so it survives
// card remounts within a single page lifetime without re-fetching.
// Pseudonyms are stable for a given (uid, assignmentId) within a session;
// we rebuild the cache whenever the authenticated uid changes (tracked
// via `pseudonymCacheOwnerUid`).

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

  // Evict on failure so a retry on a later card re-attempts the fetch.
  promise.catch(() => {
    if (pseudonymCache.get(sessionId) === promise) {
      pseudonymCache.delete(sessionId);
    }
  });

  return promise;
}

type CompletionState = 'unknown' | 'completed' | 'not-completed';

const AssignmentCard: React.FC<{
  assignment: AssignmentSummary;
  pseudonymUid: string | null;
}> = ({ assignment, pseudonymUid }) => {
  const config = KIND_CONFIG[assignment.kind];
  const [completion, setCompletion] = useState<CompletionState>('unknown');

  // Lazy completion: fire one callable + one getDoc per card on mount.
  // Pseudonym results are cached via `getCachedPseudonym`, so 30
  // assignments from the same student = 30 callables (unavoidable —
  // one per sessionId) and 30 doc reads. Same-kind retries reuse cached
  // pseudonyms on remount.
  useEffect(() => {
    if (!pseudonymUid) return;
    if (!config.responseSubcollection) {
      // Collection has no per-student response docs — skip the badge.
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const pseudonym = await getCachedPseudonym(
          assignment.sessionId,
          pseudonymUid
        );
        if (cancelled) return;

        const responseSub = config.responseSubcollection;
        if (!responseSub) return;
        const snap = await getDoc(
          doc(
            db,
            config.collectionName,
            assignment.sessionId,
            responseSub,
            pseudonym
          )
        );
        if (cancelled) return;
        setCompletion(snap.exists() ? 'completed' : 'not-completed');
      } catch {
        // Silent: a failed completion check shouldn't block the student
        // from opening the assignment. Leave completion as 'unknown'.
        if (cancelled) return;
        setCompletion('unknown');
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    assignment.sessionId,
    pseudonymUid,
    config.responseSubcollection,
    config.collectionName,
  ]);

  const Icon = config.icon;
  const isCompleted = completion === 'completed';

  return (
    <a
      href={assignment.openHref}
      className={`group block rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-md hover:border-slate-300 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 ${
        isCompleted ? 'opacity-75' : ''
      }`}
    >
      <div className="flex items-center gap-4 p-4 sm:p-5">
        <div
          className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${config.accent} flex items-center justify-center shadow-sm shrink-0`}
          aria-hidden="true"
        >
          <Icon
            className="w-5 h-5 sm:w-6 sm:h-6 text-white"
            strokeWidth={2.25}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] sm:text-xs uppercase font-bold tracking-wider text-slate-400">
              {config.label}
            </span>
            {isCompleted && (
              <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />
                Completed
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm sm:text-base font-bold text-slate-800 truncate">
            {assignment.title}
          </p>
        </div>

        <span
          className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-lg bg-brand-blue-primary text-white text-xs font-semibold shadow-sm shadow-brand-blue-primary/20 group-hover:bg-brand-blue-dark transition shrink-0"
          aria-hidden="true"
        >
          Open
        </span>
      </div>
    </a>
  );
};

export default MyAssignmentsPage;
export { MyAssignmentsPage };
