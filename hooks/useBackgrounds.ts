import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  type QuerySnapshot,
} from 'firebase/firestore';
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
  tags: string[];
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

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const baseRef = collection(db, 'admin_backgrounds');
    const toPresets = (snap: QuerySnapshot) =>
      snap.docs.map((d) => d.data() as BackgroundPreset);
    const publish = (all: BackgroundPreset[]) => {
      if (cancelled) return;
      const unique = Array.from(new Map(all.map((b) => [b.id, b])).values());
      setManagedBackgrounds(unique.sort((a, b) => b.createdAt - a.createdAt));
    };

    if (isAdmin) {
      // Admins can query everything active without permission errors
      getDocs(query(baseRef, where('active', '==', true)))
        .then((snap) => publish(toPresets(snap)))
        .catch((error) =>
          console.error('Error fetching admin backgrounds:', error)
        );
    } else {
      // Non-admins need separate queries to avoid reading restricted documents (admin-only)
      const qPublic = query(
        baseRef,
        where('active', '==', true),
        where('accessLevel', '==', 'public')
      );
      const qBeta = user.email
        ? query(
            baseRef,
            where('active', '==', true),
            where('accessLevel', '==', 'beta'),
            where('betaUsers', 'array-contains', user.email.toLowerCase())
          )
        : null;

      // Beta query errors are non-fatal; public backgrounds still load
      const betaLoad: Promise<BackgroundPreset[]> = qBeta
        ? getDocs(qBeta)
            .then(toPresets)
            .catch((error) => {
              console.error('Error fetching beta backgrounds:', error);
              return [];
            })
        : Promise.resolve([]);

      Promise.all([getDocs(qPublic).then(toPresets), betaLoad])
        .then(([publicBgs, betaBgs]) => publish([...publicBgs, ...betaBgs]))
        .catch((error) =>
          console.error('Error fetching public backgrounds:', error)
        );
    }

    return () => {
      cancelled = true;
    };
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
      tags: bg.tags ?? [],
    }));
  }, [managedBackgrounds]);

  return {
    presets,
    colors: BACKGROUND_COLORS,
    patterns: BACKGROUND_PATTERNS,
    gradients: BACKGROUND_GRADIENTS,
  };
};
