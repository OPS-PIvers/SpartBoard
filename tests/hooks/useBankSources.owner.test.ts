/** A shared-bank slot only resolves from a synced doc its recorded sharer owns. */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { getDoc } from 'firebase/firestore';
import {
  expectedSlotOwner,
  loadBankContentsFor,
  loadSyncedBankContent,
  pinPlcBankSlots,
} from '@/hooks/useBankSources';
import { withCurrentAnswerKeys } from '@/utils/quizAssignBankDraw';
import {
  BankSlotResolutionError,
  resolveQuizAssignment,
} from '@/utils/questionBanks';
import type { QuestionBankData, QuizBankSlot, QuizData } from '@/types';

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

const syncedDoc = (ownerUid: string, over: Record<string, unknown> = {}) => ({
  exists: () => true,
  data: () => ({
    id: 'g1',
    ownerUid,
    title: 'Shared',
    questions: [{ id: 'q1' }],
    ...over,
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

  it('refuses a legacy unpinned slot naming a re-created group id', async () => {
    (getDoc as Mock).mockResolvedValue(syncedDoc('attacker'));
    expect(expectedSlotOwner(slot(), [], 'me')).toBeNull();
    const out = await loadBankContentsFor(
      { bankSlots: [slot()] },
      [],
      noDrive,
      'me'
    );
    expect(out.has('g1')).toBe(false);
  });

  it('a quiz with that slot refuses to assign with the fix-it message', async () => {
    (getDoc as Mock).mockResolvedValue(syncedDoc('attacker'));
    const quiz = { questions: [], bankSlots: [slot()] };
    const banks = await loadBankContentsFor(quiz, [], noDrive, 'me');
    expect(() => resolveQuizAssignment(quiz, banks)).toThrow(
      BankSlotResolutionError
    );
    expect(() => resolveQuizAssignment(quiz, banks)).toThrow(
      'could not be loaded. Re-add the slot'
    );
  });

  it('does not overlay a re-created bank answer key at publish', async () => {
    (getDoc as Mock).mockResolvedValue(
      syncedDoc('attacker', {
        questions: [
          {
            id: 'q1',
            type: 'MC',
            text: 'x',
            correctAnswer: 'B',
            incorrectAnswers: ['A'],
          },
        ],
      })
    );
    const frozen = {
      id: 'z',
      title: 'Quiz',
      questions: [
        {
          id: 'q1',
          type: 'MC',
          text: 'x',
          correctAnswer: 'A',
          incorrectAnswers: ['B'],
        },
      ],
    } as unknown as QuizData;
    const library = {
      ...frozen,
      questions: [],
      bankSlots: [slot()],
    } as unknown as QuizData;
    const out = await withCurrentAnswerKeys(frozen, 'lib', {
      loadQuizData: () => Promise.resolve(library),
      loadBankContentsForQuiz: (q) => loadBankContentsFor(q, [], noDrive, 'me'),
    });
    expect(out.questions[0].correctAnswer).toBe('A');
  });

  it('loads an unpinned district slot only from its district canonical', async () => {
    const district = slot({ districtItemId: 'item-1' });
    (getDoc as Mock).mockResolvedValue(
      syncedDoc('admin', { districtItemId: 'item-1' })
    );
    let out = await loadBankContentsFor(
      { bankSlots: [district] },
      [],
      noDrive,
      'me'
    );
    expect(out.has('g1')).toBe(true);
    (getDoc as Mock).mockResolvedValue(syncedDoc('attacker'));
    out = await loadBankContentsFor(
      { bankSlots: [district] },
      [],
      noDrive,
      'me'
    );
    expect(out.has('g1')).toBe(false);
  });

  it('loads a legacy slot when its owner is a teammate in a PLC the bank is shared to', async () => {
    const plcs = [{ id: 'plc-1', memberUids: ['me', 'sharer'] }];
    (getDoc as Mock).mockResolvedValue(
      syncedDoc('sharer', { plcIds: ['plc-1'] })
    );
    let out = await loadBankContentsFor(
      { bankSlots: [slot()] },
      [],
      noDrive,
      'me',
      plcs
    );
    expect(out.has('g1')).toBe(true);
    (getDoc as Mock).mockResolvedValue(
      syncedDoc('attacker', { plcIds: ['plc-1'] })
    );
    out = await loadBankContentsFor(
      { bankSlots: [slot()] },
      [],
      noDrive,
      'me',
      plcs
    );
    expect(out.has('g1')).toBe(false);
  });

  it('pins an imported slot only to a PLC member sharing with that PLC', async () => {
    (getDoc as Mock).mockResolvedValue(
      syncedDoc('sharer', { plcIds: ['plc-1'] })
    );
    const [pinned] = await pinPlcBankSlots([slot()], {
      id: 'plc-1',
      memberUids: ['sharer'],
    });
    expect(pinned.syncOwnerUid).toBe('sharer');
    (getDoc as Mock).mockResolvedValue(
      syncedDoc('attacker', { plcIds: ['plc-1'] })
    );
    const [kept] = await pinPlcBankSlots([slot()], {
      id: 'plc-1',
      memberUids: ['sharer'],
    });
    expect(kept.syncOwnerUid).toBeUndefined();
    (getDoc as Mock).mockResolvedValue(syncedDoc('sharer', { plcIds: [] }));
    const [other] = await pinPlcBankSlots([slot()], {
      id: 'plc-1',
      memberUids: ['sharer'],
    });
    expect(other.syncOwnerUid).toBeUndefined();
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
