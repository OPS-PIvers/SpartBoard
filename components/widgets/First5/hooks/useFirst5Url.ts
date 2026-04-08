import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { First5GlobalConfig, GradeLevel } from '@/types';
import { useAuth } from '@/context/useAuth';
import { computeCurrentDayNumber } from '@/utils/first5';

function gradeLevelToAgeLetter(gradeLevels: GradeLevel[]): string | null {
  const grade = gradeLevels[0];
  if (!grade) return null;
  switch (grade) {
    case 'k-2':
      return 'j';
    case '3-5':
      return 'p';
    case '6-8':
    case '9-12':
      return 's';
    default:
      return null;
  }
}

export const useFirst5Url = () => {
  const { selectedBuildings, userGradeLevels } = useAuth();

  const [config, setConfig] = useState<First5GlobalConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(() => Date.now());

  // Subscribe to Firestore config
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'feature_permissions', 'first-5'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as { config?: First5GlobalConfig };
          setConfig(data.config ?? null);
        } else {
          setConfig(null);
        }
        setIsLoading(false);
      },
      (error) => {
        console.error('Failed to listen for First 5 config changes:', error);
        setIsLoading(false);
        setConfig(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Re-check day number every 60 seconds for rollover detection
  useEffect(() => {
    const interval = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return { url: null, error: null, isLoading: true };
  }

  if (!config?.activeDayNumber || !config?.referenceDate) {
    return {
      url: null,
      error:
        'First 5 has not been configured yet. Ask your administrator to set the day number.',
      isLoading: false,
    };
  }

  if (selectedBuildings.length === 0) {
    return {
      url: null,
      error: 'Select a building in Settings to use First 5.',
      isLoading: false,
    };
  }

  const ageLetter = gradeLevelToAgeLetter(userGradeLevels);
  if (!ageLetter) {
    return {
      url: null,
      error: 'Unable to determine age group for your building.',
      isLoading: false,
    };
  }

  const dayNumber = computeCurrentDayNumber(
    config.activeDayNumber,
    config.referenceDate,
    new Date(tick)
  );

  return {
    url: `https://www.edtomorrow.com/today/${dayNumber}${ageLetter}`,
    error: null,
    isLoading: false,
  };
};
