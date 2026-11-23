import { useEffect, useState } from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import { auth, isAuthBypass } from '@/config/firebase';

export interface StudentTourIdentity {
  uid: string;
  orgId: string | null;
}

/** The signed-in student, from the token's studentRole and orgId claims; null for anyone else. */
export function useStudentTourIdentity(): StudentTourIdentity | null {
  const [identity, setIdentity] = useState<StudentTourIdentity | null>(null);
  useEffect(() => {
    if (isAuthBypass) return;
    return onIdTokenChanged(auth, (user) => {
      if (!user) {
        setIdentity(null);
        return;
      }
      void user
        .getIdTokenResult()
        .then(({ claims }) =>
          setIdentity(
            claims.studentRole === true
              ? {
                  uid: user.uid,
                  orgId: typeof claims.orgId === 'string' ? claims.orgId : null,
                }
              : null
          )
        )
        .catch(() => setIdentity(null));
    });
  }, []);
  return identity;
}
