// "Saved to X's account" toast for unlocked direct saves (docs/plans/shipped/ADMIN_VIEW_AS.md D13).
import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useViewAs } from '@/context/useViewAs';
import { getViewAsTabState, subscribeViewAsTab } from '@/utils/viewAsTab';

/** Shows the app toast each time a View as save lands; renders nothing itself. */
export const ViewAsSaveNotice: React.FC = () => {
  const viewAs = useViewAs();
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const { savedNotice } = useSyncExternalStore(
    subscribeViewAsTab,
    getViewAsTabState
  );
  const seen = useRef(savedNotice);
  const name = user?.displayName ?? viewAs?.targetEmail;

  useEffect(() => {
    if (savedNotice === seen.current) return;
    seen.current = savedNotice;
    if (!viewAs) return;
    addToast(`Saved to ${name}’s account`, 'success', undefined, {
      replaceKey: 'view-as-saved',
    });
  }, [savedNotice, viewAs, name, addToast]);

  return null;
};
