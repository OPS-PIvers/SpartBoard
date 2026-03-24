import { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/useAuth';
import { BackgroundPreset } from '../types';
import { BACKGROUND_COLORS, BACKGROUND_GRADIENTS } from '../config/backgrounds';
import { resolveCategory } from '../utils/backgroundCategories';

export interface BackgroundPresetItem {
  id: string;
  label: string;
  thumbnailUrl?: string;
  category: string;
}

export const useBackgrounds = () => {
  const { user, isAdmin } = useAuth();
  const [managedBackgrounds, setManagedBackgrounds] = useState<
    BackgroundPreset[]
  >([]);
  const [loading, setLoading] = useState(true);

  // Refs to prevent race conditions when both queries update simultaneously
  // (Used when not admin)
  const publicBgsRef = useRef<BackgroundPreset[]>([]);
  const betaBgsRef = useRef<BackgroundPreset[]>([]);

  useEffect(() => {
    if (!user) {
      // Use timeout to defer state updates and avoid synchronous setState in effect
      const timer = setTimeout(() => {
        setManagedBackgrounds([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    const baseRef = collection(db, 'admin_backgrounds');
    const unsubscribes: (() => void)[] = [];

    if (isAdmin) {
      // Admins can query everything active without permission errors
      const q = query(baseRef, where('active', '==', true));

      unsubscribes.push(
        onSnapshot(
          q,
          (snapshot) => {
            const backgrounds: BackgroundPreset[] = [];
            snapshot.forEach((doc) => {
              backgrounds.push(doc.data() as BackgroundPreset);
            });
            setManagedBackgrounds(
              backgrounds.sort((a, b) => b.createdAt - a.createdAt)
            );
            setLoading(false);
          },
          (error) => {
            console.error('Error fetching admin backgrounds:', error);
            setLoading(false);
          }
        )
      );
    } else {
      // Non-admins need separate queries to avoid reading restricted documents (admin-only)
      const updateCombinedBackgrounds = () => {
        const all = [...publicBgsRef.current, ...betaBgsRef.current];
        const unique = Array.from(new Map(all.map((b) => [b.id, b])).values());
        setManagedBackgrounds(unique.sort((a, b) => b.createdAt - a.createdAt));
        setLoading(false);
      };

      // Query 1: Public backgrounds
      const qPublic = query(
        baseRef,
        where('active', '==', true),
        where('accessLevel', '==', 'public')
      );

      // Query 2: Beta backgrounds where the user is authorized
      if (user.email) {
        const qBeta = query(
          baseRef,
          where('active', '==', true),
          where('accessLevel', '==', 'beta'),
          where('betaUsers', 'array-contains', user.email.toLowerCase())
        );

        unsubscribes.push(
          onSnapshot(
            qBeta,
            (snapshot) => {
              betaBgsRef.current = snapshot.docs.map(
                (d) => d.data() as BackgroundPreset
              );
              updateCombinedBackgrounds();
            },
            (error) => {
              console.error('Error fetching beta backgrounds:', error);
              // Don't update loading here; let the public query completion handle it
            }
          )
        );
      }

      // Public backgrounds are always available
      unsubscribes.push(
        onSnapshot(
          qPublic,
          (snapshot) => {
            publicBgsRef.current = snapshot.docs.map(
              (d) => d.data() as BackgroundPreset
            );
            updateCombinedBackgrounds();
          },
          (error) => {
            console.error('Error fetching public backgrounds:', error);
            setLoading(false);
          }
        )
      );
    }

    return () => unsubscribes.forEach((unsub) => unsub());
  }, [user, isAdmin]);

  // Preload the first 20 thumbnails into the browser cache so the sidebar
  // feels instant when opened. This is a legitimate external side-effect
  // (warming the HTTP cache) rather than derived state.
  useEffect(() => {
    const toPreload = managedBackgrounds.slice(0, 20);
    toPreload.forEach((bg) => {
      const src = bg.thumbnailUrl ?? bg.url;
      if (src?.startsWith('http')) {
        const img = new Image();
        img.src = src;
      }
    });
  }, [managedBackgrounds]);

  const presets = useMemo<BackgroundPresetItem[]>(() => {
    return managedBackgrounds.map((bg) => ({
      id: bg.url,
      label: bg.label,
      thumbnailUrl: bg.thumbnailUrl,
      category: resolveCategory(bg.label, bg.category),
    }));
  }, [managedBackgrounds]);

  return {
    presets,
    colors: BACKGROUND_COLORS,
    gradients: BACKGROUND_GRADIENTS,
    loading,
  };
};
