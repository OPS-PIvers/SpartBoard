import { describe, expect, it } from 'vitest';
import { plainStepText, spokenStepText } from './stepText';

describe('stepText', () => {
  it('drops bold and link markup but keeps their words', () => {
    expect(
      plainStepText('Press **Save**, then read [the guide](https://x.org/a).')
    ).toBe('Press Save, then read the guide.');
    expect(plainStepText(undefined)).toBe('');
  });

  it('joins label and text, skipping an empty part', () => {
    expect(spokenStepText({ label: 'Save', text: 'Press it' })).toBe(
      'Save. Press it'
    );
    expect(spokenStepText({ text: 'Only text' })).toBe('Only text');
    expect(spokenStepText({ label: 'Only label' })).toBe('Only label');
  });
});
