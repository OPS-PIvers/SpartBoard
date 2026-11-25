import { useEffect, useRef } from 'react';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { dropPinLogin } from '@/utils/pinLoginScope';
import {
  useResolvedFirebaseUser,
  type ResolvedFirebaseUser,
} from '@/hooks/useResolvedFirebaseUser';

/** Live auth for Activity Wall pages: keeps a signed-in user, else stays signed in as a guest. */
export function useGuestFirebaseUser(label: string): ResolvedFirebaseUser {
  const resolvedUser = useResolvedFirebaseUser();
  const { user, resolved } = resolvedUser;
  // Only the user found at open is checked: a PIN sign-in made later belongs to a quiz in another tab.
  const openChecked = useRef(false);
  useEffect(() => {
    if (!resolved) return;
    const atOpen = !openChecked.current;
    openChecked.current = true;
    if (user && !atOpen) return;
    void (user ? dropPinLogin(auth) : signInAnonymously(auth)).catch((err) => {
      console.error(`[${label}] Guest sign-in failed:`, err);
    });
  }, [resolved, user, label]);
  return resolvedUser;
}
