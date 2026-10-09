import { useCallback, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { MemberRecord } from '@/types/organization';

export interface StaffEntry {
  email: string;
  name: string;
}

// One read of the org's member docs per org per page load; later focuses reuse it.
const cache = new Map<string, Promise<StaffEntry[]>>();

const toEntries = (records: Partial<MemberRecord>[]): StaffEntry[] =>
  records
    .filter(
      (m): m is Partial<MemberRecord> & { email: string } =>
        typeof m.email === 'string' &&
        m.email.includes('@') &&
        m.roleId !== 'student' &&
        m.status !== 'inactive'
    )
    .map((m) => ({
      email: m.email.toLowerCase(),
      name: typeof m.name === 'string' ? m.name.trim() : '',
    }));

const loadDirectory = (orgId: string): Promise<StaffEntry[]> => {
  let pending = cache.get(orgId);
  if (!pending) {
    pending = getDocs(collection(db, 'organizations', orgId, 'members'))
      .then((snap) =>
        toEntries(
          snap.docs.map((d) => ({ email: d.id, ...d.data() }) as MemberRecord)
        )
      )
      .catch((err: unknown) => {
        cache.delete(orgId);
        throw err;
      });
    cache.set(orgId, pending);
  }
  return pending;
};

/** Dev harness only: serve a fixture directory without Firestore. */
export const primeStaffDirectory = (
  orgId: string,
  entries: StaffEntry[]
): void => {
  cache.set(orgId, Promise.resolve(entries));
};

/** Staff emails for the org, fetched lazily the first time `load` runs. */
export const useStaffDirectory = (orgId: string | null | undefined) => {
  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const load = useCallback(() => {
    if (!orgId) return;
    loadDirectory(orgId)
      .then(setStaff)
      .catch((err: unknown) => {
        console.error('[useStaffDirectory] load failed:', err);
      });
  }, [orgId]);
  return { staff, load };
};

const rank = (entry: StaffEntry, q: string): number => {
  const local = entry.email.split('@')[0] ?? '';
  const name = entry.name.toLowerCase();
  if (local.startsWith(q)) return 0;
  if (name.startsWith(q)) return 1;
  if (name.split(/\s+/).some((w) => w.startsWith(q))) return 2;
  if (local.split(/[._-]+/).some((w) => w.startsWith(q))) return 3;
  if (entry.email.includes(q) || name.includes(q)) return 4;
  return -1;
};

/** Staff matching what's typed, best match first, minus anyone excluded. */
export const filterStaff = (
  staff: StaffEntry[],
  query: string,
  exclude: ReadonlySet<string>,
  limit = 8
): StaffEntry[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return staff
    .filter((s) => !exclude.has(s.email) && s.email !== q)
    .map((s) => ({ s, r: rank(s, q) }))
    .filter(({ r }) => r >= 0)
    .sort((a, b) => a.r - b.r || a.s.email.localeCompare(b.s.email))
    .slice(0, limit)
    .map(({ s }) => s);
};
