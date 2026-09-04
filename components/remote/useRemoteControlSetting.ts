import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';

/**
 * Live view of the account's "allow mobile devices to control this board"
 * toggle. AuthContext reads the profile doc once at sign-in, so an already
 * paired /remote page would never notice the teacher switching it off — this
 * listener is the smallest read that keeps the remote honest.
 */
export const useRemoteControlSetting = (): boolean => {
  const { user, remoteControlEnabled } = useAuth();
  const uid = user?.uid ?? null;
  // Stamped with the uid it came from, so a sign-out needs no reset effect.
  const [live, setLive] = useState<{ uid: string; value: boolean } | null>(
    null
  );

  useEffect(() => {
    if (isAuthBypass || !uid) return;
    return onSnapshot(
      doc(db, 'users', uid, 'userProfile', 'profile'),
      (snap) => {
        const value = (snap.data() as Record<string, unknown> | undefined)
          ?.remoteControlEnabled;
        setLive({ uid, value: typeof value === 'boolean' ? value : true });
      },
      (err: unknown) => {
        console.error(
          '[useRemoteControlSetting] profile listener failed:',
          err
        );
        setLive(null);
      }
    );
  }, [uid]);

  return live && live.uid === uid ? live.value : remoteControlEnabled;
};
