import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Query,
  type QueryConstraint,
  type QuerySnapshot,
} from 'firebase/firestore';
import {
  ClipboardList,
  Image as ImageIcon,
  PlayCircle,
  Puzzle,
  Sparkles,
} from 'lucide-react';
import { db, isAuthBypass } from '@/config/firebase';
import type { StudentAssignmentPointer, StudentOverride } from '@/types';

/**
 * useStudentAssignments
 *
 * Owns every Firestore subscription that powers the student `/my-assignments`
 * page. Lifted out of the page component so the new sidebar+content shell
 * can share state across the Overview and per-class views without re-running
 * subscriptions on each tab switch.
 *
 * Subscribes to two channels per supported session kind:
 *   A. Active   — the existing flow ("status: active", or no status filter
 *                 for collections without one).
 *   B. Ended    — quiz / video-activity / mini-app, filtered to
 *                 status === 'ended', ordered by endedAt desc, capped at 50
 *                 per shape so the Completed list bounds Firestore reads.
 *
 * Dual-query (classIds array + legacy classId field) is preserved for
 * quiz / video-activity / guided-learning / activity-wall. Mini-app is the
 * sole single-query kind.
 *
 * The page applies the Active/Completed partition rule using the per-row
 * lazy completion check (see AssignmentListItem). This hook does not
 * compute completion itself — it only delivers the row plus its source
 * channel so the partition can resolve client-side.
 *
 * Bounded growth: the limit(50) on the Ended channel caps reads. The
 * Completed list is therefore a "recent history" view, not a full archive
 * — surfacing roughly the last 50 ended sessions per kind per query shape.
 */

export type SessionKind =
  | 'quiz'
  | 'video-activity'
  | 'guided-learning'
  | 'mini-app'
  | 'activity-wall';

export type AssignmentChannel = 'active' | 'ended';

export interface AssignmentSummary {
  /** `${kind}:${sessionId}` — stable React key across collections. */
  compositeId: string;
  kind: SessionKind;
  sessionId: string;
  title: string;
  /** Fully-qualified path the student can click to open the session. */
  openHref: string;
  /** Source channel — used by the page to partition Active vs Completed. */
  channel: AssignmentChannel;
  /** classIds this assignment targets, intersected with the student's claims. */
  classIds: string[];
  createdAt?: number;
  endedAt?: number;
  /**
   * Whether the teacher has published grades / made results visible to the
   * student. Drives the Completed-row status chip ("Not graded" vs "View
   * results"). For kinds without an explicit publish step, this stays
   * 'not-graded' — the student still sees their submission; the chip just
   * doesn't promise a score is waiting.
   */
  gradingState: 'not-graded' | 'graded';
  /** True when the session used per-student targeting (M17 spec §2a). */
  individualTargeting?: boolean;
  /** Window/due fields, session-level; pointer-fan-out values win when present (M17 C1). */
  openAt?: number;
  closeAt?: number;
  dueAt?: number;
  /** This student's accommodation override, from their own pointer doc (M17 C1). */
  override?: StudentOverride;
  /** Activity Wall only — whether the wall is currently accepting new posts (P3-2). */
  acceptingResponses?: boolean;
  /** Activity Wall only — true when a view-only gallery share exists (P3-2). */
  publiclyShared?: boolean;
  /** Activity Wall only — short-link code for the gallery share, if any (P3-2). */
  latestShareCode?: string;
}

export type LoadState = 'loading' | 'ready';

type StatusFilter =
  | { field: 'status'; value: string }
  | { field: 'status'; valueIn: readonly string[] }
  | null;

