import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { First5GlobalConfig, GradeLevel } from '@/types';
import { useAuth } from '@/context/useAuth';

const ROLLOVER_HOUR = 6;

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

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Counts weekdays (Mon–Fri) between two dates, excluding start, including end.
 * Positive if end > start, negative if end < start.
 */
function countWeekdaysBetween(start: Date, end: Date): number {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const sign = endMs >= startMs ? 1 : -1;
  const [from, to] = sign === 1 ? [start, end] : [end, start];

  let count = 0;
  const cursor = new Date(from);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= to) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count * sign;
}

function computeCurrentDayNumber(
  activeDayNumber: number,
  referenceDate: string,
  now: Date
): number {
  const ref = stripTime(new Date(referenceDate + 'T00:00:00'));

  // Before rollover hour, use previous calendar day
  const effective = new Date(now);
  if (effective.getHours() < ROLLOVER_HOUR) {
    effective.setDate(effective.getDate() - 1);
  }
  const today = stripTime(effective);

  return activeDayNumber + countWeekdaysBetween(ref, today);
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
