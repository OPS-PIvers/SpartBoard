import { describe, expect, it } from 'vitest';
import { FIB_BLANK_SEP } from './quizFibBlanks';
import {
  fillWordBankChoice,
  parseWordBank,
  wordBankColumns,
} from './quizWordBank';

describe('parseWordBank', () => {
  it('keeps each line whole, splits groups on blank lines and drops repeats', () => {
    expect(
      parseWordBank(
        'Actor-Observer Bias\n  Belief Perseverance \n\n\nEthnocentrism\r\nActor-Observer Bias\n'
      )
    ).toEqual([
      ['Actor-Observer Bias', 'Belief Perseverance'],
      ['Ethnocentrism'],
    ]);
  });

  it('is empty for missing or blank text', () => {
    expect(parseWordBank(undefined)).toEqual([]);
    expect(parseWordBank('\n  \n')).toEqual([]);
  });
});

describe('wordBankColumns', () => {
  it('defaults to one column', () => {
    expect(wordBankColumns(undefined)).toBe(1);
    expect(wordBankColumns(4)).toBe(1);
    expect(wordBankColumns(3)).toBe(3);
  });
});

describe('fillWordBankChoice', () => {
  it('replaces a single blank', () => {
    expect(fillWordBankChoice('setin', 'Setting', 1, null)).toBe('Setting');
  });

  it('fills the blank the student was last in', () => {
    const value = ['a', 'b', 'c'].join(FIB_BLANK_SEP);
    expect(fillWordBankChoice(value, 'X', 3, 1)).toBe(
      ['a', 'X', 'c'].join(FIB_BLANK_SEP)
    );
  });

  it('otherwise fills the first empty blank, then the first', () => {
    expect(fillWordBankChoice(`a${FIB_BLANK_SEP}`, 'X', 3, null)).toBe(
      ['a', 'X', ''].join(FIB_BLANK_SEP)
    );
    const full = ['a', 'b'].join(FIB_BLANK_SEP);
    expect(fillWordBankChoice(full, 'X', 2, null)).toBe(
      ['X', 'b'].join(FIB_BLANK_SEP)
    );
  });
});
