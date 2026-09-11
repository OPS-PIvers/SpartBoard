import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { PlcQuestionBankEntry } from '@/types';
import { logError } from '@/utils/logError';
import { BANKS_COLLECTION } from './useQuestionBanks';

export interface UsePlcQuestionBankEntriesResult {
  /** Live headers under `plcs/{plcId}/question_banks`, tombstones dropped, newest share first. */
  entries: PlcQuestionBankEntry[];
  loading: boolean;
  error: Error | null;
}

export function usePlcQuestionBankEntries(
  plcId: string
): UsePlcQuestionBankEntriesResult {
  const [entries, setEntries] = useState<PlcQuestionBankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'plcs', plcId, BANKS_COLLECTION),
      (snap) => {
        const next = snap.docs
          .map((d) => d.data() as PlcQuestionBankEntry)
          .filter((e) => !e.deletedAt)
          .sort((a, b) => b.sharedAt - a.sharedAt);
        setEntries(next);
        setLoading(false);
      },
      (err) => {
        logError('usePlcQuestionBankEntries.onSnapshot', err, { plcId });
        setError(err);
        setEntries([]);
        setLoading(false);
      }
    );
    return unsub;
  }, [plcId]);

  return { entries, loading, error };
}
