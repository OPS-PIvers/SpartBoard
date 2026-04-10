import { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { BackgroundPreset } from '@/types';
import {
  BACKGROUND_COLORS,
  BACKGROUND_GRADIENTS,
  BACKGROUND_PATTERNS,
} from '@/config/backgrounds';
import { resolveCategory } from '@/utils/backgroundCategories';

export interface BackgroundPresetItem {
  id: string;
  label: string;
  thumbnailUrl?: string;
  category: string;
  featured: boolean;
}

export const useBackgrounds = () => {
  const { user, isAdmin } = useAuth();
  const [managedBackgrounds, setManagedBackgrounds] = useState<
    BackgroundPreset[]
  >([]);
  const [prevUser, setPrevUser] = useState(user);
  if (user !== prevUser) {
    setPrevUser(user);
    setManagedBackgrounds([]);
  }

  // Refs to prevent race conditions when both queries update simultaneously
  // (Used when not admin)
  const publicBgsRef = useRef<BackgroundPreset[]>([]);
  const betaBgsRef = useRef<BackgroundPreset[]>([]);

  useEffect(() => {
    if (!user) return;

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
          },
          (error) => {
            console.error('Error fetching admin backgrounds:', error);
          }
        )
      );
    } else {
      // Non-admins need separate queries to avoid reading restricted documents (admin-only)
      const updateCombinedBackgrounds = () => {
        const all = [...publicBgsRef.current, ...betaBgsRef.current];
        const unique = Array.from(new Map(all.map((b) => [b.id, b])).values());
        setManagedBackgrounds(unique.sort((a, b) => b.createdAt - a.createdAt));
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
              // Beta query errors are non-fatal; public backgrounds still load
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
          }
        )
      );
    }

    return () => unsubscribes.forEach((unsub) => unsub());
  }, [user, isAdmin]);

  // Preload featured thumbnails first, then fill up to 20 with non-featured.
  // This ensures the sidebar overview (which only shows featured) feels instant.
  useEffect(() => {
    const featured = managedBackgrounds
      .filter((bg) => bg.featured)
      .slice(0, 20);
    const nonFeatured = managedBackgrounds.filter((bg) => !bg.featured);
    const toPreload = [
      ...featured,
      ...nonFeatured.slice(0, Math.max(0, 20 - featured.length)),
    ].slice(0, 20);
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
      featured: bg.featured ?? false,
    }));
  }, [managedBackgrounds]);

  return {
    presets,
    colors: BACKGROUND_COLORS,
    patterns: BACKGROUND_PATTERNS,
    gradients: BACKGROUND_GRADIENTS,
  };
};
