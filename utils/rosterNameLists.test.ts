import { describe, expect, it } from 'vitest';
import {
  combineRosterNames,
  splitNameLine,
  splitPastedNames,
} from './rosterNameLists';

describe('splitNameLine', () => {
  it('splits a plain first/last pair', () => {
    expect(splitNameLine('Ada Lovelace')).toEqual({
      first: 'Ada',
      last: 'Lovelace',
    });
  });

  it('keeps a lone name as a first name', () => {
    expect(splitNameLine('Ada')).toEqual({ first: 'Ada', last: '' });
  });

  it('treats a middle name as part of the first name', () => {
    expect(splitNameLine('Mary Anne Evans')).toEqual({
      first: 'Mary Anne',
      last: 'Evans',
    });
  });

  it('keeps a suffix with the last name', () => {
    expect(splitNameLine('Martin Luther King Jr.')).toEqual({
      first: 'Martin Luther',
      last: 'King Jr.',
    });
  });

  it('reverses "Last, First"', () => {
    expect(splitNameLine('Lovelace, Ada')).toEqual({
      first: 'Ada',
      last: 'Lovelace',
    });
  });

  it('reads a comma with no space as a separator', () => {
    expect(splitNameLine('Ada,Lovelace')).toEqual({
      first: 'Ada',
      last: 'Lovelace',
    });
  });

  it('splits a tab-separated spreadsheet row', () => {
    expect(splitNameLine('Ada\tLovelace')).toEqual({
      first: 'Ada',
      last: 'Lovelace',
    });
  });

  it('returns empties for a blank line', () => {
    expect(splitNameLine('   ')).toEqual({ first: '', last: '' });
  });
});

describe('combineRosterNames', () => {
  it('pairs the two boxes line by line', () => {
    expect(combineRosterNames('Ada\nGrace', 'Lovelace\nHopper')).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
    ]);
  });

  it('does not pull later last names up past a student with none', () => {
    expect(combineRosterNames('Ada\nGrace\nAlan', '\nHopper\nTuring')).toEqual([
      'Ada',
      'Grace Hopper',
      'Alan Turing',
    ]);
  });

  it('skips rows that are blank on both sides', () => {
    expect(combineRosterNames('Ada\n\nGrace', 'Lovelace\n\nHopper')).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
    ]);
  });

  it('keeps a last name with no matching first name', () => {
    expect(combineRosterNames('', 'Hopper')).toEqual(['Hopper']);
  });
});

const paste = (over: Partial<Parameters<typeof splitPastedNames>[0]>) =>
  splitPastedNames({
    pasted: '',
    value: '',
    lastNames: '',
    selectionStart: 0,
    selectionEnd: 0,
    ...over,
  });

describe('splitPastedNames', () => {
  it('splits full names pasted into an empty box', () => {
    expect(paste({ pasted: 'Ada Lovelace\nGrace Hopper' })).toEqual({
      firstNames: 'Ada\nGrace',
      lastNames: 'Lovelace\nHopper',
    });
  });

  it('leaves a paste of first names alone', () => {
    expect(paste({ pasted: 'Ada\nGrace' })).toBeNull();
  });

  it('leaves one row blank when a pasted name has no last name', () => {
    expect(paste({ pasted: 'Ada Lovelace\nPrince\nGrace Hopper' })).toEqual({
      firstNames: 'Ada\nPrince\nGrace',
      lastNames: 'Lovelace\n\nHopper',
    });
  });

  it('normalizes windows line endings', () => {
    expect(paste({ pasted: 'Ada Lovelace\r\nGrace Hopper' })).toEqual({
      firstNames: 'Ada\nGrace',
      lastNames: 'Lovelace\nHopper',
    });
  });

  it('appends to an existing list without disturbing it', () => {
    expect(
      paste({
        pasted: '\nGrace Hopper',
        value: 'Ada',
        lastNames: 'Lovelace',
        selectionStart: 3,
        selectionEnd: 3,
      })
    ).toEqual({
      firstNames: 'Ada\nGrace',
      lastNames: 'Lovelace\nHopper',
    });
  });

  it('keeps earlier last names when pasting at the end of a longer list', () => {
    expect(
      paste({
        pasted: '\nAlan Turing',
        value: 'Ada\nGrace',
        lastNames: 'Lovelace\nHopper',
        selectionStart: 9,
        selectionEnd: 9,
      })
    ).toEqual({
      firstNames: 'Ada\nGrace\nAlan',
      lastNames: 'Lovelace\nHopper\nTuring',
    });
  });

  it('keeps later last names aligned when pasting mid-list', () => {
    expect(
      paste({
        pasted: 'Alan Turing\n',
        value: 'Ada\nGrace',
        lastNames: 'Lovelace\nHopper',
        selectionStart: 0,
        selectionEnd: 0,
      })
    ).toEqual({
      firstNames: 'Alan\nAda\nGrace',
      lastNames: 'Turing\nLovelace\nHopper',
    });
  });

  it('replaces the whole list when the box is selected', () => {
    expect(
      paste({
        pasted: 'Alan Turing',
        value: 'Ada\nGrace',
        lastNames: 'Lovelace\nHopper',
        selectionStart: 0,
        selectionEnd: 9,
      })
    ).toEqual({ firstNames: 'Alan', lastNames: 'Turing' });
  });
});