interface KindConfig {
  collectionName: string;
  /** Run BOTH a list query (classIds array-contains-any) AND a single query (classId in). */
  dualQuery: boolean;
  /** When dualQuery is false, this picks which shape to issue. */
  classFilterShape: 'list' | 'single';
  /** Filter for the Active channel. */
  activeFilter: StatusFilter;
  /**
   * Filter for the Ended channel. When `null`, this kind has no status field
   * and the Active channel is the only subscription.
   */
  endedFilter: StatusFilter;
  /** Ordering field for the Ended channel (used with limit). */
  endedOrderBy?: 'endedAt' | 'updatedAt';
  /** Cap on Ended results per shape per kind. */
  endedLimit: number;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Tailwind gradient for the card accent badge. */
  accent: string;
  titleFrom: (data: DocumentData) => string;
  hrefFrom: (sessionId: string, data: DocumentData) => string;
  /**
   * Derive whether grades / results have been published to the student from
   * the session document. Each kind decides its own publish signal — quiz
   * uses `scoreVisibility` + `scorePublishedAt`; other kinds default to
   * 'not-graded' until they grow an explicit publish step.
   */
  gradingStateFrom: (data: DocumentData) => 'not-graded' | 'graded';
}

/**
 * Shared publication-field parser for Quiz / GL `gradingStateFrom`.
 * Returns 'graded' iff `scoreVisibility` is a non-'none' string AND
 * `scorePublishedAt` is a number — matching the contract that
 * `publishAssignmentScores` writes both atomically.
 *
 * Malformed snapshots (wrong types) are warned at most once per
 * `kind:sessionVisibility:sessionPublishedAt` shape signature. Without
 * this throttle, a single bad doc would `console.warn` on every
 * snapshot delivery and drown out real errors — `gradingStateFrom` is
 * called per assignment per snapshot.
 */
const warnedPublicationKeys = new Set<string>();
/** @internal — exported only for the test harness. */
export function parsePublicationFields(
  kind: string,
  data: DocumentData
): 'not-graded' | 'graded' {
  if (!data || typeof data !== 'object') return 'not-graded';
  const visibility = (data as Record<string, unknown>).scoreVisibility;
  const publishedAt = (data as Record<string, unknown>).scorePublishedAt;
  if (
    (visibility !== undefined && typeof visibility !== 'string') ||
    (publishedAt !== undefined && typeof publishedAt !== 'number')
  ) {
    const key = `${kind}:${typeof visibility}:${typeof publishedAt}`;
    if (!warnedPublicationKeys.has(key)) {
      warnedPublicationKeys.add(key);
      console.warn(
        `[useStudentAssignments] malformed ${kind} publication fields`,
        { scoreVisibility: visibility, scorePublishedAt: publishedAt }
      );
    }
  }
  const isVisible = typeof visibility === 'string' && visibility !== 'none';
  const isPublished = typeof publishedAt === 'number';
  return isVisible && isPublished ? 'graded' : 'not-graded';
}

export const KIND_CONFIG: Record<SessionKind, KindConfig> = {
  quiz: {
    collectionName: 'quiz_sessions',
    dualQuery: true,
    classFilterShape: 'single',
    activeFilter: { field: 'status', valueIn: ['waiting', 'active'] },
    endedFilter: { field: 'status', value: 'ended' },
    endedOrderBy: 'endedAt',
    endedLimit: 50,
    label: 'Quiz',
    icon: ClipboardList,
    accent: 'from-blue-500 to-indigo-600',
    titleFrom: (data) =>
      typeof data.quizTitle === 'string' && data.quizTitle.length > 0
        ? data.quizTitle
        : 'Untitled quiz',
    hrefFrom: (sessionId, data) => {
      const code =
        typeof data.code === 'string' && data.code.length > 0
          ? data.code
          : sessionId;
      return `/quiz?code=${encodeURIComponent(code)}`;
    },
    gradingStateFrom: (data) => parsePublicationFields('quiz', data),
  },
  'video-activity': {
    collectionName: 'video_activity_sessions',
    dualQuery: true,
    classFilterShape: 'single',
    activeFilter: { field: 'status', value: 'active' },
    endedFilter: { field: 'status', value: 'ended' },
    endedOrderBy: 'endedAt',
    endedLimit: 50,
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
    gradingStateFrom: () => 'not-graded',
  },
  'guided-learning': {
    collectionName: 'guided_learning_sessions',
    dualQuery: true,
    classFilterShape: 'single',
    activeFilter: null, // No status field; existence = live.
    endedFilter: null, // No ended channel — partitioned by completion alone.
    endedLimit: 0,
    label: 'Guided Learning',
    icon: Sparkles,
    accent: 'from-emerald-500 to-teal-600',
    titleFrom: (data) =>
      typeof data.title === 'string' && data.title.length > 0
        ? data.title
        : 'Guided learning',
    hrefFrom: (sessionId) =>
      `/guided-learning/${encodeURIComponent(sessionId)}`,
    gradingStateFrom: (data) => parsePublicationFields('guided-learning', data),
  },
  'mini-app': {
    collectionName: 'mini_app_sessions',
    dualQuery: false,
    classFilterShape: 'list',
    activeFilter: { field: 'status', value: 'active' },
    endedFilter: { field: 'status', value: 'ended' },
    endedOrderBy: 'endedAt',
    endedLimit: 50,
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
    gradingStateFrom: () => 'not-graded',
  },
  'activity-wall': {
    collectionName: 'activity_wall_sessions',
    dualQuery: true,
    classFilterShape: 'single', // inert: dualQuery already runs both shapes.
    activeFilter: null, // No status field on the session doc.
    endedFilter: null,
    endedLimit: 0,
    label: 'Activity Wall',
    icon: ImageIcon,
    accent: 'from-amber-500 to-orange-600',
    titleFrom: (data) =>
      typeof data.title === 'string' && data.title.length > 0
        ? data.title
        : 'Activity wall',
    hrefFrom: (sessionId) => `/activity-wall/${encodeURIComponent(sessionId)}`,
    gradingStateFrom: () => 'not-graded',
  },
};

