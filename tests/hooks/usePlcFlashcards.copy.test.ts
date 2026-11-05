import { describe, expect, it, vi } from 'vitest';
import { toPersonalFlashcardSet } from '@/hooks/usePlcFlashcards';
import type { PlcFlashcardSetEntry } from '@/types';

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

describe('toPersonalFlashcardSet', () => {
  it('keeps the PLC set id so teammates’ checks pool together', () => {
    const entry: PlcFlashcardSetEntry = {
      id: 'plc-set-1',
      title: 'Unit 4 vocab',
      termLanguage: 'es-ES',
      definitionLanguage: 'en-US',
      cards: [{ id: 'c1', term: 'perro', definition: 'dog' }],
      sharedBy: 'tA',
      sharedByEmail: 'a@x',
      sharedByName: 'Ada',
      sharedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    };
    const copy = toPersonalFlashcardSet(entry);
    expect(copy.id).not.toBe('plc-set-1');
    expect(copy.plcOriginSetId).toBe('plc-set-1');
    expect(copy.cards[0].id).toBe('c1');
  });
});
