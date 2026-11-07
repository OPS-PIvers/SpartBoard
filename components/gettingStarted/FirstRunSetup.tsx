import React, { useEffect, useEffectEvent } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { DEFAULT_DOCK_TYPES } from '@/config/defaultDock';
import { useAuth } from '@/context/useAuth';
import { useToolVisibility } from '@/context/useToolVisibility';
import type { DockItem } from '@/types';
import { logError } from '@/utils/logError';
import { viewAsBlocksWrite } from '@/utils/viewAsTab';

/** Under Getting Started, setup finishes on its own with the default dock instead of the wizard (D2). */
export const FirstRunSetup: React.FC<{ fallback: React.ReactNode }> = ({
  fallback,
}) => {
  const { user, canAccessWidget, completeSetup } = useAuth();
  const { reorderDockItems } = useToolVisibility();

  const finishSetup = useEffectEvent(async (signal: { cancelled: boolean }) => {
    const dockItems: DockItem[] = DEFAULT_DOCK_TYPES.filter((type) =>
      canAccessWidget(type)
    ).map((type) => ({ type: 'tool', toolType: type }));
    // Dock and setup land in one write, as the wizard does, so the empty-dock recovery never seeds over them.
    if (user && !isAuthBypass && !viewAsBlocksWrite()) {
      try {
        await setDoc(
          doc(db, 'users', user.uid, 'userProfile', 'profile'),
          { dockItems, dockInitialized: true, setupCompleted: true },
          { merge: true }
        );
      } catch (err) {
        logError('FirstRunSetup', err);
      }
    }
    if (signal.cancelled) return;
    // Dock before setup, for the same reason the wizard orders them this way.
    reorderDockItems(dockItems);
    await completeSetup();
  });

  useEffect(() => {
    const signal = { cancelled: false };
    void finishSetup(signal);
    return () => {
      signal.cancelled = true;
    };
  }, []);

  return <>{fallback}</>;
};
