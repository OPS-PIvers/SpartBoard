import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { StudentPageConfig } from '@/types/organization';

/**
 * Subscribes to `/organizations/{orgId}/studentPageConfig/default`. Reads
 * allowed for org members + super admins via Firestore rules.
 *
 * Writes: `updateStudentPage` upserts the config doc (setDoc with `merge:
 * true`) so the first write still works even if the migration script hasn't
 * seeded the config yet. Rules restrict writes to domain+ admins.
 */
export const useOrgStudentPage = (orgId: string | null) => {
  const { user } = useAuth();
  const [studentPage, setStudentPage] = useState<StudentPageConfig | null>(
    null
  );
  const [error, setError] = useState<Error | null>(null);

  const shouldSubscribe = !isAuthBypass && Boolean(user) && Boolean(orgId);
  const [loading, setLoading] = useState<boolean>(shouldSubscribe);

  const [prevKey, setPrevKey] = useState(`${shouldSubscribe}:${orgId ?? ''}`);
  const nextKey = `${shouldSubscribe}:${orgId ?? ''}`;
  if (prevKey !== nextKey) {
    setPrevKey(nextKey);
    setLoading(shouldSubscribe);
    if (!shouldSubscribe) {
      setStudentPage(null);
      setError(null);
    }
  }

  useEffect(() => {
    if (!shouldSubscribe || !orgId) return;

    const unsub = onSnapshot(
      doc(db, 'organizations', orgId, 'studentPageConfig', 'default'),
      (snap) => {
        setStudentPage(
          snap.exists() ? (snap.data() as StudentPageConfig) : null
        );
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error(`[useOrgStudentPage:${orgId}] snapshot error:`, err);
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, [shouldSubscribe, orgId]);

  const updateStudentPage = async (
    patch: Partial<StudentPageConfig>
  ): Promise<void> => {
    if (!orgId) {
      throw new Error('No organization selected.');
    }
    const { orgId: _omit, ...rest } = patch;
    await setDoc(
      doc(db, 'organizations', orgId, 'studentPageConfig', 'default'),
      { orgId, ...rest },
      { merge: true }
    );
  };

  return {
    studentPage,
    loading,
    error,
    updateStudentPage,
  };
};
