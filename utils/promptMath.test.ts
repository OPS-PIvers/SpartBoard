import { describe, expect, it } from 'vitest';
import {
  hasPromptMath,
  plainPromptText,
  splitPromptMath,
  wrapPromptMath,
} from './promptMath';

describe('promptMath', () => {
  it('splits text and equations in order', () => {
    expect(splitPromptMath('Solve ⟦(x+1)/2=3⟧ for x.')).toEqual([
      { kind: 'text', text: 'Solve ' },
      { kind: 'math', math: '(x+1)/2=3', start: 6, end: 17 },
      { kind: 'text', text: ' for x.' },
    ]);
  });

  it('leaves text without equations alone', () => {
    expect(splitPromptMath('Plain text')).toEqual([
      { kind: 'text', text: 'Plain text' },
    ]);
    expect(hasPromptMath('Plain ⟦ text')).toBe(false);
    expect(hasPromptMath('x is ⟦x^2⟧')).toBe(true);
  });

  it('gives plain text for lists and exports', () => {
    expect(plainPromptText('Find ⟦sqrt(x)⟧ and ⟦pi⟧.')).toBe(
      'Find sqrt(x) and pi.'
    );
  });

  it('never nests markers', () => {
    expect(wrapPromptMath('a⟧b')).toBe('⟦ab⟧');
  });
});
