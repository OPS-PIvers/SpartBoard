import { useState, useEffect } from 'react';
import { useAuth } from '@/context/useAuth';
import { MiniAppItem, GlobalMiniAppItem } from '@/types';
import { db } from '@/config/firebase';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  doc,
} from 'firebase/firestore';

const STORAGE_KEY = 'spartboard_miniapps_library';

export const useMiniAppSync = (
  addToast: (msg: string, type: 'success' | 'error' | 'info') => void
) => {
  const { user, selectedBuildings } = useAuth();
  const [library, setLibrary] = useState<MiniAppItem[]>([]);
  const [globalLibrary, setGlobalLibrary] = useState<GlobalMiniAppItem[]>([]);

  // Firestore Sync & Migration for Personal Apps
  useEffect(() => {
    if (!user) return;

    const appsRef = collection(db, 'users', user.uid, 'miniapps');
    const q = query(
      appsRef,
      orderBy('order', 'asc'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const apps = snapshot.docs.map(
        (d) => ({ ...d.data(), id: d.id }) as MiniAppItem
      );
      setLibrary(apps);

      // Migration check: if Firestore is empty but localStorage has data
      if (apps.length === 0) {
        const local = localStorage.getItem(STORAGE_KEY);
        if (local) {
          try {
            const parsed = JSON.parse(local) as MiniAppItem[];
            if (parsed.length > 0) {
              console.warn(
                '[MiniAppWidget] Migrating local apps to Firestore...'
              );
              const batch = writeBatch(db);
              parsed.forEach((app, index) => {
                const docRef = doc(appsRef, app.id);
                batch.set(docRef, { ...app, order: index });
              });
              void batch
                .commit()
                .then(() => {
                  localStorage.removeItem(STORAGE_KEY);
                  addToast('Migrated local apps to cloud', 'success');
                })
                .catch((error) => {
                  console.error(
                    '[MiniAppWidget] Migration commit failed',
                    error
                  );
                  addToast('Migration failed', 'error');
                });
            }
          } catch (e) {
            console.error('[MiniAppWidget] Migration failed', e);
          }
        }
      }
    });

    return () => unsubscribe();
  }, [user, addToast]);

  // Global library listener
  useEffect(() => {
    const q = query(
      collection(db, 'global_mini_apps'),
      orderBy('order', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const allApps = snap.docs.map(
        (d) => ({ ...d.data(), id: d.id }) as GlobalMiniAppItem
      );
      const filtered = allApps.filter((app) => {
        // Treat absent or empty buildings as "all buildings"
        const appBuildings = Array.isArray(app.buildings) ? app.buildings : [];
        const isGlobal = appBuildings.length === 0;
        if (isGlobal) return true;
        if (selectedBuildings.length === 0) return false;
        return appBuildings.some((b) => selectedBuildings.includes(b));
      });
      setGlobalLibrary(filtered);
    });

    return () => unsubscribe();
  }, [selectedBuildings]);

  return {
    library,
    globalLibrary,
  };
};
