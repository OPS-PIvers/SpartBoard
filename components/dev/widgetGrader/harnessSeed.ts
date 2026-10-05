// Writes fixture docs into the offline Firestore cache so library listeners read them.

import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

export const seedFirestoreDocs = (
  docs: Record<string, Record<string, unknown>> | undefined
): void => {
  for (const [path, data] of Object.entries(docs ?? {})) {
    // Offline, the write never settles; the cache and listeners see it at once.
    void setDoc(doc(db, path), data).catch(() => undefined);
  }
};
