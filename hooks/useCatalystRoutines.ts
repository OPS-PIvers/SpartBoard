import { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { CatalystRoutine, WidgetType, AddWidgetOverrides } from '@/types';

const appId =
  String(import.meta.env.VITE_FIREBASE_APP_ID ?? '') ||
  String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '') ||
  'spart-board';

export function useCatalystRoutines() {
  const [routines, setRoutines] = useState<CatalystRoutine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthBypass) {
      setTimeout(() => {
        setRoutines([]);
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
      'catalystRoutines'
    );

    const unsub = onSnapshot(
      query(ref),
      (snapshot) => {
        const items: CatalystRoutine[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          items.push({ ...data, id: doc.id } as CatalystRoutine);
        });
        // Sort by createdAt ascending so newest appear last
        items.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
        setRoutines(items);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to subscribe to catalyst routines:', err);
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

  return { routines, loading, executeRoutine };
}
