import { describe, it, expect } from 'vitest';
import type { QuestionBankMetadata, QuizBankSlot } from '@/types';
import {
  reconcileBankSlotsForPlcShare,
  unsharedBanksMessage,
} from './questionBankShare';

const bank = (
  id: string,
  title: string,
  sync?: QuestionBankMetadata['sync']
): QuestionBankMetadata => ({
  id,
  title,
  driveFileId: `drive-${id}`,
  questionCount: 10,
  targetIds: [],
  targetCounts: {},
  createdAt: 1,
  updatedAt: 1,
  ...(sync ? { sync } : {}),
});

const slot = (overrides: Partial<QuizBankSlot> = {}): QuizBankSlot => ({
  id: 'slot-1',
  bankId: 'bank-a',
  bankTitle: 'Bank A',
  mode: 'random',
  count: 3,
  ...overrides,
});

describe('reconcileBankSlotsForPlcShare', () => {
  it('lists own banks not shared with the PLC and leaves slots untouched', () => {
    const result = reconcileBankSlotsForPlcShare(
      { bankSlots: [slot()] },
      [bank('bank-a', 'Bank A')],
      'plc-1'
    );
    expect(result.unsharedBankTitles).toEqual(['Bank A']);
    expect(result.changed).toBe(false);
    expect(result.bankSlots[0].syncGroupId).toBeUndefined();
  });

  it('reports a bank shared with a different PLC as unshared', () => {
    const result = reconcileBankSlotsForPlcShare(
      { bankSlots: [slot()] },
      [bank('bank-a', 'Bank A', { groupId: 'g1', plcIds: ['plc-2'] })],
      'plc-1'
    );
    expect(result.unsharedBankTitles).toEqual(['Bank A']);
  });

  it('stamps syncGroupId on slots whose bank is already shared', () => {
    const result = reconcileBankSlotsForPlcShare(
      { bankSlots: [slot()] },
      [bank('bank-a', 'Bank A', { groupId: 'g1', plcIds: ['plc-1'] })],
      'plc-1'
    );
    expect(result.unsharedBankTitles).toEqual([]);
    expect(result.changed).toBe(true);
    expect(result.bankSlots[0].syncGroupId).toBe('g1');
  });

  it('is a no-op when the slot already carries the group id', () => {
    const result = reconcileBankSlotsForPlcShare(
      { bankSlots: [slot({ syncGroupId: 'g1' })] },
      [bank('bank-a', 'Bank A', { groupId: 'g1', plcIds: ['plc-1'] })],
      'plc-1'
    );
    expect(result.changed).toBe(false);
  });

  it('accepts a teammate bank shared into the same PLC', () => {
    const result = reconcileBankSlotsForPlcShare(
      { bankSlots: [slot({ bankId: 'their-bank', syncGroupId: 'g9' })] },
      [],
      'plc-1',
      [{ syncGroupId: 'g9', plcId: 'plc-1' }]
    );
    expect(result.unsharedBankTitles).toEqual([]);
    expect(result.changed).toBe(false);
  });

  it('rejects a teammate bank only shared into another PLC', () => {
    const result = reconcileBankSlotsForPlcShare(
      { bankSlots: [slot({ bankId: 'their-bank', syncGroupId: 'g9' })] },
      [],
      'plc-1',
      [{ syncGroupId: 'g9', plcId: 'plc-2' }]
    );
    expect(result.unsharedBankTitles).toEqual(['Bank A']);
  });

  it('ignores selected-mode slots and dedupes titles', () => {
    const result = reconcileBankSlotsForPlcShare(
      {
        bankSlots: [
          slot({ id: 's1' }),
          slot({ id: 's2' }),
          slot({ id: 's3', mode: 'selected', questionIds: ['q1'] }),
        ],
      },
      [bank('bank-a', 'Bank A')],
      'plc-1'
    );
    expect(result.unsharedBankTitles).toEqual(['Bank A']);
    expect(result.bankSlots).toHaveLength(3);
  });
});

describe('unsharedBanksMessage', () => {
  it('pluralises and quotes titles', () => {
    expect(unsharedBanksMessage(['A'])).toBe(
      'Share the bank "A" with this PLC first (Banks tab → Share with PLC).'
    );
    expect(unsharedBanksMessage(['A', 'B'])).toContain('banks "A", "B"');
  });
});
