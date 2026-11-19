import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { monthlySpeechToTextUsageDocId } from '@/config/speechToText';
import type { SpeechToTextUsage } from '@/types';

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

const NONE: Required<SpeechToTextUsage> = {
  seconds: 0,
  clips: 0,
  tidyCalls: 0,
};

/** This month's paid Speech to text use across the district; null until read. */
export const useSpeechToTextMonthlyUsage =
  (): Required<SpeechToTextUsage> | null => {
    const [usage, setUsage] = useState<Required<SpeechToTextUsage> | null>(
      isAuthBypass ? NONE : null
    );

    useEffect(() => {
      if (isAuthBypass) return;
      return onSnapshot(
        doc(db, 'ai_usage', monthlySpeechToTextUsageDocId()),
        (snap) => {
          const d = snap.data() ?? {};
          setUsage({
            seconds: num(d.seconds),
            clips: num(d.clips),
            tidyCalls: num(d.tidyCalls),
          });
        },
        () => setUsage(NONE)
      );
    }, []);

    return usage;
  };
