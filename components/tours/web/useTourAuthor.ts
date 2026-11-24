import { useContext, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { AuthContext } from '@/context/AuthContextValue';
import type { GlobalFeature } from '@/types';
import { logError } from '@/utils/logError';
import { TOUR_AUTHORS_COLLECTION } from './tourAuthors';

/** Who may author web tours (docs/plans/WEB_TOUR_AUTHORS.md A3): `ready` is false until both answers are in. */
export interface TourAuthorState {
  ready: boolean;
  /** A SpartBoard admin. */
  admin: boolean;
  /** An admin, or someone on the tour author list. */
  author: boolean;
  /** Whether this person passes a flag as an author: admins by its rules, listed authors while it is on. */
  passes: (featureId: GlobalFeature) => boolean;
}

const lookups = new Map<string, Promise<boolean>>();

/** The person's own list entry, asked for once per page load however many components need it. */
function isOnList(email: string): Promise<boolean> {
  let pending = lookups.get(email);
  if (!pending) {
    pending = getDoc(doc(db, TOUR_AUTHORS_COLLECTION, email)).then(
      (snap) => snap.exists(),
      (err: unknown) => {
        logError('useTourAuthor', err);
        lookups.delete(email);
        return false;
      }
    );
    lookups.set(email, pending);
  }
  return pending;
}

/** Reads the signed-in person's own author entry once; false outside an auth provider. */
export function useTourAuthor(): TourAuthorState {
  const auth = useContext(AuthContext);
  const email = auth?.user?.email?.toLowerCase() ?? null;
  const admin = auth?.isAdmin ?? null;
  const [listed, setListed] = useState<{
    email: string;
    on: boolean;
  } | null>(null);

  useEffect(() => {
    // Admins need no lookup, and a signed-out page has nobody to look up.
    if (!email || admin !== false) return;
    let cancelled = false;
    void isOnList(email).then((on) => {
      if (!cancelled) setListed({ email, on });
    });
    return () => {
      cancelled = true;
    };
  }, [email, admin]);

  const known = listed?.email === email ? listed : null;
  const isAdmin = admin === true;
  const onList = known?.on === true;
  const ready =
    !!auth &&
    !auth.loading &&
    (!email || isAdmin || (admin === false && known !== null));
  return {
    ready,
    admin: isAdmin,
    author: isAdmin || onList,
    passes: (featureId) => {
      if (!auth) return false;
      if (isAdmin) return auth.canAccessFeature(featureId);
      if (!onList) return false;
      // A flag with no saved record is a preview flag, which an author passes as an admin does.
      const saved = auth.globalPermissions.find(
        (p) => p.featureId === featureId
      );
      return saved ? saved.enabled : true;
    },
  };
}
