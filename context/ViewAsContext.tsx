// View as tab gate and context (docs/plans/ADMIN_VIEW_AS.md D4, D9).
import React, {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { getViewAsTabState, subscribeViewAsTab } from '@/utils/viewAsTab';
import {
  applyToken,
  bootViewAsTab,
  callUpdate,
  endViewAsSession,
  finishSession,
} from '@/utils/viewAsSession';
import { ViewAsContext, type ViewAsContextValue } from './ViewAsContextValue';

const EndedScreen: React.FC = () => (
  <div className="h-screen w-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
    <p className="text-lg font-semibold text-slate-800">View as ended</p>
    <button
      type="button"
      onClick={() => window.close()}
      className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700"
    >
      Close tab
    </button>
  </div>
);

export const ViewAsGate: React.FC<{
  loader: React.ReactNode;
  children: React.ReactNode;
}> = ({ loader, children }) => {
  const tab = useSyncExternalStore(subscribeViewAsTab, getViewAsTabState);
  const session = tab.session;

  useEffect(() => {
    void bootViewAsTab();
  }, []);

  const expiresAt = session?.expiresAt;
  useEffect(() => {
    if (expiresAt === undefined) return;
    const timer = setTimeout(
      () => void finishSession(true),
      Math.max(0, expiresAt - Date.now())
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);

  const renew = useCallback(async () => {
    const current = getViewAsTabState().session;
    if (!current) return;
    await applyToken(await callUpdate({ action: 'renew' }), current);
  }, []);

  const unlock = useCallback(async (reason: string) => {
    const current = getViewAsTabState().session;
    if (!current) return;
    await applyToken(await callUpdate({ action: 'unlock', reason }), current);
  }, []);

  const value = useMemo<ViewAsContextValue | null>(
    () =>
      session
        ? {
            sid: session.sid,
            targetUid: session.targetUid,
            targetEmail: session.targetEmail,
            adminTarget: session.adminTarget,
            expiresAt: session.expiresAt,
            readOnly: !tab.unlocked,
            canUnlock: session.canUnlock === true,
            renew,
            unlock,
            end: endViewAsSession,
          }
        : null,
    [session, tab.unlocked, renew, unlock]
  );

  if (tab.ended) return <EndedScreen />;
  if (!value) return <>{loader}</>;
  return (
    <ViewAsContext.Provider value={value}>{children}</ViewAsContext.Provider>
  );
};
