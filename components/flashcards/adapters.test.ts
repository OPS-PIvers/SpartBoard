import { beforeEach, describe, expect, it } from 'vitest';
import { LocalFlashcardAdapter, MemoryFlashcardAdapter } from './adapters';

describe('flashcard progress adapters', () => {
  beforeEach(() => localStorage.clear());

  it('persists public progress under the share-specific key', () => {
    const adapter = new LocalFlashcardAdapter('share-one');
    adapter.record('card-a', true, 1);
    adapter.star('card-a');

    const reloaded = new LocalFlashcardAdapter('share-one').load();
    expect(reloaded.cards['card-a']).toMatchObject({ s: 1, due: 2, c: 1 });
    expect(reloaded.starred).toEqual(['card-a']);
  });

  it('falls back from corrupt local storage and can reset progress', () => {
    localStorage.setItem('spart.flashcards.v1.bad', '{not json');
    const adapter = new LocalFlashcardAdapter('bad');
    expect(adapter.load()).toEqual({ cards: {}, starred: [], round: 1 });
    adapter.record('card-a', false, 1);
    expect(adapter.reset()).toEqual({ cards: {}, starred: [], round: 1 });
  });

  it('keeps present-mode marks in memory and hides mark controls', () => {
    const adapter = new MemoryFlashcardAdapter();
    expect(adapter.showsMarks).toBe(false);
    expect(adapter.record('card-a', true, 1).cards['card-a']?.s).toBe(1);
  });
});
