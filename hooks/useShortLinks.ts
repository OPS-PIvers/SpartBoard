// CRUD + resolve helpers for the admin link-shortener feature.
//
// Reads/writes go to the top-level `short_links` Firestore collection. Doc
// ids are the public short codes. Security rules (`firestore.rules`)
// constrain creates/edits/deletes to admins and allow public reads + a
// narrow anonymous click-counter update.

import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { ShortLink } from '@/types';
import {
  generateRandomCode,
  validateDestination,
  validateSlug,
} from '@/utils/shortLinkValidation';

const COLLECTION = 'short_links';
const MAX_CODE_GENERATION_RETRIES = 5;
// Cap admin listings — keeps the read quota predictable and the table
// responsive once a district has hundreds of links. Pagination/search UI
// for larger sets is a phase 2 concern.
const ADMIN_LIST_LIMIT = 100;

interface CreateShortLinkInput {
  destination: string;
  slug?: string;
  label?: string;
}

interface UpdateShortLinkInput {
  destination?: string;
  label?: string;
}

export type CreateResult =
  | { ok: true; link: ShortLink }
  | { ok: false; reason: string };

export type UpdateResult =
  | { ok: true; link: ShortLink }
  | { ok: false; reason: string };

/**
 * Look up a short link by code. Public read — no auth required. Used by the
 * resolver, so it deliberately avoids any cached/listened state.
 */
export const resolveShortLink = async (
  code: string
): Promise<ShortLink | null> => {
  const ref = doc(db, COLLECTION, code);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as ShortLink;
};

/**
 * Atomic counter bump used by the resolver. Allowed for anonymous users by
 * the security rule because it touches only `clicks` and `lastClickedAt`.
 * Failure here is swallowed at the call site so a counter glitch never
 * blocks the redirect itself.
 */
export const recordShortLinkClick = async (code: string): Promise<void> => {
  const ref = doc(db, COLLECTION, code);
  await updateDoc(ref, {
    clicks: increment(1),
    lastClickedAt: Date.now(),
  });
};

interface UseShortLinksResult {
  links: ShortLink[];
  loading: boolean;
  error: string | null;
  createShortLink: (input: CreateShortLinkInput) => Promise<CreateResult>;
  updateShortLink: (
    code: string,
    patch: UpdateShortLinkInput
  ) => Promise<UpdateResult>;
  deleteShortLink: (code: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Admin-side hook. Subscribes to all short links (small collection,
 * admin-only audience) and exposes create/update/delete helpers.
 */
export const useShortLinks = (): UseShortLinksResult => {
  const { user, isAdmin } = useAuth();
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setLinks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(ADMIN_LIST_LIMIT)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const next: ShortLink[] = [];
        snapshot.forEach((docSnap) => {
          next.push(docSnap.data() as ShortLink);
        });
        setLinks(next);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[useShortLinks] snapshot error:', err);
        setError('Failed to load short links.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isAdmin]);

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setLoading(true);
      const snapshot = await getDocs(
        query(
          collection(db, COLLECTION),
          orderBy('createdAt', 'desc'),
          limit(ADMIN_LIST_LIMIT)
        )
      );
      const next: ShortLink[] = [];
      snapshot.forEach((docSnap) => next.push(docSnap.data() as ShortLink));
      setLinks(next);
      setError(null);
    } catch (err) {
      console.error('[useShortLinks] refresh error:', err);
      setError('Failed to load short links.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  const codeIsTaken = useCallback(async (code: string): Promise<boolean> => {
    const existing = await getDoc(doc(db, COLLECTION, code));
    return existing.exists();
  }, []);

  const createShortLink = useCallback(
    async (input: CreateShortLinkInput): Promise<CreateResult> => {
      if (!user) {
        return { ok: false, reason: 'You must be signed in.' };
      }

      const destinationResult = validateDestination(input.destination);
      if (!destinationResult.ok) {
        return { ok: false, reason: destinationResult.reason };
      }

      let code: string;
      if (input.slug && input.slug.trim()) {
        const slugResult = validateSlug(input.slug);
        if (!slugResult.ok) {
          return { ok: false, reason: slugResult.reason };
        }
        if (await codeIsTaken(slugResult.slug)) {
          return {
            ok: false,
            reason: `"${slugResult.slug}" is already taken.`,
          };
        }
        code = slugResult.slug;
      } else {
        // Random code — retry on the (very unlikely) collision.
        let candidate = '';
        for (
          let attempt = 0;
          attempt < MAX_CODE_GENERATION_RETRIES;
          attempt++
        ) {
          candidate = generateRandomCode();
          if (!(await codeIsTaken(candidate))) break;
          candidate = '';
        }
        if (!candidate) {
          return {
            ok: false,
            reason: 'Could not generate a unique code. Try again.',
          };
        }
        code = candidate;
      }

      const now = Date.now();
      const label = input.label?.trim();
      const link: ShortLink = {
        code,
        destination: destinationResult.url,
        createdBy: user.uid,
        createdByEmail: user.email ?? '',
        createdAt: now,
        updatedAt: now,
        clicks: 0,
        lastClickedAt: null,
        ...(label ? { label } : {}),
      };

      try {
        await setDoc(doc(db, COLLECTION, code), link);
        return { ok: true, link };
      } catch (err) {
        console.error('[useShortLinks] create error:', err);
        return { ok: false, reason: 'Failed to save short link.' };
      }
    },
    [user, codeIsTaken]
  );

  const updateShortLink = useCallback(
    async (
      code: string,
      patch: UpdateShortLinkInput
    ): Promise<UpdateResult> => {
      const ref = doc(db, COLLECTION, code);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        return { ok: false, reason: 'Short link no longer exists.' };
      }
      const existing = snap.data() as ShortLink;

      const updates: Partial<ShortLink> = { updatedAt: Date.now() };

      if (patch.destination !== undefined) {
        const result = validateDestination(patch.destination);
        if (!result.ok) {
          return { ok: false, reason: result.reason };
        }
        updates.destination = result.url;
      }

      if (patch.label !== undefined) {
        const trimmed = patch.label.trim();
        updates.label = trimmed || '';
      }

      try {
        await updateDoc(ref, updates);
        return { ok: true, link: { ...existing, ...updates } as ShortLink };
      } catch (err) {
        console.error('[useShortLinks] update error:', err);
        return { ok: false, reason: 'Failed to save changes.' };
      }
    },
    []
  );

  const deleteShortLink = useCallback(async (code: string): Promise<void> => {
    await deleteDoc(doc(db, COLLECTION, code));
  }, []);

  return {
    links,
    loading,
    error,
    createShortLink,
    updateShortLink,
    deleteShortLink,
    refresh,
  };
};
