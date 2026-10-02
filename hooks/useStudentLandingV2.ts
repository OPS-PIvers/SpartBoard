import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions, isAuthBypass } from '@/config/firebase';

const cache = new Map<string, boolean>();

/** Whether this student's teacher has the redesigned page (D26); `null` until known, so callers don't flash the old page. */
export function useStudentLandingV2Enabled(
  pseudonymUid: string | null
): boolean | null {
  const [fetched, setFetched] = useState<{
    uid: string;
    enabled: boolean;
  } | null>(null);

  useEffect(() => {
    if (isAuthBypass || !pseudonymUid || cache.has(pseudonymUid)) return;
    let cancelled = false;
    httpsCallable<Record<string, never>, { enabled?: boolean }>(
      functions,
      'getStudentLandingV2V1'
    )({})
      .then((res) => {
        const enabled = res.data?.enabled === true;
        cache.set(pseudonymUid, enabled);
        if (!cancelled) setFetched({ uid: pseudonymUid, enabled });
      })
      .catch(() => {
        if (!cancelled) setFetched({ uid: pseudonymUid, enabled: false });
      });
    return () => {
      cancelled = true;
    };
  }, [pseudonymUid]);

  if (isAuthBypass) return true;
  if (!pseudonymUid) return false;
  const cached = cache.get(pseudonymUid);
  if (cached !== undefined) return cached;
  return fetched?.uid === pseudonymUid ? fetched.enabled : null;
}
