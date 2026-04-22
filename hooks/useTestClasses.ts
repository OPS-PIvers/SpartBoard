import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { slugOrFallback } from '@/utils/slug';

export interface TestClassRecord {
  id: string;
  title: string;
  subject?: string;
  memberEmails: string[];
  createdAt?: number | null;
  createdBy?: string;
}

interface TestClassDoc {
  title?: string;
  subject?: string;
  memberEmails?: unknown;
  createdAt?: { toMillis?: () => number } | number | null;
  createdBy?: string;
}

const normalizeEmails = (input: string | string[]): string[] => {
  const raw = Array.isArray(input) ? input : input.split(/[,\n]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of raw) {
    const trimmed = e.trim().toLowerCase();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
};

/**
 * Subscribes to `/organizations/{orgId}/testClasses` — the admin-managed mock
 * class allowlist used by the studentLoginV1 Cloud Function to bypass
 * ClassLink/OneRoster for PII-free SSO testing.
 *
 * Writes (add/update/remove) are gated by Firestore rules to super/domain
 * admins of the org (see `firestore.rules:344`).
 */
export const useTestClasses = (orgId: string | null) => {
  const { user } = useAuth();
  const [testClasses, setTestClasses] = useState<TestClassRecord[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const shouldSubscribe = !isAuthBypass && Boolean(user) && Boolean(orgId);
  const [loading, setLoading] = useState<boolean>(shouldSubscribe);

  const [prevKey, setPrevKey] = useState(`${shouldSubscribe}:${orgId ?? ''}`);
  const nextKey = `${shouldSubscribe}:${orgId ?? ''}`;
  if (prevKey !== nextKey) {
    setPrevKey(nextKey);
    setLoading(shouldSubscribe);
    if (!shouldSubscribe) {
      setTestClasses([]);
      setError(null);
    }
  }

  useEffect(() => {
    if (!shouldSubscribe || !orgId) return;

    const unsub = onSnapshot(
      collection(db, 'organizations', orgId, 'testClasses'),
      (snapshot) => {
        const items: TestClassRecord[] = snapshot.docs
          .map((d) => {
            const data = d.data() as TestClassDoc;
            const createdAt =
              typeof data.createdAt === 'number'
                ? data.createdAt
                : typeof data.createdAt?.toMillis === 'function'
                  ? data.createdAt.toMillis()
                  : null;
            const memberEmails = Array.isArray(data.memberEmails)
              ? data.memberEmails.filter(
                  (e): e is string => typeof e === 'string'
                )
              : [];
            return {
              id: d.id,
              title: data.title ?? d.id,
              subject: data.subject,
              memberEmails,
              createdAt,
              createdBy: data.createdBy,
            };
          })
          .sort((a, b) => a.title.localeCompare(b.title));
        setTestClasses(items);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error(`[useTestClasses:${orgId}] snapshot error:`, err);
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, [shouldSubscribe, orgId]);

  const addTestClass = async (input: {
    classId?: string;
    title: string;
    subject?: string;
    memberEmails: string | string[];
  }): Promise<void> => {
    if (!orgId) throw new Error('No organization selected.');
    if (!input.title.trim()) throw new Error('Title is required.');
    const emails = normalizeEmails(input.memberEmails);
    if (emails.length === 0) {
      throw new Error('At least one member email is required.');
    }
    const trimmedId = input.classId?.trim();
    const id =
      trimmedId && trimmedId.length > 0
        ? trimmedId
        : slugOrFallback(input.title, 'testclass');
    // Guard against slug collisions (explicit ids or auto-slugs that happen
    // to match an existing class). setDoc without an existence check would
    // silently overwrite the other admin's class.
    const ref = doc(db, 'organizations', orgId, 'testClasses', id);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      throw new Error(
        `A test class with id "${id}" already exists. Choose a different title or class id.`
      );
    }
    const payload: Record<string, unknown> = {
      title: input.title.trim(),
      memberEmails: emails,
      createdAt: serverTimestamp(),
      createdBy: user?.uid ?? 'unknown',
    };
    if (input.subject?.trim()) payload.subject = input.subject.trim();
    await setDoc(ref, payload);
  };

  const updateTestClass = async (
    id: string,
    patch: {
      title?: string;
      subject?: string;
      memberEmails?: string | string[];
    }
  ): Promise<void> => {
    if (!orgId) throw new Error('No organization selected.');
    const update: Record<string, unknown> = {};
    if (patch.title !== undefined) update.title = patch.title.trim();
    if (patch.subject !== undefined) {
      const s = patch.subject.trim();
      update.subject = s.length > 0 ? s : null;
    }
    if (patch.memberEmails !== undefined) {
      const emails = normalizeEmails(patch.memberEmails);
      if (emails.length === 0) {
        throw new Error('At least one member email is required.');
      }
      update.memberEmails = emails;
    }
    if (Object.keys(update).length === 0) return;
    await updateDoc(doc(db, 'organizations', orgId, 'testClasses', id), update);
  };

  const removeTestClass = async (id: string): Promise<void> => {
    if (!orgId) throw new Error('No organization selected.');
    await deleteDoc(doc(db, 'organizations', orgId, 'testClasses', id));
  };

  return {
    testClasses,
    loading,
    error,
    addTestClass,
    updateTestClass,
    removeTestClass,
  };
};
