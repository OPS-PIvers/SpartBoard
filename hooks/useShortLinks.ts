// Admin-side CRUD hook for short links.
//
// The public resolve/click helpers live in `utils/shortLinksApi.ts` so the
// `/r/:code` resolver doesn't have to import `useAuth` or any React hook
// machinery. This file is React-only — admin management surface.

import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  updateDoc,
} from 'firebase/firestore';

import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { ShortLink } from '@/types';
import { SHORT_LINKS_COLLECTION } from '@/utils/shortLinksApi';
import {
  generateRandomCode,
  validateDestination,
  validateSlug,
} from '@/utils/shortLinkValidation';

// Re-export the public helpers so existing call sites keep working. The
// implementations live in the non-React module to keep the resolver bundle
// lean.
export { resolveShortLink, recordShortLinkClick } from '@/utils/shortLinksApi';

const COLLECTION = SHORT_LINKS_COLLECTION;
const MAX_CODE_GENERATION_RETRIES = 5;
// Cap admin listings — keeps the read quota predictable and the table
// responsive once a district has hundreds of links. Pagination/search UI
// for larger sets is a phase 2 concern.
const ADMIN_LIST_LIMIT = 100;

/**
 * Thrown inside the create transaction when the target slug already
 * exists. Using a typed Error (rather than a sentinel symbol) keeps the
 * lint rule against non-Error throws happy.
 */
class CodeTakenError extends Error {
  constructor() {
    super('CODE_TAKEN');
    this.name = 'CodeTakenError';
  }
}

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
 * Atomic "claim this code" write. Inside the transaction we read the doc
 * and bail (via a sentinel) if it already exists, so concurrent admins
 * creating the same slug can't clobber each other's links.
 */
const createShortLinkAtomic = async (
  code: string,
  link: ShortLink
): Promise<{ ok: true } | { ok: false; reason: 'taken' }> => {
  try {
    await runTransaction(db, async (transaction) => {
      const ref = doc(db, COLLECTION, code);
      const existing = await transaction.get(ref);
      if (existing.exists()) {
        throw new CodeTakenError();
      }
      transaction.set(ref, link);
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof CodeTakenError) {
      return { ok: false, reason: 'taken' };
    }
    throw err;
  }
};

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

  const createShortLink = useCallback(
    async (input: CreateShortLinkInput): Promise<CreateResult> => {
      if (!user) {
        return { ok: false, reason: 'You must be signed in.' };
      }

      const destinationResult = validateDestination(input.destination);
      if (!destinationResult.ok) {
        return { ok: false, reason: destinationResult.reason };
      }

      const now = Date.now();
      const label = input.label?.trim();
      const buildLink = (code: string): ShortLink => ({
        code,
        destination: destinationResult.url,
        createdBy: user.uid,
        createdByEmail: user.email ?? '',
        createdAt: now,
        updatedAt: now,
        clicks: 0,
        lastClickedAt: null,
        ...(label ? { label } : {}),
      });

      try {
        // Custom slug: validate once, then try to claim atomically. A
        // collision means another admin grabbed the slug between us
        // validating and writing — surface the error so they pick again.
        if (input.slug && input.slug.trim()) {
          const slugResult = validateSlug(input.slug);
          if (!slugResult.ok) {
            return { ok: false, reason: slugResult.reason };
          }
          const result = await createShortLinkAtomic(
            slugResult.slug,
            buildLink(slugResult.slug)
          );
          if (!result.ok) {
            return {
              ok: false,
              reason: `"${slugResult.slug}" is already taken.`,
            };
          }
          return { ok: true, link: buildLink(slugResult.slug) };
        }

        // Random code: spin up to N candidates and try each transactionally.
        // A "taken" outcome means we lost the race; just regenerate and
        // try again until we either succeed or exhaust retries.
        for (
          let attempt = 0;
          attempt < MAX_CODE_GENERATION_RETRIES;
          attempt++
        ) {
          const candidate = generateRandomCode();
          const result = await createShortLinkAtomic(
            candidate,
            buildLink(candidate)
          );
          if (result.ok) {
            return { ok: true, link: buildLink(candidate) };
          }
        }
        return {
          ok: false,
          reason: 'Could not generate a unique code. Try again.',
        };
      } catch (err) {
        // Anything else (network, permission, quota) lands here so the
        // form sees a clean `{ ok: false, reason }` instead of an
        // unhandled rejection.
        console.error('[useShortLinks] create error:', err);
        return {
          ok: false,
          reason:
            'Failed to save short link. Check your connection and try again.',
        };
      }
    },
    [user]
  );

  const updateShortLink = useCallback(
    async (
      code: string,
      patch: UpdateShortLinkInput
    ): Promise<UpdateResult> => {
      try {
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

        await updateDoc(ref, updates);
        return { ok: true, link: { ...existing, ...updates } as ShortLink };
      } catch (err) {
        console.error('[useShortLinks] update error:', err);
        return {
          ok: false,
          reason:
            'Failed to save changes. Check your connection and try again.',
        };
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
