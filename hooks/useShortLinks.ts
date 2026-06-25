// Admin-side CRUD hook for short links.
//
// The public resolve/click helpers live in `utils/shortLinksApi.ts` so the
// `/r/:code` resolver doesn't have to import `useAuth` or any React hook
// machinery. This file is React-only — admin management surface.

import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  type FieldValue,
} from 'firebase/firestore';

import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { ShortLink } from '@/types';
import { logError } from '@/utils/logError';
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
// for larger sets is a phase 2 concern. Exported so analytics surfaces can
// flag when a listing is truncated at this cap.
export const ADMIN_LIST_LIMIT = 100;

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
 * Subscription-free create helper. Carved out of `useShortLinks` so callers
 * that only ever create a link (e.g. the inline `ShortenUrlButton`) don't pay
 * for the `onSnapshot` listener over up to `ADMIN_LIST_LIMIT` docs — and don't
 * trigger a 100-doc re-delivery to a listener that discards it every time they
 * write. `useShortLinks` reuses this so the create logic lives in one place.
 */
export const useCreateShortLink = (): {
  createShortLink: (input: CreateShortLinkInput) => Promise<CreateResult>;
} => {
  const { user, isAdmin } = useAuth();

  const createShortLink = useCallback(
    async (input: CreateShortLinkInput): Promise<CreateResult> => {
      if (!user) {
        return { ok: false, reason: 'You must be signed in.' };
      }
      // Fail fast for non-admins. Firestore rules would also reject this,
      // but a clean, immediate error message beats a confusing
      // permission-denied in the console.
      if (!isAdmin) {
        return { ok: false, reason: 'Only admins can create short links.' };
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
        logError('useShortLinks.create', err);
        return {
          ok: false,
          reason:
            'Failed to save short link. Check your connection and try again.',
        };
      }
    },
    [user, isAdmin]
  );

  return { createShortLink };
};

/**
 * Admin-side hook. Subscribes to all short links (small collection,
 * admin-only audience) and exposes create/update/delete helpers.
 */
export const useShortLinks = (): UseShortLinksResult => {
  const { isAdmin } = useAuth();
  const { createShortLink } = useCreateShortLink();
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setLinks([]);
      setLoading(false);
      // Clear any stale admin-only error so it doesn't linger after a
      // sign-out / role drop.
      setError(null);
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
        logError('useShortLinks.snapshot', err);
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
      logError('useShortLinks.refresh', err);
      setError('Failed to load short links.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  const updateShortLink = useCallback(
    async (
      code: string,
      patch: UpdateShortLinkInput
    ): Promise<UpdateResult> => {
      if (!isAdmin) {
        return { ok: false, reason: 'Only admins can edit short links.' };
      }
      try {
        const ref = doc(db, COLLECTION, code);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          return { ok: false, reason: 'Short link no longer exists.' };
        }
        const existing = snap.data() as ShortLink;

        // Mixed type: most fields are plain values, but `label` may carry
        // a Firestore `FieldValue` sentinel (`deleteField()`) when an
        // admin clears the label — Firestore's `updateDoc` accepts that
        // mixed shape but `Partial<ShortLink>` alone does not.
        const updates: { [K in keyof ShortLink]?: ShortLink[K] | FieldValue } =
          { updatedAt: Date.now() };

        if (patch.destination !== undefined) {
          const result = validateDestination(patch.destination);
          if (!result.ok) {
            return { ok: false, reason: result.reason };
          }
          updates.destination = result.url;
        }

        if (patch.label !== undefined) {
          const trimmed = patch.label.trim();
          // Match `createShortLink`: an empty label is treated as "no
          // label". Using `deleteField()` removes the property entirely
          // instead of leaving a `label: ''` ghost field, which keeps
          // the two write paths semantically symmetric.
          updates.label = trimmed ? trimmed : deleteField();
        }

        await updateDoc(ref, updates);
        // For the returned link we drop the FieldValue sentinel and
        // surface the resolved shape (label removed) for the caller.
        const resolved: ShortLink = {
          ...existing,
          updatedAt: updates.updatedAt as number,
          ...(updates.destination !== undefined
            ? { destination: updates.destination as string }
            : {}),
        };
        if (patch.label !== undefined) {
          const trimmed = patch.label.trim();
          if (trimmed) {
            resolved.label = trimmed;
          } else {
            delete resolved.label;
          }
        }
        return { ok: true, link: resolved };
      } catch (err) {
        logError('useShortLinks.update', err);
        return {
          ok: false,
          reason:
            'Failed to save changes. Check your connection and try again.',
        };
      }
    },
    [isAdmin]
  );

  const deleteShortLink = useCallback(
    async (code: string): Promise<void> => {
      if (!isAdmin) {
        throw new Error('Only admins can delete short links.');
      }
      await deleteDoc(doc(db, COLLECTION, code));
    },
    [isAdmin]
  );

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
