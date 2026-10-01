// "Saved to X's account" toast for unlocked direct saves (docs/plans/ADMIN_VIEW_AS.md D13).
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Z_INDEX } from '@/config/zIndex';
import { useAuth } from '@/context/useAuth';
import { useViewAs } from '@/context/useViewAs';
import { getViewAsTabState, subscribeViewAsTab } from '@/utils/viewAsTab';

const TOAST_TOP = 40;
const TOAST_MS = 3000;

export const ViewAsSaveToast: React.FC = () => {
  const viewAs = useViewAs();
  const { user } = useAuth();
  const tab = useSyncExternalStore(subscribeViewAsTab, getViewAsTabState);
  const [seen, setSeen] = useState(tab.savedNotice);
  const [visible, setVisible] = useState(false);

  if (tab.savedNotice !== seen) {
    setSeen(tab.savedNotice);
    setVisible(true);
  }
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), TOAST_MS);
    return () => clearTimeout(t);
  }, [visible, seen]);

  if (!viewAs || !visible) return null;
  const name = user?.displayName ?? viewAs.targetEmail;
  return (
    <div
      role="status"
      data-testid="view-as-save-toast"
      className="fixed left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold shadow-lg"
      style={{ top: TOAST_TOP, zIndex: Z_INDEX.viewAsBanner }}
    >
      Saved to {name}&rsquo;s account
    </div>
  );
};
