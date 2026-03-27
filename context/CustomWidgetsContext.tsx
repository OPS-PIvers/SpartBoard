import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { Puzzle } from 'lucide-react';
import { db, isConfigured, isAuthBypass } from '../config/firebase';
import { CustomWidgetDoc, ToolMetadata } from '../types';
import { useAuth } from './useAuth';
import { CustomWidgetsContext } from './CustomWidgetsContextValue';

export { CustomWidgetsContext } from './CustomWidgetsContextValue';

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const CustomWidgetsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, isAdmin } = useAuth();
  const [customWidgets, setCustomWidgets] = useState<CustomWidgetDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // Real-time Firestore listener
  useEffect(() => {
    if (!user || !isConfigured || isAuthBypass) {
      const timer = setTimeout(() => {
        setCustomWidgets([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    const ref = collection(db, 'custom_widgets');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const docs = snap.docs.map((d) => ({
          ...d.data(),
          id: d.id,
        })) as CustomWidgetDoc[];

        // Admins see all docs; non-admins only see published, enabled widgets
        const filtered = isAdmin
          ? docs
          : docs.filter((w) => w.published && w.enabled);

        setCustomWidgets(filtered);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    return unsub;
  }, [user, isAdmin]);

  // Compute dynamic tool metadata for published custom widgets
  const customTools = useMemo<ToolMetadata[]>(() => {
    return customWidgets
      .filter((w) => w.published && w.enabled)
      .map((w) => ({
        type: 'custom-widget' as const,
        label: w.title,
        color: w.color,
        icon: Puzzle,
        defaultWidth: w.defaultWidth,
        defaultHeight: w.defaultHeight,
        customWidgetId: w.id,
        customWidgetIcon: w.icon,
      }));
  }, [customWidgets]);

  const saveCustomWidget = useCallback(
    async (widgetDoc: Omit<CustomWidgetDoc, 'id'> & { id?: string }) => {
      const id = widgetDoc.id ?? crypto.randomUUID();
      const ref = doc(db, 'custom_widgets', id);
      await setDoc(
        ref,
        { ...widgetDoc, id, updatedAt: Date.now() },
        { merge: true }
      );
      return id;
    },
    []
  );

  const setPublished = useCallback(async (id: string, published: boolean) => {
    await updateDoc(doc(db, 'custom_widgets', id), {
      published,
      updatedAt: Date.now(),
    });
  }, []);

  const deleteCustomWidget = useCallback(async (id: string) => {
    await deleteDoc(doc(db, 'custom_widgets', id));
  }, []);

  const value = useMemo(
    () => ({
      customWidgets,
      customTools,
      loading,
      saveCustomWidget,
      setPublished,
      deleteCustomWidget,
    }),
    [
      customWidgets,
      customTools,
      loading,
      saveCustomWidget,
      setPublished,
      deleteCustomWidget,
    ]
  );

  return (
    <CustomWidgetsContext.Provider value={value}>
      {children}
    </CustomWidgetsContext.Provider>
  );
};
