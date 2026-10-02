import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import type { GlobalFeaturePermission } from '@/types';

const STUDENT_LANDING_V2_FEATURE = 'student-landing-v2';

/** Open to everyone once Public, or early to students in a listed class (D26); a missing doc is off. */
export function isStudentLandingV2Open(
  permission: Partial<GlobalFeaturePermission> | undefined,
  classIds: readonly string[]
): boolean {
  if (permission?.enabled !== true) return false;
  if (permission.accessLevel === 'public' && !permission.buildings?.length)
    return true;
  const beta = permission.betaClassIds;
  if (!Array.isArray(beta) || beta.length === 0) return false;
  return classIds.some((id) => beta.includes(id));
}

/** `null` until the flag doc has loaded, so callers don't flash the old page. */
export function useStudentLandingV2Enabled(
  classIds: readonly string[]
): boolean | null {
  const [permission, setPermission] = useState<
    Partial<GlobalFeaturePermission> | undefined | null
  >(null);
  useEffect(() => {
    if (isAuthBypass) return;
    return onSnapshot(
      doc(db, 'global_permissions', STUDENT_LANDING_V2_FEATURE),
      (snap) =>
        setPermission(
          snap.data() as Partial<GlobalFeaturePermission> | undefined
        ),
      () => setPermission(undefined)
    );
  }, []);
  if (isAuthBypass) return true;
  if (permission === null) return null;
  return isStudentLandingV2Open(permission, classIds);
}
