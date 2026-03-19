import { useState, useEffect, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { MusicStation } from '@/types';
import { useAuth } from '@/context/useAuth';

export const useMusicStations = () => {
  const [rawStations, setRawStations] = useState<MusicStation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { selectedBuildings } = useAuth();

  // Subscribe once — no dependency on selectedBuildings to avoid listener churn.
  useEffect(() => {
    const docRef = doc(db, 'global_music_stations', 'library');
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as { stations?: MusicStation[] };
          setRawStations(data.stations ?? []);
        } else {
          setRawStations([]);
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

  // Derive filtered + sorted list from raw data and the user's building selection.
  const stations = useMemo(
    () =>
      rawStations
        .filter((s) => s.isActive !== false)
        .filter((s) => {
          // No building restriction → visible to everyone
          if (!s.buildingIds || s.buildingIds.length === 0) return true;
          // User has no building selected → show all stations (empty selection = show all content)
          if (selectedBuildings.length === 0) return true;
          // Show if any of the user's buildings match the station's buildings
          return s.buildingIds.some((id) => selectedBuildings.includes(id));
        })
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [rawStations, selectedBuildings]
  );

  return { stations, isLoading };
};