export const SESSION_KINDS: readonly SessionKind[] = [
  'quiz',
  'video-activity',
  'guided-learning',
  'mini-app',
  'activity-wall',
];

// ---------------------------------------------------------------------------

/**
 * Build an `AssignmentSummary` from a session doc. Hoisted to module scope
 * (rather than a closure inside the subscription effect) so the fan-out
 * hydration path (M17 C1) can build the same shape from a one-off `getDoc`.
 */
function buildAssignmentSummary(
  kind: SessionKind,
  channel: AssignmentChannel,
  config: KindConfig,
  docId: string,
  data: DocumentData,
  studentClassIds: ReadonlySet<string>
): AssignmentSummary {
  const record = data as Record<string, unknown>;
  const createdAtRaw: unknown = record.createdAt;
  const endedAtRaw: unknown = record.endedAt;

  // Compute the intersection of session classIds with student claims so
  // multi-class assignments fan out under each matching class. Falls
  // back to the legacy single-class field when classIds is absent.
  const sessionClassIds: string[] = Array.isArray(record.classIds)
    ? (record.classIds as unknown[]).filter(
        (c): c is string => typeof c === 'string'
      )
    : [];
  const legacyClassId =
    typeof record.classId === 'string' ? record.classId : '';
  const candidates =
    sessionClassIds.length > 0
      ? sessionClassIds
      : legacyClassId
        ? [legacyClassId]
        : [];
  const intersected = candidates.filter((c) => studentClassIds.has(c));

  return {
    compositeId: `${kind}:${docId}`,
    kind,
    sessionId: docId,
    title: config.titleFrom(data),
    openHref: config.hrefFrom(docId, data),
    channel,
    classIds: intersected,
    createdAt: typeof createdAtRaw === 'number' ? createdAtRaw : undefined,
    endedAt: typeof endedAtRaw === 'number' ? endedAtRaw : undefined,
    gradingState: config.gradingStateFrom(data),
    individualTargeting: record.individualTargeting === true ? true : undefined,
    openAt: typeof record.openAt === 'number' ? record.openAt : undefined,
    closeAt: typeof record.closeAt === 'number' ? record.closeAt : undefined,
    dueAt: typeof record.dueAt === 'number' ? record.dueAt : undefined,
    acceptingResponses:
      typeof record.acceptingResponses === 'boolean'
        ? record.acceptingResponses
        : undefined,
    publiclyShared:
      typeof record.publiclyShared === 'boolean'
        ? record.publiclyShared
        : undefined,
    latestShareCode:
      typeof record.latestShareCode === 'string'
        ? record.latestShareCode
        : undefined,
  };
}

/**
 * Best-effort active/ended classification for a directly-hydrated session
 * doc (M17 C1) — kinds without an ended-status concept always read active.
 */
