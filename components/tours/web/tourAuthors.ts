import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';

export const TOUR_AUTHORS_COLLECTION = 'tour_authors';
const STAFF_EMAIL = /^[^@\s]+@orono\.k12\.mn\.us$/;

/** One person on the web tour author list (docs/plans/WEB_TOUR_AUTHORS.md A1). */
export interface TourAuthor {
  email: string;
  addedBy: string;
  addedAt: number;
}

/** The email as the list stores it, or null when it isn't a district address. */
export function authorEmailOf(input: string): string | null {
  const email = input.trim().toLowerCase();
  return STAFF_EMAIL.test(email) ? email : null;
}

/** Watches the author list, by email, until the returned cleanup runs. Admins only (rules). */
export function watchTourAuthors(
  onChange: (authors: TourAuthor[]) => void,
  onError: (err: unknown) => void
): () => void {
  return onSnapshot(
    collection(db, TOUR_AUTHORS_COLLECTION),
    (snap) =>
      onChange(
        snap.docs
          .map((d) => ({
            email: d.id,
            addedBy:
              typeof d.get('addedBy') === 'string'
                ? (d.get('addedBy') as string)
                : '',
            addedAt:
              typeof d.get('addedAt') === 'number'
                ? (d.get('addedAt') as number)
                : 0,
          }))
          .sort((a, b) => a.email.localeCompare(b.email))
      ),
    (err) => {
      logError('watchTourAuthors', err);
      onError(err);
    }
  );
}

/** Adds a district address to the author list. */
export async function addTourAuthor(
  email: string,
  addedBy: string
): Promise<void> {
  await setDoc(doc(db, TOUR_AUTHORS_COLLECTION, email), {
    addedBy,
    addedAt: Date.now(),
  });
}

/** Takes a person off the author list; their tours stay. */
export async function removeTourAuthor(email: string): Promise<void> {
  await deleteDoc(doc(db, TOUR_AUTHORS_COLLECTION, email));
}
