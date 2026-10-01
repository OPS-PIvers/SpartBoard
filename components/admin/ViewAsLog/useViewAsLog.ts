import { useEffect, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import {
  VIEW_AS_LOG_ACTIONS,
  type RevertViewAsChangeRequest,
  type RevertViewAsChangeResponse,
  type ViewAsAuditAction,
} from '@/types/viewAs';

export const VIEW_AS_LOG_PAGE = 100;

export interface ViewAsLogEntry {
  id: string;
  action: ViewAsAuditAction;
  sid: string;
  email: string;
  targetEmail: string;
  path: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  revertOf: string | null;
  forced: boolean;
  timestampMs: number | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const fieldMap = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

const millis = (v: unknown): number | null => {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return typeof v === 'number' ? v : null;
};

export function toLogEntry(
  id: string,
  d: Record<string, unknown>
): ViewAsLogEntry {
  return {
    id,
    action: str(d.action) as ViewAsAuditAction,
    sid: str(d.sid),
    email: str(d.email),
    targetEmail: str(d.targetEmail),
    path: str(d.path) || null,
    before: fieldMap(d.before),
    after: fieldMap(d.after),
    reason: str(d.reason) || null,
    revertOf: str(d.revertOf) || null,
    forced: d.forced === true,
    timestampMs: millis(d.timestamp),
  };
}

interface LogState {
  key: number;
  entries: ViewAsLogEntry[];
  error: boolean;
}

/** Newest view-as audit entries, live. Super admins only (rules). */
export function useViewAsLog(pageCount: number) {
  const max = pageCount * VIEW_AS_LOG_PAGE;
  const [state, setState] = useState<LogState | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'admin_audit_log'),
      where('action', 'in', [...VIEW_AS_LOG_ACTIONS]),
      orderBy('timestamp', 'desc'),
      limit(max)
    );
    return onSnapshot(
      q,
      (snap) =>
        setState({
          key: max,
          entries: snap.docs.map((d) => toLogEntry(d.id, d.data())),
          error: false,
        }),
      () => setState({ key: max, entries: [], error: true })
    );
  }, [max]);

  const current = state?.key === max ? state : null;
  return {
    entries: current?.entries ?? state?.entries ?? [],
    loading: current === null,
    error: current?.error ?? false,
    hasMore: (current?.entries.length ?? 0) >= max,
  };
}

export async function revertViewAsChange(
  request: RevertViewAsChangeRequest
): Promise<RevertViewAsChangeResponse> {
  const call = httpsCallable<
    RevertViewAsChangeRequest,
    RevertViewAsChangeResponse
  >(functions, 'revertViewAsChangeV1');
  return (await call(request)).data;
}
