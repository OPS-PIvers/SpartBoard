import { useState, useEffect, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { MusicStation } from '@/types';
import { useAuth } from '@/context/useAuth';
import { extractYouTubeId } from '@/utils/youtube';

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
          const loaded = data.stations ?? [];
          // Backwards compatibility for missing thumbnails on YouTube URLs
          const migrated = loaded.map((station) => {
            if (!station.thumbnail && station.url) {
              const videoId = extractYouTubeId(station.url);
              if (videoId) {
                return {
                  ...station,
                  thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                };
              }
            }
            return station;
          });
          setRawStations(migrated);
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
