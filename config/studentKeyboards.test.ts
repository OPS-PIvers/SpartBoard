import { describe, expect, it } from 'vitest';
import {
  accentSetForLanguage,
  answerAccents,
  isAnswerKeyboard,
  shiftedKey,
} from './studentKeyboards';

describe('studentKeyboards', () => {
  it('matches accent sets by primary language subtag', () => {
    expect(accentSetForLanguage('es-MX')).toBe('es');
    expect(accentSetForLanguage('FR')).toBe('fr');
    expect(accentSetForLanguage('en-US')).toBeUndefined();
    expect(accentSetForLanguage('')).toBeUndefined();
  });

  it('upper-cases letters but leaves ß and punctuation', () => {
    expect(shiftedKey('é')).toBe('É');
    expect(shiftedKey('ñ')).toBe('Ñ');
    expect(shiftedKey('ß')).toBe('ß');
    expect(shiftedKey('¿')).toBe('¿');
  });

  it('recognises saved answer keyboards', () => {
    expect(isAnswerKeyboard('math')).toBe(true);
    expect(isAnswerKeyboard('fr')).toBe(true);
    expect(isAnswerKeyboard('xx')).toBe(false);
    expect(isAnswerKeyboard(undefined)).toBe(false);
    expect(answerAccents('math')).toBeUndefined();
    expect(answerAccents('de')).toBe('de');
  });
});
