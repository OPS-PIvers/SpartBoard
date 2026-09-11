import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  PlcQuestionBankEntry,
  QuizData,
  SyncedQuestionBank,
} from '@/types';
import {
  bankSlotKey,
  randomBankSlots,
  type BankContent,
} from '@/utils/questionBanks';
import {
  mergeBankSources,
  type BankSource,
  type SharedBankRow,
} from '@/utils/questionBankRecords';
import { logError } from '@/utils/logError';
import { usePlcs } from './usePlcs';
import {
  useQuestionBanks,
  BANKS_COLLECTION,
  SYNCED_BANKS_COLLECTION,
} from './useQuestionBanks';

export type { BankSource } from '@/utils/questionBankRecords';

export interface UseBankSourcesResult {
  /** Own banks first (kind 'personal'), then teammates' shared ones. */
  sources: BankSource[];
  loading: boolean;
  loadBankContent: (source: BankSource) => Promise<BankContent>;
  /** One entry per random slot keyed by bankSlotKey(slot); a slot whose bank can't be loaded is absent. */
  loadBankContentsForQuiz: (
    quiz: Pick<QuizData, 'bankSlots'>
  ) => Promise<Map<string, BankContent>>;
}

/** Narrow Drive JSON or a synced doc to the slot-resolution shape. */
export function toBankContent(
  data: Pick<BankContent, 'id' | 'title' | 'stimuli' | 'targets'> & {
    questions?: BankContent['questions'];
  }
): BankContent {
  return {
    id: data.id,
    title: data.title,
    questions: data.questions ?? [],
    ...(data.stimuli ? { stimuli: data.stimuli } : {}),
    ...(data.targets ? { targets: data.targets } : {}),
  };
}

/** Canonical copy of a shared bank; throws when the owner deleted or unshared it. */
export async function loadSyncedBankContent(
  syncGroupId: string
): Promise<BankContent> {
  const snap = await getDoc(doc(db, SYNCED_BANKS_COLLECTION, syncGroupId));
  if (!snap.exists()) {
    throw new Error('This shared bank is no longer available.');
  }
  return toBankContent(snap.data() as SyncedQuestionBank);
}

export function useBankSources(
  userId: string | undefined
): UseBankSourcesResult {
  const {
    banks,
    loading: banksLoading,
    loadBankData,
  } = useQuestionBanks(userId);
  const { plcs, loading: plcsLoading } = usePlcs({ enabled: !!userId });
  const [sharedByPlc, setSharedByPlc] = useState<
    Record<string, PlcQuestionBankEntry[]>
  >({});

  const plcKey = plcs
    .map((p) => p.id)
    .sort()
    .join('|');

  useEffect(() => {
    if (!userId || !plcKey) return;
    const unsubs = plcKey.split('|').map((plcId) =>
      onSnapshot(
        collection(db, 'plcs', plcId, BANKS_COLLECTION),
        (snap) => {
          const entries = snap.docs.map(
            (d) => d.data() as PlcQuestionBankEntry
          );
          setSharedByPlc((prev) => ({ ...prev, [plcId]: entries }));
        },
        (err) => {
          logError('useBankSources.onSnapshot', err, { plcId });
          setSharedByPlc((prev) => ({ ...prev, [plcId]: [] }));
        }
      )
    );
    return () => {
      unsubs.forEach((u) => u());
      setSharedByPlc({});
    };
  }, [userId, plcKey]);

  const sharedLoading = plcs.some((p) => !(p.id in sharedByPlc));

  const sources = useMemo(() => {
    const nameById = new Map(plcs.map((p) => [p.id, p.name]));
    const rows: SharedBankRow[] = [];
    for (const [plcId, entries] of Object.entries(sharedByPlc)) {
      if (!nameById.has(plcId)) continue;
      for (const entry of entries) {
        rows.push({ plcId, plcName: nameById.get(plcId) ?? '', entry });
      }
    }
    rows.sort((a, b) => b.entry.sharedAt - a.entry.sharedAt);
    return mergeBankSources(banks, rows);
  }, [banks, plcs, sharedByPlc]);

  const loadBankContent = useCallback(
    async (source: BankSource): Promise<BankContent> => {
      if (source.kind === 'plc') {
        if (!source.syncGroupId) throw new Error('Shared bank has no group id');
        return loadSyncedBankContent(source.syncGroupId);
      }
      if (!source.driveFileId) throw new Error('Bank has no Drive file');
      const data = await loadBankData(source.driveFileId);
      return toBankContent(data);
    },
    [loadBankData]
  );

  const loadBankContentsForQuiz = useCallback(
    async (
      quiz: Pick<QuizData, 'bankSlots'>
    ): Promise<Map<string, BankContent>> => {
      const out = new Map<string, BankContent>();
      const slotsByKey = new Map(
        randomBankSlots(quiz).map((s) => [bankSlotKey(s), s])
      );
      await Promise.all(
        [...slotsByKey].map(async ([key, slot]) => {
          try {
            if (slot.syncGroupId) {
              out.set(key, await loadSyncedBankContent(slot.syncGroupId));
              return;
            }
            const meta = banks.find((b) => b.id === slot.bankId);
            if (!meta) throw new Error('Bank not in library');
            const data = await loadBankData(meta.driveFileId);
            out.set(key, toBankContent(data));
          } catch (err) {
            logError('useBankSources.loadBankContentsForQuiz', err, {
              slotKey: key,
              bankId: slot.bankId,
            });
          }
        })
      );
      return out;
    },
    [banks, loadBankData]
  );

  return {
    sources,
    loading: banksLoading || plcsLoading || sharedLoading,
    loadBankContent,
    loadBankContentsForQuiz,
  };
}
