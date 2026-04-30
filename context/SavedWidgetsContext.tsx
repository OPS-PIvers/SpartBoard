import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, isConfigured, isAuthBypass } from '../config/firebase';
import { SavedWidget } from '../types';
import { useAuth } from './useAuth';
import { SavedWidgetsContext } from './SavedWidgetsContextValue';

export { SavedWidgetsContext } from './SavedWidgetsContextValue';

export const SavedWidgetsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  // Whether a Firestore listener should be active for the current user.
  // When false (signed out, Firebase not configured, or auth-bypass test
  // mode), we don't subscribe and the state stays at its empty defaults.
  const shouldSubscribe = Boolean(user) && isConfigured && !isAuthBypass;
  const [savedWidgets, setSavedWidgets] = useState<SavedWidget[]>([]);
  const [loading, setLoading] = useState(shouldSubscribe);

  // Reset state during render when the user changes (signs in/out). Adjusting
  // state while rendering avoids the setState-in-effect cascade that the old
  // setTimeout(..., 0) workaround was papering over.
  const [prevUid, setPrevUid] = useState(user?.uid);
  if (prevUid !== user?.uid) {
    setPrevUid(user?.uid);
    setSavedWidgets([]);
    setLoading(shouldSubscribe);
  }

  useEffect(() => {
    if (!shouldSubscribe || !user) return;

    const ref = collection(db, 'users', user.uid, 'saved_widgets');
    const q = query(ref, orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({
          ...d.data(),
          id: d.id,
        })) as SavedWidget[];
        setSavedWidgets(docs);
        setLoading(false);
      },
      (err) => {
        console.error('[SavedWidgetsContext] Listener error', err);
        setLoading(false);
      }
    );

    return unsub;
  }, [user, shouldSubscribe]);

  const saveSavedWidget = useCallback(
    async (
      widget: Omit<SavedWidget, 'id' | 'createdAt' | 'updatedAt'> & {
        id?: string;
      }
    ) => {
      if (!user) throw new Error('Not authenticated');
      if (!isConfigured || isAuthBypass)
        return widget.id ?? crypto.randomUUID();
      const id = widget.id ?? crypto.randomUUID();
      const now = Date.now();
      const ref = doc(db, 'users', user.uid, 'saved_widgets', id);
      const existing = savedWidgets.find((w) => w.id === id);
      const payload: SavedWidget = {
        ...widget,
        id,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await setDoc(ref, payload);
      return id;
    },
    [user, savedWidgets]
  );

  const setPinnedToDock = useCallback(
    async (id: string, pinned: boolean) => {
      if (!user) return;
      if (!isConfigured || isAuthBypass) return;
      await updateDoc(doc(db, 'users', user.uid, 'saved_widgets', id), {
        pinnedToDock: pinned,
        updatedAt: Date.now(),
      });
    },
    [user]
  );

  const deleteSavedWidget = useCallback(
    async (id: string) => {
      if (!user) return;
      if (!isConfigured || isAuthBypass) return;
      await deleteDoc(doc(db, 'users', user.uid, 'saved_widgets', id));
    },
    [user]
  );

  const value = useMemo(
    () => ({
      savedWidgets,
      loading,
      saveSavedWidget,
      setPinnedToDock,
      deleteSavedWidget,
    }),
    [savedWidgets, loading, saveSavedWidget, setPinnedToDock, deleteSavedWidget]
  );

  return (
    <SavedWidgetsContext.Provider value={value}>
      {children}
    </SavedWidgetsContext.Provider>
  );
};
