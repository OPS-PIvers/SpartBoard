import type { PlcQuestionBankEntry } from '@/types';
import {
  isLivePlcLibraryEntry,
  usePlcLibraryEntries,
  type PlcLibrarySpec,
} from '@/hooks/usePlcLibraryEntries';
import { BANKS_COLLECTION } from './useQuestionBanks';

export interface UsePlcQuestionBankEntriesResult {
  /** Live headers under `plcs/{plcId}/question_banks`, tombstones dropped, newest share first. */
  entries: PlcQuestionBankEntry[];
  loading: boolean;
  error: Error | null;
}

function parsePlcQuestionBankHeader(
  _id: string,
  data: Record<string, unknown>
): PlcQuestionBankEntry {
  return data as unknown as PlcQuestionBankEntry;
}

// Headers are shared and removed by useQuestionBanks (synced doc + header), so only the listener is used here.
const QUESTION_BANK_LIBRARY: PlcLibrarySpec<PlcQuestionBankEntry> = {
  kind: 'questionBank',
  subcollection: BANKS_COLLECTION,
  parse: parsePlcQuestionBankHeader,
  keep: isLivePlcLibraryEntry,
  orderByUpdatedAt: false,
  sort: (a, b) => b.sharedAt - a.sharedAt,
};

export function usePlcQuestionBankEntries(
  plcId: string
): UsePlcQuestionBankEntriesResult {
  const { entries, loading, error } = usePlcLibraryEntries(
    plcId,
    QUESTION_BANK_LIBRARY
  );
  return { entries, loading, error };
}
