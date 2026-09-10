import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useGoogleDrive } from './useGoogleDrive';
import type {
  PlcQuestionBankEntry,
  QuestionBankData,
  QuestionBankMetadata,
  QuestionBankSyncLinkage,
  QuizQuestion,
  QuizStimulus,
  SyncedQuestionBank,
} from '@/types';
import { QuizDriveService } from '@/utils/quizDriveService';
import { MockQuizDriveService } from '@/utils/mockQuizDriveService';
import { BankDriveService, type BankDriveLike } from '@/utils/bankDriveService';
import { copyBankQuestions, type BankContent } from '@/utils/questionBanks';
import {
  buildBankMetadata,
  plcBankHeader,
  plcBankHeaderPatch,
  stripUndefined,
  syncedBankPayload,
  withPlcId,
  withoutPlcId,
} from '@/utils/questionBankRecords';
import { suggestDuplicateTitle } from '@/components/common/library/libraryDuplicate';
import { logError } from '@/utils/logError';

export const BANKS_COLLECTION = 'question_banks';
export const SYNCED_BANKS_COLLECTION = 'synced_question_banks';

export interface UseQuestionBanksResult {
  banks: QuestionBankMetadata[];
  loading: boolean;
  error: string | null;
  /** Drive save + metadata upsert; republishes to the synced doc and PLC headers when shared. */
  saveBank: (
    bank: QuestionBankData,
    existingDriveFileId?: string
  ) => Promise<QuestionBankMetadata>;
  loadBankData: (driveFileId: string) => Promise<QuestionBankData>;
  /** Removes the Drive file, metadata, every PLC header and the synced doc. */
  deleteBank: (meta: QuestionBankMetadata) => Promise<void>;
  /** Private fork: new id + Drive file, never inherits `sync`. */
  duplicateBank: (meta: QuestionBankMetadata) => Promise<QuestionBankMetadata>;
  reorderBanks: (orderedIds: string[]) => Promise<void>;
  shareBankWithPlc: (
    meta: QuestionBankMetadata,
    plcId: string
  ) => Promise<void>;
  unshareBankFromPlc: (
    meta: QuestionBankMetadata,
    plcId: string
  ) => Promise<void>;
  /** Copies `questions` (fresh ids, re-keyed stimuli) into an existing or new bank. */
  appendQuestionsToBank: (
    target: { bankId: string } | { newTitle: string },
    questions: QuizQuestion[],
    stimuli: QuizStimulus[]
  ) => Promise<QuestionBankMetadata>;
  isDriveConnected: boolean;
}

function bankMetaRef(uid: string, bankId: string) {
  return doc(db, 'users', uid, BANKS_COLLECTION, bankId);
}

function syncedBankRef(groupId: string) {
  return doc(db, SYNCED_BANKS_COLLECTION, groupId);
}

function plcHeadersQuery(plcId: string, groupId: string) {
  return query(
    collection(db, 'plcs', plcId, BANKS_COLLECTION),
    where('syncGroupId', '==', groupId)
  );
}

