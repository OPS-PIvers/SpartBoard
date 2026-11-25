import type { Plc, PlcLinkage, QuizData, QuizMetadata } from '@/types';
import {
  callLeaveSyncedQuizGroup,
  createSyncedQuizGroup,
  syncedTranslationsInput,
  type SyncedTranslationsLoad,
} from '@/hooks/useSyncedQuizGroups';
import { buildPlcLinkage } from '@/utils/plcLinkage';
import { resolvePlcPoolSyncGroupId } from '@/utils/plcPooling';
import { syncedQuizContentFields } from '@/utils/syncedQuizContent';
import { logError } from '@/utils/logError';

export interface QuizPlcLinkageForAssign {
  plcLinkage: PlcLinkage | undefined;
  /** The PLC library group this run pools with, when one matches. */
  plcPoolSyncGroupId: string | undefined;
  /** The synced group the PLC template hangs off; minted here for an unsynced quiz. */
  plcTemplateSyncGroupId: string | undefined;
  /** Set when this call minted and linked a new group. */
  mintedSyncGroupId: string | undefined;
}

interface PoolEntry {
  title: string;
  syncGroupId: string;
  deletedAt?: number | null;
  archived?: boolean;
}

/** PLC linkage, pool key and template group for any quiz assign that shares with a PLC. */
export async function resolveQuizPlcLinkageForAssign({
  plc,
  uid,
  meta,
  data,
  plcLibrary,
  canPromote,
  attachSyncLinkage,
  loadSyncedTranslations,
  logScope,
}: {
  /** The picked PLC; undefined when the assign doesn't share with one. */
  plc: Plc | undefined;
  uid: string;
  meta: QuizMetadata;
  data: QuizData;
  plcLibrary: readonly PoolEntry[];
  /** False for a District library copy, whose canonical teammates can't join. */
  canPromote: boolean;
  attachSyncLinkage: (
    quizId: string,
    linkage: { groupId: string; lastSyncedVersion: number }
  ) => Promise<unknown>;
  /** Copies the quiz's translations onto a newly minted group, since teammates can't read the owner's files. */
  loadSyncedTranslations: (
    meta: QuizMetadata,
    docBase?: Record<string, unknown>
  ) => Promise<SyncedTranslationsLoad>;
  logScope: string;
}): Promise<QuizPlcLinkageForAssign> {
  const plcLinkage = buildPlcLinkage(plc);
  if (!plc || !plcLinkage) {
    return {
      plcLinkage: undefined,
      plcPoolSyncGroupId: undefined,
      plcTemplateSyncGroupId: meta.sync?.groupId,
      mintedSyncGroupId: undefined,
    };
  }
  // Own group when it is in the PLC library, else the library quiz with the same title.
  const plcPoolSyncGroupId = resolvePlcPoolSyncGroupId({
    quizSyncGroupId: meta.sync?.groupId,
    quizTitle: meta.title,
    libraryEntries: plcLibrary.filter((entry) => !entry.archived),
  });
  let plcTemplateSyncGroupId = meta.sync?.groupId;
  let mintedSyncGroupId: string | undefined;
  // An unsynced quiz becomes a synced group so the PLC template has a canonical to point at.
  if (!plcTemplateSyncGroupId && canPromote) {
    const groupId = crypto.randomUUID();
    try {
      const translations = syncedTranslationsInput(
        await loadSyncedTranslations(meta, {
          title: data.title,
          questions: data.questions,
          stimuli: data.stimuli,
          behavior: meta.behavior,
        })
      ).translations;
      await createSyncedQuizGroup({
        groupId,
        uid,
        title: data.title,
        questions: data.questions,
        ...syncedQuizContentFields(data),
        plcId: plc.id,
        behavior: meta.behavior,
        ...(translations ? { translations } : {}),
      });
      try {
        await attachSyncLinkage(meta.id, {
          groupId,
          lastSyncedVersion: 1,
        });
        plcTemplateSyncGroupId = groupId;
        mintedSyncGroupId = groupId;
      } catch (linkageErr) {
        // Leave the group so no phantom participant points at a quiz that never linked.
        try {
          await callLeaveSyncedQuizGroup(groupId);
        } catch (leaveErr) {
          logError(`${logScope}.promoteSync.rollbackLeave`, leaveErr, {
            plcId: plc.id,
            syncGroupId: groupId,
          });
        }
        logError(`${logScope}.promoteSync.attachLinkage`, linkageErr, {
          plcId: plc.id,
          quizId: meta.id,
        });
      }
    } catch (createErr) {
      // The assignment still creates; only the PLC template is skipped.
      logError(`${logScope}.promoteSync.create`, createErr, {
        plcId: plc.id,
        quizId: meta.id,
      });
    }
  }
  return {
    plcLinkage,
    plcPoolSyncGroupId,
    plcTemplateSyncGroupId,
    mintedSyncGroupId,
  };
}
