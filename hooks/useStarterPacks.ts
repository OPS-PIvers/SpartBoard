import { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { StarterPack, WidgetType, AddWidgetOverrides } from '@/types';

const envAppId = String(import.meta.env.VITE_FIREBASE_APP_ID);
const envProjectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID);
const appId = envAppId
  ? String(envAppId)
  : envProjectId
    ? String(envProjectId)
    : 'spart-board';

export function useStarterPacks(userId?: string | null) {
  const [publicPacks, setPublicPacks] = useState<StarterPack[]>([]);
  const [userPacks, setUserPacks] = useState<StarterPack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthBypass) {
      setTimeout(() => {
        setPublicPacks([]);
        setUserPacks([]);
        setLoading(false);
      }, 0);
      return;
    }

    setTimeout(() => setLoading(true), 0);

    const publicRef = collection(
      db,
      'artifacts',
      appId,
      'public',
      'data',
      'starterPacks'
    );
    const unsubPublic = onSnapshot(
      query(publicRef),
      (snapshot) => {
        const packs: StarterPack[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          packs.push({ ...data, id: doc.id } as StarterPack);
        });
        setPublicPacks(packs);
      },
      (err) => {
        console.error('Failed to subscribe to public starter packs:', err);
      }
    );

    let unsubUser: (() => void) | undefined;
    if (userId) {
      const userRef = collection(
        db,
        'artifacts',
        appId,
        'users',
        userId,
        'starterPacks'
      );
      unsubUser = onSnapshot(
        query(userRef),
        (snapshot) => {
          const packs: StarterPack[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            packs.push({ ...data, id: doc.id } as StarterPack);
          });
          setUserPacks(packs);
        },
        (err) => {
          console.error('Failed to subscribe to user starter packs:', err);
        }
      );
    } else {
      setTimeout(() => setUserPacks([]), 0);
    }

    setTimeout(() => setLoading(false), 0);

    return () => {
      unsubPublic();
      if (unsubUser) unsubUser();
    };
  }, [userId]);

  const executePack = useCallback(
    (
      pack: StarterPack,
      cleanSlate: boolean,
      addWidget: (type: WidgetType, overrides?: AddWidgetOverrides) => void,
      deleteAllWidgets: () => void
    ) => {
      if (cleanSlate) {
        deleteAllWidgets();
      }

      pack.widgets.forEach((widget) => {
        addWidget(widget.type, {
          ...widget,
          id: crypto.randomUUID(),
          config: structuredClone(widget.config),
        } as unknown as AddWidgetOverrides);
      });
    },
    []
  );

  return { publicPacks, userPacks, loading, executePack };
}
