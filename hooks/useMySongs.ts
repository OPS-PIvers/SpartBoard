import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { db, isAuthBypass, isConfigured } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { MySong } from '@/types';

const COLLECTION = 'music_stations';

/** The signed-in teacher's own YouTube songs for the Music widget. */
export const useMySongs = (enabled: boolean) => {
  const { user } = useAuth();
  const uid = user?.uid;
  const live = enabled && Boolean(uid) && isConfigured && !isAuthBypass;
  const [songs, setSongs] = useState<MySong[]>([]);
  const [loading, setLoading] = useState(live);

  const [prevKey, setPrevKey] = useState(`${uid}:${live}`);
  if (prevKey !== `${uid}:${live}`) {
    setPrevKey(`${uid}:${live}`);
    setSongs([]);
    setLoading(live);
  }

  useEffect(() => {
    if (!live || !uid) return;
    const q = query(
      collection(db, 'users', uid, COLLECTION),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(
      q,
      (snap) => {
        setSongs(snap.docs.map((d) => ({ ...(d.data() as MySong), id: d.id })));
        setLoading(false);
      },
      (err) => {
        console.error('[useMySongs] Listener error', err);
        setLoading(false);
      }
    );
  }, [live, uid]);

  const addSong = useCallback(
    async (song: MySong) => {
      if (!uid) throw new Error('Not signed in');
      if (!live) {
        setSongs((prev) => [...prev, song]);
        return;
      }
      const { id, ...data } = song;
      await setDoc(doc(db, 'users', uid, COLLECTION, id), data);
    },
    [uid, live]
  );

  const removeSong = useCallback(
    async (id: string) => {
      if (!uid) return;
      if (!live) {
        setSongs((prev) => prev.filter((s) => s.id !== id));
        return;
      }
      await deleteDoc(doc(db, 'users', uid, COLLECTION, id));
    },
    [uid, live]
  );

  return { songs, loading, addSong, removeSong };
};