function channelForHydratedData(
  config: KindConfig,
  data: DocumentData
): AssignmentChannel {
  if (config.endedFilter === null) return 'active';
  const status = (data as Record<string, unknown>).status;
  if (typeof status !== 'string') return 'active';
  const filter = config.endedFilter;
  const matches =
    'valueIn' in filter
      ? filter.valueIn.includes(status)
      : status === filter.value;
  return matches ? 'ended' : 'active';
}

interface SubscriptionPlan {
  kind: SessionKind;
  channel: AssignmentChannel;
  shape: 'list' | 'single';
  /**
   * Status values this subscription accepts, or `null` when the kind has no
   * status filter. The planner expands multi-value filters into one plan per
   * status value, so in practice this is at most a single element here.
   *
   * Single-value filters apply `where('status', '==', value)` server-side,
   * which keeps reads bounded. A multi-value filter (e.g., quiz active =
   * `['waiting', 'active']`) CANNOT push all its statuses in one query: the
   * class filter already consumes the single allowed disjunctive clause
   * (`array-contains-any` for the list shape, `in` for the single shape), and
   * Firestore forbids a second `in`/`array-contains-any`. So rather than drop
   * the status filter server-side (which would stream the class's entire
   * session history, incl. the unbounded `ended` pile), the planner issues one
   * server-side-filtered listener per status value. `handleSnapshot` keeps a
   * defensive in-memory intersection for the (now normally unused)
   * multi-value case.
   *
   * The Ended channel only ever carries single-value filters, so its
   * server-side `orderBy(endedAt)` + `limit` cap is unaffected.
   */
  statusValues: readonly string[] | null;
}

const planKey = (p: SubscriptionPlan): string =>
  `${p.kind}:${p.channel}:${p.shape}:${p.statusValues?.join(',') ?? '_'}`;

interface UseStudentAssignmentsResult {
  loadState: LoadState;
  /** All assignments, deduped by `(kind, sessionId)`, sorted newest-first. */
  assignments: AssignmentSummary[];
  /**
   * True when at least one class-channel bucket OR the pointer/hydration
   * channel has errored. Drives the (non-blocking) PartialFailureBanner —
   * assignments already fetched still render underneath it.
   */
  hasErrors: boolean;
  /**
   * True only when a CLASS-channel bucket has errored (M17 C1 §F3). Drives
   * the full-screen "we couldn't load your assignments" gate — a pointer-
   * channel-only failure must not blank the page when class channels are
   * healthy; it degrades to the banner above instead.
   */
  hasClassErrors: boolean;
  retry: () => void;
}

interface UseStudentAssignmentsArgs {
  classIds: readonly string[];
  /**
   * The signed-in student's own uid (== `request.auth.uid` /
   * `StudentAuthContext.pseudonymUid`). Gates the `/student_assignments/{uid}/items`
   * fan-out listener (M17 C1); omit to keep today's class-channel-only behavior.
   */
  studentUid?: string | null;
}

