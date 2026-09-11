import type {
  PlcQuestionBankEntry,
  QuestionBankData,
  QuestionBankMetadata,
  QuestionBankSyncLinkage,
  SyncedQuestionBank,
} from '@/types';
import { bankTargetIndex } from '@/utils/questionBanks';
import { buildQuizSearchText } from '@/utils/quizSearchText';

/** Fields preserved across saves so the editor can't drop them. */
export type PreservedBankMetadata = Partial<
  Pick<QuestionBankMetadata, 'folderId' | 'order' | 'sync'>
> | null;

/** Firestore rejects `undefined`; drop those keys before any write. */
export function stripUndefined<T extends object>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/** Metadata doc for `users/{uid}/question_banks/{bankId}` after a Drive save. */
export function buildBankMetadata(
  bank: QuestionBankData,
  driveFileId: string,
  preserved: PreservedBankMetadata = null
): QuestionBankMetadata {
  const { targetIds, targetCounts } = bankTargetIndex(bank);
  return stripUndefined({
    id: bank.id,
    title: bank.title,
    driveFileId,
    questionCount: bank.questions.length,
    searchText: buildQuizSearchText(bank.questions),
    targetIds,
    targetCounts,
    createdAt: bank.createdAt,
    updatedAt: bank.updatedAt,
    folderId: preserved?.folderId,
    order: preserved?.order,
    sync: preserved?.sync ? cloneSync(preserved.sync) : undefined,
  });
}

export function cloneSync(
  sync: QuestionBankSyncLinkage
): QuestionBankSyncLinkage {
  return { groupId: sync.groupId, plcIds: [...sync.plcIds] };
}

export interface SyncedBankPayloadInput {
  groupId: string;
  ownerUid: string;
  plcIds: string[];
  version: number;
  createdAt: number;
  updatedAt?: number;
}

/** Full canonical copy for `synced_question_banks/{groupId}`; keys match the rules allowlist. */
export function syncedBankPayload(
  bank: QuestionBankData,
  input: SyncedBankPayloadInput
): SyncedQuestionBank {
  const { targetIds, targetCounts } = bankTargetIndex(bank);
  return stripUndefined({
    id: input.groupId,
    ownerUid: input.ownerUid,
    plcIds: [...input.plcIds],
    version: input.version,
    title: bank.title,
    questions: bank.questions,
    stimuli: bank.stimuli && bank.stimuli.length > 0 ? bank.stimuli : undefined,
    targets: bank.targets && bank.targets.length > 0 ? bank.targets : undefined,
    language: bank.language,
    questionCount: bank.questions.length,
    targetIds,
    targetCounts,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? bank.updatedAt,
  });
}

export interface PlcBankHeaderInput {
  id: string;
  syncGroupId: string;
  sharedBy: string;
  sharedByEmail: string;
  sharedByName: string;
  now: number;
}

/** New header row for `plcs/{plcId}/question_banks/{id}`. */
export function plcBankHeader(
  bank: QuestionBankData,
  input: PlcBankHeaderInput
): PlcQuestionBankEntry {
  return {
    id: input.id,
    title: bank.title,
    questionCount: bank.questions.length,
    syncGroupId: input.syncGroupId,
    targetIds: bankTargetIndex(bank).targetIds,
    sharedBy: input.sharedBy,
    sharedByEmail: input.sharedByEmail.toLowerCase(),
    sharedByName: input.sharedByName,
    sharedAt: input.now,
    updatedAt: input.now,
  };
}

/** Mutable header fields mirrored onto every PLC row on republish. */
export function plcBankHeaderPatch(
  bank: QuestionBankData,
  now: number
): Pick<
  PlcQuestionBankEntry,
  'title' | 'questionCount' | 'targetIds' | 'updatedAt'
> {
  return {
    title: bank.title,
    questionCount: bank.questions.length,
    targetIds: bankTargetIndex(bank).targetIds,
    updatedAt: now,
  };
}

/** Linkage after adding `plcId`; `undefined` in means a fresh group. */
export function withPlcId(
  sync: QuestionBankSyncLinkage | undefined,
  groupId: string,
  plcId: string
): QuestionBankSyncLinkage {
  const plcIds = sync ? sync.plcIds.filter((id) => id !== plcId) : [];
  return { groupId, plcIds: [...plcIds, plcId] };
}

/** Linkage after removing `plcId`; `undefined` when no PLC remains. */
export function withoutPlcId(
  sync: QuestionBankSyncLinkage,
  plcId: string
): QuestionBankSyncLinkage | undefined {
  const plcIds = sync.plcIds.filter((id) => id !== plcId);
  return plcIds.length > 0 ? { groupId: sync.groupId, plcIds } : undefined;
}

export interface BankSource {
  /** bankSlotKey: syncGroupId for shared banks, bankId otherwise. */
  key: string;
  kind: 'personal' | 'plc';
  bankId: string;
  /** Set when the bank is PLC-shared (own or a teammate's). */
  syncGroupId?: string;
  title: string;
  questionCount: number;
  targetIds: string[];
  targetCounts: Record<string, number>;
  /** personal only */
  driveFileId?: string;
  /** plc only */
  plcId?: string;
  plcName?: string;
  sharedByName?: string;
}

export interface SharedBankRow {
  plcId: string;
  plcName: string;
  entry: PlcQuestionBankEntry;
}

/** Own banks first, then teammates' shared ones; own shared banks appear once. */
export function mergeBankSources(
  own: QuestionBankMetadata[],
  shared: SharedBankRow[]
): BankSource[] {
  const ownGroupIds = new Set<string>();
  const sources: BankSource[] = own.map((meta) => {
    if (meta.sync) ownGroupIds.add(meta.sync.groupId);
    return stripUndefined({
      key: meta.sync?.groupId ?? meta.id,
      kind: 'personal' as const,
      bankId: meta.id,
      syncGroupId: meta.sync?.groupId,
      title: meta.title,
      questionCount: meta.questionCount,
      targetIds: meta.targetIds ?? [],
      targetCounts: meta.targetCounts ?? {},
      driveFileId: meta.driveFileId,
    });
  });
  const seenGroups = new Set<string>();
  for (const row of shared) {
    const { entry } = row;
    if (entry.deletedAt) continue;
    if (ownGroupIds.has(entry.syncGroupId)) continue;
    if (seenGroups.has(entry.syncGroupId)) continue;
    seenGroups.add(entry.syncGroupId);
    sources.push({
      key: entry.syncGroupId,
      kind: 'plc',
      bankId: entry.syncGroupId,
      syncGroupId: entry.syncGroupId,
      title: entry.title,
      questionCount: entry.questionCount,
      targetIds: entry.targetIds ?? [],
      targetCounts: {},
      plcId: row.plcId,
      plcName: row.plcName,
      sharedByName: entry.sharedByName,
    });
  }
  return sources;
}