export const useQuestionBanks = (
  userId: string | undefined
): UseQuestionBanksResult => {
  const { user, googleAccessToken } = useAuth();
  const { isConnected } = useGoogleDrive();
  const [banks, setBanks] = useState<QuestionBankMetadata[]>([]);
  const [loading, setLoading] = useState(!!userId);
  const [error, setError] = useState<string | null>(null);
  const [prevUserId, setPrevUserId] = useState(userId);

  if (prevUserId !== userId) {
    setPrevUserId(userId);
    if (!userId) {
      setBanks([]);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, 'users', userId, BANKS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setBanks(snap.docs.map((d) => d.data() as QuestionBankMetadata));
        setError(null);
        setLoading(false);
      },
      (err) => {
        logError('useQuestionBanks.onSnapshot', err, { uid: userId });
        setError('Failed to load question banks');
        setLoading(false);
      }
    );
    return unsub;
  }, [userId]);

  const getDriveService = useCallback((): BankDriveLike => {
    if (isAuthBypass) {
      if (!userId) throw new Error('Not authenticated');
      return new BankDriveService(new MockQuizDriveService(userId));
    }
    if (!googleAccessToken) {
      throw new Error(
        'Not connected to Google Drive. Please sign in again to grant access.'
      );
    }
    return new BankDriveService(new QuizDriveService(googleAccessToken));
  }, [googleAccessToken, userId]);

  const readMeta = useCallback(
    async (
      uid: string,
      bankId: string
    ): Promise<QuestionBankMetadata | null> => {
      const snap = await getDoc(bankMetaRef(uid, bankId));
      return snap.exists() ? (snap.data() as QuestionBankMetadata) : null;
    },
    []
  );

  /** Owner-only republish: read the current version, write version + 1 (or 1 when missing). */
  const publishSynced = useCallback(
    async (
      uid: string,
      bank: QuestionBankData,
      groupId: string,
      plcIds: string[],
      now: number
    ): Promise<SyncedQuestionBank> => {
      const ref = syncedBankRef(groupId);
      const snap = await getDoc(ref);
      const current = snap.exists()
        ? (snap.data() as SyncedQuestionBank)
        : null;
      const payload = syncedBankPayload(bank, {
        groupId,
        ownerUid: uid,
        plcIds,
        version: current ? current.version + 1 : 1,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      });
      await setDoc(ref, payload);
      return payload;
    },
    []
  );

  const mirrorHeaders = useCallback(
    async (
      bank: QuestionBankData,
      sync: QuestionBankSyncLinkage,
      now: number
    ) => {
      const patch = plcBankHeaderPatch(bank, now);
      await Promise.all(
        sync.plcIds.map(async (plcId) => {
          const snap = await getDocs(plcHeadersQuery(plcId, sync.groupId));
          await Promise.all(snap.docs.map((d) => updateDoc(d.ref, patch)));
        })
      );
    },
    []
  );

  const saveBank = useCallback(
    async (
      bank: QuestionBankData,
      existingDriveFileId?: string
    ): Promise<QuestionBankMetadata> => {
      if (!userId) throw new Error('Not authenticated');
      const drive = getDriveService();
      const now = Date.now();
      const updated: QuestionBankData = { ...bank, updatedAt: now };
      const existing = await readMeta(userId, bank.id);
      const driveFileId = await drive.saveBank(
        updated,
        existingDriveFileId ?? existing?.driveFileId
      );
      const metadata = buildBankMetadata(updated, driveFileId, existing);
      await setDoc(bankMetaRef(userId, bank.id), metadata);
      if (existing?.sync) {
        await publishSynced(
          userId,
          updated,
          existing.sync.groupId,
          existing.sync.plcIds,
          now
        );
        await mirrorHeaders(updated, existing.sync, now);
      }
      return metadata;
    },
    [userId, getDriveService, readMeta, publishSynced, mirrorHeaders]
  );

  const loadBankData = useCallback(
    (driveFileId: string): Promise<QuestionBankData> =>
      getDriveService().loadBank(driveFileId),
    [getDriveService]
  );

  const deleteHeaders = useCallback(
    async (plcId: string, groupId: string): Promise<void> => {
      const snap = await getDocs(plcHeadersQuery(plcId, groupId));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    },
    []
  );

  const deleteBank = useCallback(
    async (meta: QuestionBankMetadata): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const drive = getDriveService();
      await drive.deleteBankFile(meta.driveFileId).catch((err: unknown) => {
        logError('useQuestionBanks.deleteBank.drive', err, {
          bankId: meta.id,
          driveFileId: meta.driveFileId,
        });
      });
      const sync = meta.sync;
      if (sync) {
        await Promise.all(
          sync.plcIds.map((plcId) => deleteHeaders(plcId, sync.groupId))
        );
        await deleteDoc(syncedBankRef(sync.groupId));
      }
      await deleteDoc(bankMetaRef(userId, meta.id));
    },
    [userId, getDriveService, deleteHeaders]
  );

  const duplicateBank = useCallback(
    async (meta: QuestionBankMetadata): Promise<QuestionBankMetadata> => {
      if (!userId) throw new Error('Not authenticated');
      const drive = getDriveService();
      const source = await drive.loadBank(meta.driveFileId);
      const now = Date.now();
      const fresh: QuestionBankData = stripUndefined({
        id: crypto.randomUUID(),
        title: suggestDuplicateTitle(source.title || meta.title),
        questions: source.questions,
        stimuli:
          source.stimuli && source.stimuli.length > 0
            ? source.stimuli.map((s) => ({ ...s }))
            : undefined,
        targets:
          source.targets && source.targets.length > 0
            ? source.targets.map((t) => ({ ...t }))
            : undefined,
        language: source.language,
        createdAt: now,
        updatedAt: now,
      });
      let createdDriveFileId: string | undefined;
      try {
        createdDriveFileId = await drive.saveBank(fresh);
        const metadata = buildBankMetadata(fresh, createdDriveFileId, {
          folderId: meta.folderId,
        });
        await setDoc(bankMetaRef(userId, fresh.id), metadata);
        return metadata;
      } catch (err) {
        if (createdDriveFileId) {
          await drive
            .deleteBankFile(createdDriveFileId)
            .catch((rollbackErr) => {
              logError('useQuestionBanks.duplicateBank.rollback', rollbackErr, {
                sourceBankId: meta.id,
                orphanDriveFileId: createdDriveFileId,
              });
            });
        }
        throw err;
      }
    },
    [userId, getDriveService]
  );

  const reorderBanks = useCallback(
    async (orderedIds: string[]): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const batch = writeBatch(db);
      const now = Date.now();
      orderedIds.forEach((id, index) => {
        batch.update(bankMetaRef(userId, id), { order: index, updatedAt: now });
      });
      await batch.commit();
    },
    [userId]
  );

  const shareBankWithPlc = useCallback(
    async (meta: QuestionBankMetadata, plcId: string): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const drive = getDriveService();
      const current = (await readMeta(userId, meta.id)) ?? meta;
      const bank = await drive.loadBank(current.driveFileId);
      const now = Date.now();
      const groupId = current.sync?.groupId ?? crypto.randomUUID();
      const sync = withPlcId(current.sync, groupId, plcId);
      await publishSynced(userId, bank, groupId, sync.plcIds, now);
      const header: PlcQuestionBankEntry = plcBankHeader(bank, {
        id: crypto.randomUUID(),
        syncGroupId: groupId,
        sharedBy: userId,
        sharedByEmail: user?.email ?? '',
        sharedByName: user?.displayName ?? user?.email ?? '',
        now,
      });
      await setDoc(doc(db, 'plcs', plcId, BANKS_COLLECTION, header.id), header);
      await setDoc(bankMetaRef(userId, meta.id), {
        ...current,
        sync,
        updatedAt: now,
      });
    },
    [userId, user, getDriveService, readMeta, publishSynced]
  );

  const unshareBankFromPlc = useCallback(
    async (meta: QuestionBankMetadata, plcId: string): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const current = (await readMeta(userId, meta.id)) ?? meta;
      if (!current.sync) return;
      const groupId = current.sync.groupId;
      await deleteHeaders(plcId, groupId);
      const remaining = withoutPlcId(current.sync, plcId);
      if (remaining) {
        const bank = await getDriveService().loadBank(current.driveFileId);
        await publishSynced(
          userId,
          bank,
          groupId,
          remaining.plcIds,
          Date.now()
        );
      } else {
        await deleteDoc(syncedBankRef(groupId));
      }
      const next: QuestionBankMetadata = { ...current, updatedAt: Date.now() };
      delete next.sync;
      if (remaining) next.sync = remaining;
      await setDoc(bankMetaRef(userId, meta.id), next);
    },
    [userId, getDriveService, readMeta, publishSynced, deleteHeaders]
  );

  const appendQuestionsToBank = useCallback(
    async (
      target: { bankId: string } | { newTitle: string },
      questions: QuizQuestion[],
      stimuli: QuizStimulus[]
    ): Promise<QuestionBankMetadata> => {
      if (!userId) throw new Error('Not authenticated');
      const incoming: BankContent = {
        id: 'incoming',
        title: '',
        questions,
        stimuli,
      };
      const copied = copyBankQuestions(
        incoming,
        questions.map((q) => q.id)
      );
      if ('bankId' in target) {
        const meta = await readMeta(userId, target.bankId);
        if (!meta) throw new Error('Question bank not found');
        const bank = await getDriveService().loadBank(meta.driveFileId);
        const merged: QuestionBankData = stripUndefined({
          ...bank,
          questions: [...bank.questions, ...copied.questions],
          stimuli:
            (bank.stimuli?.length ?? 0) + copied.stimuli.length > 0
              ? [...(bank.stimuli ?? []), ...copied.stimuli]
              : undefined,
        });
        return saveBank(merged, meta.driveFileId);
      }
      const now = Date.now();
      const fresh: QuestionBankData = stripUndefined({
        id: crypto.randomUUID(),
        title: target.newTitle,
        questions: copied.questions,
        stimuli: copied.stimuli.length > 0 ? copied.stimuli : undefined,
        createdAt: now,
        updatedAt: now,
      });
      return saveBank(fresh);
    },
    [userId, getDriveService, readMeta, saveBank]
  );

  return {
    banks,
    loading,
    error,
    saveBank,
    loadBankData,
    deleteBank,
    duplicateBank,
    reorderBanks,
    shareBankWithPlc,
    unshareBankFromPlc,
    appendQuestionsToBank,
    isDriveConnected: isAuthBypass || isConnected,
  };
};