export function useStudentAssignments({
  classIds,
  studentUid,
}: UseStudentAssignmentsArgs): UseStudentAssignmentsResult {
  const [byKindChannel, setByKindChannel] = useState<
    Record<string, AssignmentSummary[]>
  >({});
  const [loadState, setLoadState] = useState<LoadState>(() =>
    isAuthBypass ? 'ready' : 'loading'
  );
  const [erroredBuckets, setErroredBuckets] = useState<Set<string>>(
    () => new Set()
  );
  const [retryNonce, setRetryNonce] = useState(0);

  // M17 C1 — fan-out channel state. `pointerItems` mirrors the student's own
  // `/student_assignments/{uid}/items` collection; `hydratedSessions` caches
  // one-off `getDoc` results for pointers whose session isn't in any
  // class-channel bucket (`undefined` = not yet resolved, `null` = the
  // session doc is CONFIRMED missing and the pointer is dropped — a fetch
  // *error* is never cached here, see the hydration effect below). Session-
  // owned fields are frozen at whatever the first successful fetch returned
  // (hydrates via direct `getDoc`, not a listener) — any liveness upgrade is
  // the M17 E2 follow-up's concern, not this hook's.
  const [pointerItems, setPointerItems] = useState<
    Record<string, StudentAssignmentPointer>
  >({});
  const [pointerLoadState, setPointerLoadState] = useState<LoadState>(() =>
    isAuthBypass || !studentUid ? 'ready' : 'loading'
  );
  const [pointerErrored, setPointerErrored] = useState(false);
  const [hydratedSessions, setHydratedSessions] = useState<
    Record<string, AssignmentSummary | null>
  >({});

  const classIdsKey = useMemo(
    () => classIds.slice().sort().join('|'),
    [classIds]
  );

  // Reset bucket / error / load state when the subscription identity
  // changes — a new claim set or a retry. We use the "adjusting state
  // while rendering" pattern (https://react.dev/reference/react/useState
  // #storing-information-from-previous-renders) so the resets don't
  // become synchronous setStates inside the effect body. Whether the
  // post-reset state is `ready` (empty/bypass) or `loading` (about to
  // subscribe) is decided here too.
  const [resetIdentity, setResetIdentity] = useState<string>(
    `${classIdsKey}#${retryNonce}`
  );
  const currentIdentity = `${classIdsKey}#${retryNonce}`;
  if (resetIdentity !== currentIdentity) {
    setResetIdentity(currentIdentity);
    setByKindChannel({});
    setErroredBuckets(new Set());
    setLoadState(
      isAuthBypass || classIdsKey.length === 0 ? 'ready' : 'loading'
    );
  }

  // Same render-time reset pattern for the pointer channel, keyed on its own
  // identity (studentUid + retry) so a uid change or manual retry re-fetches
  // pointers and re-runs hydration from a clean slate.
  const [resetPointerIdentity, setResetPointerIdentity] = useState<string>(
    `${studentUid ?? ''}#${retryNonce}`
  );
  const currentPointerIdentity = `${studentUid ?? ''}#${retryNonce}`;
  if (resetPointerIdentity !== currentPointerIdentity) {
    setResetPointerIdentity(currentPointerIdentity);
    setPointerItems({});
    setHydratedSessions({});
    setPointerErrored(false);
    setPointerLoadState(isAuthBypass || !studentUid ? 'ready' : 'loading');
  }

  // Fan-out listener: the student's own pointer docs (M17 C1). Gated purely
  // on `studentUid` — omitting it (or auth-bypass) keeps legacy behavior.
  useEffect(() => {
    if (isAuthBypass || !studentUid) return;
    const ref = collection(db, 'student_assignments', studentUid, 'items');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const next: Record<string, StudentAssignmentPointer> = {};
        for (const d of snap.docs) {
          next[d.id] = d.data() as StudentAssignmentPointer;
        }
        setPointerItems(next);
        setPointerErrored(false);
        setPointerLoadState('ready');
      },
      (err) => {
        console.error('[useStudentAssignments] pointer snapshot failed', err);
        setPointerItems({});
        setPointerErrored(true);
        setPointerLoadState('ready');
      }
    );
    return () => unsub();
  }, [studentUid, retryNonce]);

  const studentClassIdsSet = useMemo(
    () => new Set(classIdsKey ? classIdsKey.split('|').filter(Boolean) : []),
    [classIdsKey]
  );

  // Every session already known through a class-channel bucket, unfiltered
  // (includes individually-targeted docs) — the pointer merge below reuses
  // these instead of re-fetching when a session is already in hand.
  const rawByKindSession = useMemo(() => {
    const map = new Map<string, AssignmentSummary>();
    for (const kind of SESSION_KINDS) {
      for (const channel of ['active', 'ended'] as const) {
        const rows = byKindChannel[`${kind}:${channel}`] ?? [];
        for (const row of rows) map.set(`${kind}:${row.sessionId}`, row);
      }
    }
    return map;
  }, [byKindChannel]);

  // Direct-hydration fallback: a pointer whose session isn't in any
  // class-channel bucket (ended-cap fallout, or GL's missing ended channel)
  // is fetched once via `getDoc`; a missing session doc drops the pointer.
  useEffect(() => {
    if (isAuthBypass) return;
    const toFetch: Array<[string, StudentAssignmentPointer]> = [];
    for (const [assignmentId, pointer] of Object.entries(pointerItems)) {
      const rawKey = `${pointer.kind}:${pointer.sessionId}`;
      if (rawByKindSession.has(rawKey)) continue;
      if (Object.prototype.hasOwnProperty.call(hydratedSessions, assignmentId))
        continue;
      toFetch.push([assignmentId, pointer]);
    }
    if (toFetch.length === 0) return;
    let cancelled = false;
    void (async () => {
      const updates: Record<string, AssignmentSummary | null> = {};
      // A transient getDoc rejection is NOT the same as a confirmed-missing
      // session (M17 C1 §F1): caching `null` on error would permanently hide
      // a valid assignment the next time this pointer is seen, with no way
      // to distinguish it from a real deletion. So a fetch error leaves the
      // assignmentId unresolved (retried whenever this effect's deps next
      // change, e.g. via the page's "Try again" retry) and only flips
      // `pointerErrored` so the existing partial-failure banner/retry path
      // surfaces it instead of silently dropping the row.
      let hadFetchError = false;
      for (const [assignmentId, pointer] of toFetch) {
        const config = KIND_CONFIG[pointer.kind];
        try {
          const snap = await getDoc(
            doc(db, config.collectionName, pointer.sessionId)
          );
          if (!snap.exists()) {
            updates[assignmentId] = null; // confirmed-missing — drop for real
            continue;
          }
          const data = snap.data();
          updates[assignmentId] = buildAssignmentSummary(
            pointer.kind,
            channelForHydratedData(config, data),
            config,
            pointer.sessionId,
            data,
            studentClassIdsSet
          );
        } catch (err) {
          console.error(
            '[useStudentAssignments] pointer session hydration failed',
            err
          );
          hadFetchError = true;
        }
      }
      if (!cancelled) {
        if (Object.keys(updates).length > 0) {
          setHydratedSessions((prev) => ({ ...prev, ...updates }));
        }
        if (hadFetchError) setPointerErrored(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pointerItems, rawByKindSession, hydratedSessions, studentClassIdsSet]);

  useEffect(() => {
    // Bypass mode renders the layout against an empty assignment list so the
    // page is exercisable in dev without a real Firestore backend. The
    // render-time reset above already left state in the correct shape;
    // the effect just skips the subscriptions.
    if (isAuthBypass) return;
    // Reconstitute the classIds list from the value-based key so the effect
    // can depend on `classIdsKey` alone (and not on `classIds` reference
    // identity, which would re-subscribe whenever the auth context emits a
    // fresh array even though the contents didn't change).
    const ids = classIdsKey ? classIdsKey.split('|').filter(Boolean) : [];
    if (ids.length === 0) return;

    // Plan every (kind, channel, shape, status) subscription up front. Active
    // channel always runs; Ended channel only for kinds that have a status
    // field. Dual-query kinds run BOTH list and single shapes. A multi-value
    // status filter (e.g., quiz active = waiting+active) fans out into one
    // listener per status value so each query filters status SERVER-SIDE,
    // keeping reads bounded — see the expansion below.
    const subs: SubscriptionPlan[] = [];
    for (const kind of SESSION_KINDS) {
      const config = KIND_CONFIG[kind];
      const channels: AssignmentChannel[] = ['active'];
      if (config.endedFilter !== null) channels.push('ended');
      for (const channel of channels) {
        const filter =
          channel === 'active' ? config.activeFilter : config.endedFilter;
        // Expand a multi-value status filter into ONE plan per status value so
        // each query can filter status server-side (`where('status','==',v)`),
        // keeping reads bounded. A single status-less query (Firestore can't
        // `in`-filter status alongside the class disjunctive clause) would
        // stream every matching doc — including the unbounded pile of `ended`
        // sessions that accumulate over a term — and discard the non-matching
        // ones in memory: a read-cost regression on a school-district budget.
        const statusGroups: (readonly string[] | null)[] =
          filter === null
            ? [null]
            : 'valueIn' in filter
              ? filter.valueIn.map((v) => [v])
              : [[filter.value]];
        for (const statusValues of statusGroups) {
          if (config.dualQuery) {
            subs.push({ kind, channel, shape: 'list', statusValues });
            subs.push({ kind, channel, shape: 'single', statusValues });
          } else {
            subs.push({
              kind,
              channel,
              shape: config.classFilterShape,
              statusValues,
            });
          }
        }
      }
    }
    const totalSubscriptions = subs.length;

    const buckets = new Map<string, AssignmentSummary[]>();
    const settled = new Set<string>();

    // Local copy of the student's classIds for fast intersection.
    const studentClassIds = new Set(ids);

    const emit = (kind: SessionKind, channel: AssignmentChannel) => {
      // Merge across every shape bucket for this kind+channel. Dual-query
      // kinds produce two buckets per channel (list + single); the single
      // listener per shape now owns all of that shape's statuses.
      const prefix = `${kind}:${channel}:`;
      const merged = new Map<string, AssignmentSummary>();
      for (const [key, rows] of buckets) {
        if (key.startsWith(prefix)) {
          for (const a of rows) merged.set(a.sessionId, a);
        }
      }
      const channelKey = `${kind}:${channel}`;
      setByKindChannel((prev) => ({
        ...prev,
        [channelKey]: Array.from(merged.values()),
      }));
    };

    const markSettled = (key: string) => {
      settled.add(key);
      if (settled.size === totalSubscriptions) {
        setLoadState('ready');
      }
    };

    const buildQuery = (
      config: KindConfig,
      channel: AssignmentChannel,
      shape: 'list' | 'single',
      statusValues: readonly string[] | null
    ): Query<DocumentData> => {
      const col = collection(db, config.collectionName);
      const constraints: QueryConstraint[] =
        shape === 'list'
          ? [where('classIds', 'array-contains-any', ids)]
          : [where('classId', 'in', ids)];
      // Push the status filter server-side as an `==` (it composes with the
      // class disjunctive clause), keeping reads bounded. The planner expands
      // multi-value filters into one single-value plan each, so `statusValues`
      // is at most one element here; the `> 1` branch in `handleSnapshot`
      // remains only as a defensive fallback.
      if (statusValues !== null && statusValues.length === 1) {
        constraints.push(where('status', '==', statusValues[0]));
      }
      if (channel === 'ended' && config.endedOrderBy) {
        constraints.push(orderBy(config.endedOrderBy, 'desc'));
        constraints.push(firestoreLimit(config.endedLimit));
      }
      return query(col, ...constraints);
    };

    const handleSnapshot = (
      plan: SubscriptionPlan,
      snap: QuerySnapshot<DocumentData>
    ) => {
      const config = KIND_CONFIG[plan.kind];
      const key = planKey(plan);
      // View-only sessions never appear in the student's My Assignments list:
      // they're shared links, not assignments. Pre-feature sessions don't
      // carry an assignment-mode field and pass through unchanged.
      //
      // Field-naming asymmetry: Quiz / Video Activity / Mini App store the
      // mode under `mode`. Guided Learning uses `assignmentMode` because GL's
      // session already has a `mode` field for play-mode (structured / guided
      // / explore). Filtering by `plan.kind` keeps each widget's check
      // narrow — using a single check that ORs both fields would, in theory,
      // drop a GL doc whose play-mode happened to spell 'view-only'.
      const modeField =
        plan.kind === 'guided-learning' ? 'assignmentMode' : 'mode';
      // Defensive fallback: the planner expands multi-value status filters into
      // single-value plans (each filtered server-side), so this branch is
      // normally inert. If a multi-value plan is ever issued it still
      // intersects the accepted statuses in memory. `null` (no status field)
      // and single-value filters accept every returned doc — a no-op.
      const acceptStatus =
        plan.statusValues !== null && plan.statusValues.length > 1
          ? new Set(plan.statusValues)
          : null;
      // Read each doc's `data()` exactly once — Firestore lazily decodes the
      // payload on each call, so the filter+map version below would parse
      // every doc twice for large assignment lists.
      buckets.set(
        key,
        snap.docs.flatMap((d) => {
          const data = d.data();
          if ((data as Record<string, unknown>)[modeField] === 'view-only') {
            return [];
          }
          if (acceptStatus !== null) {
            const status = (data as Record<string, unknown>).status;
            if (typeof status !== 'string' || !acceptStatus.has(status)) {
              return [];
            }
          }
          return [
            buildAssignmentSummary(
              plan.kind,
              plan.channel,
              config,
              d.id,
              data,
              studentClassIds
            ),
          ];
        })
      );
      emit(plan.kind, plan.channel);
      setErroredBuckets((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      markSettled(key);
    };

    const handleError = (plan: SubscriptionPlan, err: unknown) => {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: unknown }).code)
          : 'unknown';
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message)
          : '';
      console.error(
        `[useStudentAssignments] snapshot failed for ${KIND_CONFIG[plan.kind].collectionName} (${plan.channel}/${plan.shape}/${plan.statusValues?.join(',') ?? '_'}) [${code}]:`,
        message
      );
      const key = planKey(plan);
      buckets.set(key, []);
      emit(plan.kind, plan.channel);
      setErroredBuckets((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      markSettled(key);
    };

    const unsubs: Array<() => void> = [];
    for (const plan of subs) {
      const config = KIND_CONFIG[plan.kind];
      const q = buildQuery(config, plan.channel, plan.shape, plan.statusValues);
      unsubs.push(
        onSnapshot(
          q,
          (snap) => handleSnapshot(plan, snap),
          (err) => handleError(plan, err)
        )
      );
    }

    return () => {
      for (const u of unsubs) u();
    };
  }, [classIdsKey, retryNonce]);

  const assignments: AssignmentSummary[] = useMemo(() => {
    // Dedupe by (kind, sessionId): a row may show up in both Active and
    // Ended during a brief status transition. Prefer the Ended copy
    // because it carries `endedAt` for sorting.
    //
    // M17 C1: individually-targeted sessions (`individualTargeting: true`)
    // are dropped from the class channel here — recomputed on every render,
    // so a flag that arrives after initial render removes an already-shown
    // row instead of leaving it stranded. Pointer fan-out below is what
    // brings the targeted student's own copy back.
    const merged = new Map<string, AssignmentSummary>();
    for (const kind of SESSION_KINDS) {
      const activeKey = `${kind}:active`;
      const endedKey = `${kind}:ended`;
      const active = byKindChannel[activeKey] ?? [];
      const ended = byKindChannel[endedKey] ?? [];
      for (const a of active) {
        if (a.individualTargeting) continue;
        merged.set(`${kind}:${a.sessionId}`, a);
      }
      for (const a of ended) {
        if (a.individualTargeting) continue;
        merged.set(`${kind}:${a.sessionId}`, a); // Ended overrides
      }
    }

    // M17 C1: pointer fan-out. Dedupe key is the shared assignment/session
    // UUID (`pointer.sessionId`, scoped by kind); pointer wins openAt/closeAt
    // /dueAt/override, session wins title/status/content (the spread base).
    for (const [assignmentId, pointer] of Object.entries(pointerItems)) {
      const rawKey = `${pointer.kind}:${pointer.sessionId}`;
      const fromRaw = rawByKindSession.get(rawKey);
      const fromHydration = Object.prototype.hasOwnProperty.call(
        hydratedSessions,
        assignmentId
      )
        ? hydratedSessions[assignmentId]
        : undefined;
      const base = fromRaw ?? fromHydration;
      if (base === null || base === undefined) continue; // missing or not yet resolved
      merged.set(rawKey, {
        ...base,
        openAt: pointer.openAt ?? base.openAt,
        closeAt: pointer.closeAt ?? base.closeAt,
        dueAt: pointer.dueAt ?? base.dueAt,
        override: pointer.override,
      });
    }

    const out = Array.from(merged.values());
    out.sort((a, b) => {
      const at = a.endedAt ?? a.createdAt ?? 0;
      const bt = b.endedAt ?? b.createdAt ?? 0;
      if (at !== bt) return bt - at;
      return a.title.localeCompare(b.title);
    });
    return out;
  }, [byKindChannel, pointerItems, rawByKindSession, hydratedSessions]);

  const retry = useCallback(() => setRetryNonce((n) => n + 1), []);

  return {
    loadState:
      loadState === 'ready' && pointerLoadState === 'ready'
        ? 'ready'
        : 'loading',
    assignments,
    hasErrors: erroredBuckets.size > 0 || pointerErrored,
    hasClassErrors: erroredBuckets.size > 0,
    retry,
  };
}
