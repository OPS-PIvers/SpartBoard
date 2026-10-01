// Persistent View as banner (docs/plans/ADMIN_VIEW_AS.md D9, D10).
import React, {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { Eye, Loader2 } from 'lucide-react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Z_INDEX } from '@/config/zIndex';
import { useAuth } from '@/context/useAuth';
import { useViewAs } from '@/context/useViewAs';
import { getViewAsTabState, subscribeViewAsTab } from '@/utils/viewAsTab';
import { formatLastActive } from '@/utils/viewAsFormat';
import {
  diffViewAsBoards,
  getViewAsWorkingCopy,
  subscribeViewAsWorkingCopy,
} from '@/utils/viewAsBoards';
import { UnlockDialog } from './UnlockDialog';
import { PendingChangesPanel } from './PendingChangesPanel';

const BANNER_HEIGHT = 32;
const RENEW_WINDOW_MS = 5 * 60 * 1000;
const RECENT_ACTIVITY_MS = 10 * 60 * 1000;
const NOTICE_MS = 4000;

const toMillis = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value) || 0;
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
};

/** D10: newest of the member doc's lastActive and the newest board's updatedAt. */
function useTargetLastActive(
  uid: string,
  email: string,
  orgId: string | null
): number {
  const [memberAt, setMemberAt] = useState(0);
  const [boardAt, setBoardAt] = useState(0);

  useEffect(() => {
    if (!orgId) return;
    return onSnapshot(
      doc(db, 'organizations', orgId, 'members', email.toLowerCase()),
      (snap) => setMemberAt(toMillis(snap.get('lastActive'))),
      () => setMemberAt(0)
    );
  }, [orgId, email]);

  useEffect(
    () =>
      onSnapshot(
        query(
          collection(db, 'users', uid, 'dashboards'),
          orderBy('updatedAt', 'desc'),
          limit(1)
        ),
        (snap) => setBoardAt(toMillis(snap.docs[0]?.get('updatedAt'))),
        () => setBoardAt(0)
      ),
    [uid]
  );

  return Math.max(memberAt, boardAt);
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export const ViewAsBanner: React.FC = () => {
  const viewAs = useViewAs();
  const { user, orgId } = useAuth();
  const tab = useSyncExternalStore(subscribeViewAsTab, getViewAsTabState);
  const now = useNow(15_000);
  const lastActive = useTargetLastActive(
    viewAs?.targetUid ?? '',
    viewAs?.targetEmail ?? '',
    orgId
  );
  const [busy, setBusy] = useState<'renew' | 'exit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noticeVisible, setNoticeVisible] = useState(false);
  const [seenNotice, setSeenNotice] = useState(0);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const workingCopy = useSyncExternalStore(
    subscribeViewAsWorkingCopy,
    getViewAsWorkingCopy
  );
  const pending = useMemo(() => diffViewAsBoards(workingCopy), [workingCopy]);

  // Adjust-during-render: show the View-only notice once, when the first write is blocked.
  if (tab.blockedNotice !== seenNotice) {
    setSeenNotice(tab.blockedNotice);
    setNoticeVisible(tab.blockedNotice > 0);
  }
  useEffect(() => {
    if (!noticeVisible) return;
    const t = setTimeout(() => setNoticeVisible(false), NOTICE_MS);
    return () => clearTimeout(t);
  }, [noticeVisible]);

  if (!viewAs) return null;
  const name = user?.displayName ?? viewAs.targetEmail;
  const remaining = viewAs.expiresAt - now;
  const recent = lastActive > 0 && now - lastActive < RECENT_ACTIVITY_MS;

  const run = (kind: 'renew' | 'exit', fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    fn()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      })
      .finally(() => setBusy(null));
  };

  return (
    <>
      <div
        role="region"
        aria-label="View as"
        data-testid="view-as-banner"
        className="fixed top-0 left-1/2 -translate-x-1/2 flex items-center gap-3 pl-3 pr-1.5 w-max max-w-[calc(100vw-24px)] rounded-b-lg bg-slate-900 text-white text-xs font-medium shadow-lg"
        style={{ height: BANNER_HEIGHT, zIndex: Z_INDEX.viewAsBanner }}
      >
        <Eye size={14} className="shrink-0 text-slate-300" aria-hidden />
        <span className="truncate">
          Viewing as <span className="font-bold">{name}</span>
        </span>
        <span className="shrink-0 text-amber-300 font-semibold">
          {viewAs.readOnly ? 'Read-only' : 'Edits unlocked'}
        </span>
        <span
          className={`shrink-0 hidden sm:inline ${
            recent ? 'text-amber-300' : 'text-slate-300'
          }`}
        >
          {formatLastActive(lastActive, now)}
        </span>
        {error && (
          <span className="truncate text-red-300" role="alert">
            {error}
          </span>
        )}
        <div className="flex items-center gap-2 shrink-0">
          {pending.length > 0 && (
            <button
              type="button"
              aria-expanded={pendingOpen}
              data-testid="view-as-pending-toggle"
              onClick={() => setPendingOpen((open) => !open)}
              className="px-2 py-0.5 rounded border border-white/30 hover:bg-white/10"
            >
              Pending changes ({pending.length})
            </button>
          )}
          {viewAs.readOnly && !viewAs.adminTarget && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setUnlockOpen(true)}
              className="px-2 py-0.5 rounded border border-white/30 hover:bg-white/10 disabled:opacity-50"
            >
              Unlock edits
            </button>
          )}
          {remaining <= RENEW_WINDOW_MS && (
            <>
              <span className="text-slate-300">
                Ends in {Math.max(1, Math.ceil(remaining / 60_000))} min
              </span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run('renew', viewAs.renew)}
                className="px-2 py-0.5 rounded border border-white/30 hover:bg-white/10 disabled:opacity-50"
              >
                {busy === 'renew' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  'Renew'
                )}
              </button>
            </>
          )}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run('exit', viewAs.end)}
            className="px-2 py-0.5 rounded bg-white text-slate-900 font-semibold hover:bg-slate-200 disabled:opacity-50"
          >
            Exit
          </button>
        </div>
      </div>
      {pendingOpen && (
        <PendingChangesPanel
          changes={pending}
          readOnly={viewAs.readOnly}
          top={BANNER_HEIGHT + 8}
          onClose={() => setPendingOpen(false)}
        />
      )}
      <UnlockDialog
        isOpen={unlockOpen}
        onClose={() => setUnlockOpen(false)}
        onUnlock={viewAs.unlock}
        name={name}
        recentlyActive={recent}
      />
      {noticeVisible && (
        <div
          role="status"
          className="fixed left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold shadow-lg"
          style={{
            top: BANNER_HEIGHT + 8,
            zIndex: Z_INDEX.viewAsBanner,
          }}
        >
          View-only
        </div>
      )}
    </>
  );
};
