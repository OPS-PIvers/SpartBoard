import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { MusicStation } from '@/types';

export const useMusicStations = () => {
  const [stations, setStations] = useState<MusicStation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const docRef = doc(db, 'global_music_stations', 'library');
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as { stations?: MusicStation[] };
          const raw: MusicStation[] = data.stations ?? [];
          setStations(
            raw
              .filter((s) => s.isActive !== false)
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          );
        } else {
          setStations([]);
        }
        setIsLoading(false);
      },
      (err) => {
        console.error('Error fetching music stations:', err);
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { stations, isLoading };
};
