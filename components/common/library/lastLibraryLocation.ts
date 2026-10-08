// Per-user, per-library "last folder" preference (docs/plans/LIBRARY_FOLDERS.md D2).
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { logError } from '@/utils/logError';

const FIELD = 'lastLocationByLibrary';

const prefRef = (uid: string) =>
  doc(db, 'users', uid, 'userProfile', 'libraryFolders');

// One read per teacher per page load; writes update the cache so remounts reopen the same place.
const cache = new Map<string, Promise<Record<string, string>>>();

function readAll(uid: string): Promise<Record<string, string>> {
  let pending = cache.get(uid);
  if (!pending) {
    pending = isAuthBypass
      ? Promise.resolve({})
      : Promise.resolve()
          .then(() => getDoc(prefRef(uid)))
          .then((snap) => {
            const raw: unknown = snap.exists() ? snap.get(FIELD) : null;
            const out: Record<string, string> = {};
            if (raw && typeof raw === 'object') {
              for (const [k, v] of Object.entries(raw)) {
                if (typeof v === 'string') out[k] = v;
              }
            }
            return out;
          })
          .catch((err: unknown) => {
            cache.delete(uid);
            logError('lastLibraryLocation.read', err);
            return {};
          });
    cache.set(uid, pending);
  }
  return pending;
}

export function readLastLibraryLocation(
  uid: string,
  library: string
): Promise<string | null> {
  return readAll(uid).then((all) => all[library] ?? null);
}

export function saveLastLibraryLocation(
  uid: string,
  library: string,
  key: string
): void {
  const pending = readAll(uid).then((all) => ({ ...all, [library]: key }));
  cache.set(uid, pending);
  if (isAuthBypass) return;
  void setDoc(
    prefRef(uid),
    { [FIELD]: { [library]: key } },
    { merge: true }
  ).catch((err: unknown) => logError('lastLibraryLocation.write', err));
}

/** Test hook: forget cached reads between cases. */
export function resetLastLibraryLocationCache(): void {
  cache.clear();
}
