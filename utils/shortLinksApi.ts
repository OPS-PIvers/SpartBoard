// Public, non-React helpers for the short-link feature.
//
// Lives outside the `hooks/` tree so the public `/r/:code` resolver can
// import it without pulling in `useAuth` or any React hook machinery that
// only exists for the admin management surface.

import { doc, getDoc, increment, updateDoc } from 'firebase/firestore';

import { db } from '@/config/firebase';
import { ShortLink } from '@/types';

export const SHORT_LINKS_COLLECTION = 'short_links';

/**
 * Look up a short link by code. Public read — no auth required. Used by
 * the resolver, so it deliberately avoids any cached/listened state.
 */
export const resolveShortLink = async (
  code: string
): Promise<ShortLink | null> => {
  const ref = doc(db, SHORT_LINKS_COLLECTION, code);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as ShortLink;
};

/**
 * Atomic counter bump used by the resolver. Allowed for anonymous users
 * by the security rule because it touches only `clicks` (strictly +1) and
 * `lastClickedAt`. Failure here is swallowed at the call site so a
 * counter glitch never blocks the redirect itself.
 */
export const recordShortLinkClick = async (code: string): Promise<void> => {
  const ref = doc(db, SHORT_LINKS_COLLECTION, code);
  await updateDoc(ref, {
    clicks: increment(1),
    lastClickedAt: Date.now(),
  });
};
