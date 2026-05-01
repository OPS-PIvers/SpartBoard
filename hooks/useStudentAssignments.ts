import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
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
 * quiz / video-activity / guided-learning. Mini-app and activity-wall stay
 * single-query as today.
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
  },
  'activity-wall': {
    collectionName: 'activity_wall_sessions',
    dualQuery: false,
    classFilterShape: 'single',
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

interface SubscriptionPlan {
  kind: SessionKind;
  channel: AssignmentChannel;
  shape: 'list' | 'single';
  /**
   * Concrete status value for this subscription, or `null` when the kind has
   * no status filter. Filters with multiple values (e.g., quiz active =
   * `['waiting', 'active']`) fan out into one plan per value: Firestore
   * forbids combining `in` with `array-contains-any` (or two `in` clauses)
   * in the same query, so each subscription must carry at most one
   * disjunctive constraint.
   */
  statusValue: string | null;
}

const planKey = (p: SubscriptionPlan): string =>
  `${p.kind}:${p.channel}:${p.shape}:${p.statusValue ?? '_'}`;

interface UseStudentAssignmentsResult {
  loadState: LoadState;
  /** All assignments, deduped by `(kind, sessionId)`, sorted newest-first. */
  assignments: AssignmentSummary[];
  /** True when at least one subscription bucket has errored. */
  hasErrors: boolean;
  retry: () => void;
}

interface UseStudentAssignmentsArgs {
  classIds: readonly string[];
}

export function useStudentAssignments({
  classIds,
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

    // Plan every (kind, channel, shape, statusValue) subscription up front.
    // Active channel always runs; Ended channel only for kinds that have a
    // status field. Dual-query kinds run BOTH list and single shapes.
    // Multi-value status filters (e.g., quiz active = waiting+active) fan
    // out into one plan per status so each query stays inside Firestore's
    // single-disjunctive-clause limit.
    const subs: SubscriptionPlan[] = [];
    for (const kind of SESSION_KINDS) {
      const config = KIND_CONFIG[kind];
      const channels: AssignmentChannel[] = ['active'];
      if (config.endedFilter !== null) channels.push('ended');
      for (const channel of channels) {
        const filter =
          channel === 'active' ? config.activeFilter : config.endedFilter;
        const statusValues: (string | null)[] =
          filter === null
            ? [null]
            : 'valueIn' in filter
              ? [...filter.valueIn]
              : [filter.value];
        for (const statusValue of statusValues) {
          if (config.dualQuery) {
            subs.push({ kind, channel, shape: 'list', statusValue });
            subs.push({ kind, channel, shape: 'single', statusValue });
          } else {
            subs.push({
              kind,
              channel,
              shape: config.classFilterShape,
              statusValue,
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

    const docToSummary = (
      kind: SessionKind,
      channel: AssignmentChannel,
      config: KindConfig,
      d: QuerySnapshot<DocumentData>['docs'][number]
    ): AssignmentSummary => {
      const data = d.data();
      const createdAtRaw: unknown = (data as Record<string, unknown>).createdAt;
      const endedAtRaw: unknown = (data as Record<string, unknown>).endedAt;

      // Compute the intersection of session classIds with student claims so
      // multi-class assignments fan out under each matching class. Falls
      // back to the legacy single-class field when classIds is absent.
      const sessionClassIds: string[] = Array.isArray(
        (data as Record<string, unknown>).classIds
      )
        ? ((data as Record<string, unknown>).classIds as unknown[]).filter(
            (c): c is string => typeof c === 'string'
          )
        : [];
      const legacyClassId =
        typeof (data as Record<string, unknown>).classId === 'string'
          ? ((data as Record<string, unknown>).classId as string)
          : '';
      const candidates =
        sessionClassIds.length > 0
          ? sessionClassIds
          : legacyClassId
            ? [legacyClassId]
            : [];
      const intersected = candidates.filter((c) => studentClassIds.has(c));

      return {
        compositeId: `${kind}:${d.id}`,
        kind,
        sessionId: d.id,
        title: config.titleFrom(data),
        openHref: config.hrefFrom(d.id, data),
        channel,
        classIds: intersected,
        createdAt: typeof createdAtRaw === 'number' ? createdAtRaw : undefined,
        endedAt: typeof endedAtRaw === 'number' ? endedAtRaw : undefined,
      };
    };

    const emit = (kind: SessionKind, channel: AssignmentChannel) => {
      // Merge across every (shape, statusValue) bucket for this kind+channel.
      // The status fan-out can produce multiple buckets per channel (e.g.,
      // quiz active fans out into `waiting` and `active` per shape).
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
      statusValue: string | null
    ): Query<DocumentData> => {
      const col = collection(db, config.collectionName);
      const constraints: QueryConstraint[] =
        shape === 'list'
          ? [where('classIds', 'array-contains-any', ids)]
          : [where('classId', 'in', ids)];
      if (statusValue !== null) {
        constraints.push(where('status', '==', statusValue));
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
      buckets.set(
        key,
        snap.docs
          .filter((d) => {
            const data = d.data() as Record<string, unknown>;
            return data[modeField] !== 'view-only';
          })
          .map((d) => docToSummary(plan.kind, plan.channel, config, d))
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
        `[useStudentAssignments] snapshot failed for ${KIND_CONFIG[plan.kind].collectionName} (${plan.channel}/${plan.shape}/${plan.statusValue ?? '_'}) [${code}]:`,
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
      const q = buildQuery(config, plan.channel, plan.shape, plan.statusValue);
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
    const merged = new Map<string, AssignmentSummary>();
    for (const kind of SESSION_KINDS) {
      const activeKey = `${kind}:active`;
      const endedKey = `${kind}:ended`;
      const active = byKindChannel[activeKey] ?? [];
      const ended = byKindChannel[endedKey] ?? [];
      for (const a of active) merged.set(`${kind}:${a.sessionId}`, a);
      for (const a of ended) merged.set(`${kind}:${a.sessionId}`, a); // Ended overrides
    }
    const out = Array.from(merged.values());
    out.sort((a, b) => {
      const at = a.endedAt ?? a.createdAt ?? 0;
      const bt = b.endedAt ?? b.createdAt ?? 0;
      if (at !== bt) return bt - at;
      return a.title.localeCompare(b.title);
    });
    return out;
  }, [byKindChannel]);

  const retry = useCallback(() => setRetryNonce((n) => n + 1), []);

  return {
    loadState,
    assignments,
    hasErrors: erroredBuckets.size > 0,
    retry,
  };
}
