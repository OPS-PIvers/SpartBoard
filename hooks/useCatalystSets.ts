import { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, query, getDocs } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import {
  CatalystRoutine,
  CatalystSet,
  WidgetType,
  AddWidgetOverrides,
} from '@/types';

const appId =
  String(import.meta.env.VITE_FIREBASE_APP_ID ?? '') ||
  String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '') ||
  'spart-board';

export function useCatalystSets() {
  const [sets, setSets] = useState<CatalystSet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthBypass) {
      setTimeout(() => {
        setSets([]);
        setLoading(false);
      }, 0);
      return;
    }

    setTimeout(() => setLoading(true), 0);

    const ref = collection(
      db,
      'artifacts',
      appId,
      'public',
      'data',
      'catalystSets'
    );

    const unsub = onSnapshot(
      query(ref),
      async (snapshot) => {
        if (!snapshot.empty) {
          const items: CatalystSet[] = [];
          snapshot.forEach((doc) => {
            items.push({ ...doc.data(), id: doc.id } as CatalystSet);
          });
          items.sort((a, b) => a.id.localeCompare(b.id));
          setSets(items);
          setLoading(false);
        } else {
          // Empty, so fallback to fetching the old routines to keep them visible for users
          // until an admin opens the config and permanently migrates them.
          const initialSets: CatalystSet[] = [
            {
              id: 'set-1',
              title: 'Set 1',
              routines: [],
              createdAt: Date.now(),
            },
            {
              id: 'set-2',
              title: 'Set 2',
              routines: [],
              createdAt: Date.now(),
            },
            {
              id: 'set-3',
              title: 'Set 3',
              routines: [],
              createdAt: Date.now(),
            },
            {
              id: 'set-4',
              title: 'Set 4',
              routines: [],
              createdAt: Date.now(),
            },
          ];

          try {
            const oldRef = collection(
              db,
              'artifacts',
              appId,
              'public',
              'data',
              'catalystRoutines'
            );
            const oldSnap = await getDocs(oldRef);
            const oldRoutines: CatalystRoutine[] = [];
            oldSnap.forEach((doc) => {
              oldRoutines.push({
                ...doc.data(),
                id: doc.id,
              } as CatalystRoutine);
            });
            oldRoutines.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

            if (oldRoutines.length > 0) {
              initialSets[0].title = 'Legacy Routines';
              initialSets[0].routines = oldRoutines;
            }
          } catch (err) {
            console.error('Failed to fetch legacy catalyst routines:', err);
          } finally {
            setSets(initialSets);
            setLoading(false);
          }
        }
      },
      (err) => {
        console.error('Failed to subscribe to catalyst sets:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const executeRoutine = useCallback(
    (
      routine: CatalystRoutine,
      cleanSlate: boolean,
      addWidget: (type: WidgetType, overrides?: AddWidgetOverrides) => void,
      deleteAllWidgets: () => void
    ) => {
      if (cleanSlate) {
        deleteAllWidgets();
      }

      routine.widgets.forEach((widget) => {
        const { z: _z, ...widgetWithoutZ } = widget;
        addWidget(widgetWithoutZ.type, {
          ...widgetWithoutZ,
          id: crypto.randomUUID(),
          config: structuredClone(widget.config),
        });
      });
    },
    []
  );

  return { sets, loading, executeRoutine };
}
