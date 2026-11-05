import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

/** The first name on a signed-in student's token, or undefined for everyone else. */
export function useStudentTokenFirstName(
  user: User | null
): string | undefined {
  const [claim, setClaim] = useState<{ uid: string; name?: string } | null>(
    null
  );
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const uid = user.uid;
    void Promise.resolve()
      .then(() => user.getIdTokenResult())
      .then((token) => {
        const name = token.claims?.firstName;
        if (!cancelled)
          setClaim({
            uid,
            name:
              token.claims?.studentRole === true && typeof name === 'string'
                ? name
                : undefined,
          });
      })
      .catch(() => {
        if (!cancelled) setClaim({ uid });
      });
    return () => {
      cancelled = true;
    };
  }, [user]);
  return user && claim?.uid === user.uid ? claim.name : undefined;
}
