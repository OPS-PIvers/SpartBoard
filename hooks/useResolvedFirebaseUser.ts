import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/config/firebase';

export interface ResolvedFirebaseUser {
  user: User | null;
  /** True once Firebase Auth has emitted its first state (hydration finished). */
  resolved: boolean;
}

/** Subscribes to auth state and never signs anyone in by itself. */
export function useResolvedFirebaseUser(): ResolvedFirebaseUser {
  const [state, setState] = useState<ResolvedFirebaseUser>({
    user: null,
    resolved: false,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (next) => {
      setState({ user: next, resolved: true });
    });
    return unsubscribe;
  }, []);

  return state;
}
