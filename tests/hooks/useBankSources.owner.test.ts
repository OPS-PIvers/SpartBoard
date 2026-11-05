/** A shared-bank slot only resolves from a synced doc its recorded sharer owns. */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { getDoc } from 'firebase/firestore';
import {
  expectedSlotOwner,
  loadBankContentsFor,
  loadSyncedBankContent,
} from '@/hooks/useBankSources';
import type { QuestionBankData, QuizBankSlot } from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('@/hooks/usePlcs', () => ({ usePlcs: vi.fn() }));
vi.mock('@/hooks/useQuestionBanks', () => ({
  useQuestionBanks: vi.fn(),
  BANKS_COLLECTION: 'question_banks',
  SYNCED_BANKS_COLLECTION: 'synced_question_banks',
}));

const syncedDoc = (ownerUid: string) => ({
  exists: () => true,
  data: () => ({
    id: 'g1',
    ownerUid,
    title: 'Shared',
    questions: [{ id: 'q1' }],
  }),
});

const slot = (over: Partial<QuizBankSlot> = {}): QuizBankSlot => ({
  id: 's1',
  bankId: 'b1',
  syncGroupId: 'g1',
  bankTitle: 'Shared',
  mode: 'random',
  count: 1,
  ...over,
});

const noDrive = vi.fn<(id: string) => Promise<QuestionBankData>>();

describe('shared bank slot owner binding', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads a doc owned by the recorded sharer', async () => {
    (getDoc as Mock).mockResolvedValue(syncedDoc('sharer'));
    const out = await loadBankContentsFor(
      { bankSlots: [slot({ syncOwnerUid: 'sharer' })] },
      [],
      noDrive,
      'me'
    );
    expect(out.get('g1')?.questions).toHaveLength(1);
  });

  it('refuses a doc re-created by someone else', async () => {
    (getDoc as Mock).mockResolvedValue(syncedDoc('attacker'));
    const out = await loadBankContentsFor(
      { bankSlots: [slot({ syncOwnerUid: 'sharer' })] },
      [],
      noDrive,
      'me'
    );
    expect(out.has('g1')).toBe(false);
  });

  it('binds a slot on the user own synced bank to that user', async () => {
    const banks = [{ id: 'b1', driveFileId: 'd1' }];
    expect(expectedSlotOwner(slot(), banks, 'me')).toBe('me');
    (getDoc as Mock).mockResolvedValue(syncedDoc('attacker'));
    const out = await loadBankContentsFor(
      { bankSlots: [slot()] },
      banks,
      noDrive,
      'me'
    );
    expect(out.has('g1')).toBe(false);
  });

  it('keeps loading a slot saved before the sharer was recorded', async () => {
    (getDoc as Mock).mockResolvedValue(syncedDoc('sharer'));
    expect(expectedSlotOwner(slot(), [], 'me')).toBeUndefined();
    const out = await loadBankContentsFor(
      { bankSlots: [slot()] },
      [],
      noDrive,
      'me'
    );
    expect(out.has('g1')).toBe(true);
  });

  it('keeps the pin on an own bank that was unshared since', () => {
    const banks = [{ id: 'b1', driveFileId: 'd1', sync: undefined }];
    expect(expectedSlotOwner(slot(), banks, 'me')).toBe('me');
    expect(expectedSlotOwner(slot({ bankId: 'theirs' }), banks, 'me')).toBe(
      undefined
    );
    expect(
      expectedSlotOwner(slot({ syncOwnerUid: 'sharer' }), banks, 'me')
    ).toBe('sharer');
  });

  it('reads the owner from the synced doc itself', async () => {
    (getDoc as Mock).mockResolvedValue(syncedDoc('sharer'));
    await expect(loadSyncedBankContent('g1')).resolves.toMatchObject({
      syncOwnerUid: 'sharer',
    });
  });

  it('loadSyncedBankContent checks the expected owner', async () => {
    (getDoc as Mock).mockResolvedValue(syncedDoc('attacker'));
    await expect(loadSyncedBankContent('g1', 'sharer')).rejects.toThrow(
      'no longer available'
    );
    await expect(loadSyncedBankContent('g1')).resolves.toMatchObject({
      id: 'g1',
    });
  });
});
