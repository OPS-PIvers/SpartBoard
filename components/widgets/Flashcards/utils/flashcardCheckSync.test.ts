import { describe, expect, it } from 'vitest';
import type { FlashcardCard } from '@/types';
import { fixedCheckCards } from './flashcardCheckSync';

const speak = (word: string): NonNullable<FlashcardCard['speak']> =>
  ({ refs: [{ dialect: 'es-ES', word }] }) as unknown as NonNullable<
    FlashcardCard['speak']
  >;

const card = (id: string, term: string, definition = `${term} def`) => ({
  id,
  term,
  definition,
});

describe('fixedCheckCards', () => {
  it('applies a fixed definition and keeps the check order', () => {
    const check = [card('b', 'perro'), card('a', 'gato')];
    const set = [card('a', 'gato', 'cat'), card('b', 'perro')];
    expect(fixedCheckCards(check, set, false)).toEqual([
      card('b', 'perro'),
      card('a', 'gato', 'cat'),
    ]);
  });

  it('returns null when nothing in the check changed', () => {
    const check = [card('a', 'gato')];
    expect(fixedCheckCards(check, [...check, card('c', 'new')], false)).toBe(
      null
    );
  });

  it('never adds new cards or drops deleted ones', () => {
    const check = [card('a', 'gato'), card('b', 'perro')];
    const set = [card('a', 'gata'), card('c', 'pez')];
    expect(fixedCheckCards(check, set, false)).toEqual([
      card('a', 'gata'),
      card('b', 'perro'),
    ]);
  });

  it('strips readings when the check has no Speak stamp', () => {
    const check = [card('a', 'gato')];
    const set = [{ ...card('a', 'gato', 'cat'), speak: speak('gato') }];
    expect(fixedCheckCards(check, set, false)).toEqual([
      card('a', 'gato', 'cat'),
    ]);
  });

  it('carries new readings into a Speak check', () => {
    const check = [{ ...card('a', 'gata'), speak: speak('gata') }];
    const set = [{ ...card('a', 'gato'), speak: speak('gato') }];
    expect(fixedCheckCards(check, set, true)).toEqual(set);
  });

  it('keeps a Speak card until readings for a changed term arrive', () => {
    const check = [{ ...card('a', 'gata'), speak: speak('gata') }];
    expect(fixedCheckCards(check, [card('a', 'gato')], true)).toBe(null);
  });

  it('keeps old readings when only the definition changed', () => {
    const check = [{ ...card('a', 'gato'), speak: speak('gato') }];
    expect(fixedCheckCards(check, [card('a', 'gato', 'cat')], true)).toEqual([
      { ...card('a', 'gato', 'cat'), speak: speak('gato') },
    ]);
  });
});
