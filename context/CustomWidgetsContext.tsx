import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
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
  const { user, isAdmin, selectedBuildings } = useAuth();
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

    // Admins get an unconstrained listener; non-admins split by accessLevel
    // to match Firestore security rules (a single published+enabled query
    // would fail if any beta doc is readable by the rule but the user isn't
    // in betaUsers).
    if (isAdmin) {
      const ref = collection(db, 'custom_widgets');
      const unsub = onSnapshot(
        ref,
        (snap) => {
          const docs = snap.docs.map((d) => ({
            ...d.data(),
            id: d.id,
          })) as CustomWidgetDoc[];
          setCustomWidgets(docs);
          setLoading(false);
        },
        () => {
          setLoading(false);
        }
      );
      return unsub;
    }

    // Non-admin: two rule-consistent queries, merged client-side.
    const col = collection(db, 'custom_widgets');
    const publicQuery = query(
      col,
      where('published', '==', true),
      where('enabled', '==', true),
      where('accessLevel', '==', 'public')
    );

    let publicDocs: CustomWidgetDoc[] = [];
    let betaDocs: CustomWidgetDoc[] = [];

    const merge = () => {
      const byId = new Map<string, CustomWidgetDoc>();
      [...publicDocs, ...betaDocs].forEach((w) => byId.set(w.id, w));
      const filtered = Array.from(byId.values()).filter(
        (w) =>
          w.buildings.length === 0 ||
          w.buildings.some((b) => selectedBuildings.includes(b))
      );
      setCustomWidgets(filtered);
      setLoading(false);
    };

    const unsubPublic = onSnapshot(
      publicQuery,
      (snap) => {
        publicDocs = snap.docs.map((d) => ({
          ...d.data(),
          id: d.id,
        })) as CustomWidgetDoc[];
        merge();
      },
      () => {
        setLoading(false);
      }
    );

    let unsubBeta: (() => void) | undefined;
    if (user.email) {
      const betaQuery = query(
        col,
        where('published', '==', true),
        where('enabled', '==', true),
        where('accessLevel', '==', 'beta'),
        where('betaUsers', 'array-contains', user.email.toLowerCase())
      );
      unsubBeta = onSnapshot(
        betaQuery,
        (snap) => {
          betaDocs = snap.docs.map((d) => ({
            ...d.data(),
            id: d.id,
          })) as CustomWidgetDoc[];
          merge();
        },
        () => {
          setLoading(false);
        }
      );
    } else {
      merge();
    }

    return () => {
      unsubPublic();
      unsubBeta?.();
    };
  }, [user, isAdmin, selectedBuildings]);

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
      if (!isConfigured || isAuthBypass)
        return widgetDoc.id ?? crypto.randomUUID();
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
    if (!isConfigured || isAuthBypass) return;
    await updateDoc(doc(db, 'custom_widgets', id), {
      published,
      updatedAt: Date.now(),
    });
  }, []);

  const deleteCustomWidget = useCallback(async (id: string) => {
    if (!isConfigured || isAuthBypass) return;
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
