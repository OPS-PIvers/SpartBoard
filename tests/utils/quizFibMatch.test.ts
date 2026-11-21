import { describe, expect, it } from 'vitest';
import {
  fibLenientMatch,
  fibRelaxedEqual,
  relaxFibAnswer,
} from '@/utils/quizFibMatch';

describe('quizFibMatch on hostile input', () => {
  it('still drops end punctuation and an article', () => {
    expect(relaxFibAnswer('The Cell!?;. ', 'en')).toBe('cell');
    expect(fibRelaxedEqual('cell!!', 'Cell', 'en')).toBe(true);
    expect(fibLenientMatch('mitosys', 'mitosis', 'en')).toBe(true);
  });

  it('handles a huge run of end punctuation quickly', () => {
    const start = Date.now();
    expect(relaxFibAnswer('!'.repeat(500_000) + 'x', 'en')).toBe(
      '!'.repeat(500_000) + 'x'
    );
    expect(relaxFibAnswer('x' + '!'.repeat(500_000), 'en')).toBe('x');
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('rejects a far-off length without building the edit matrix', () => {
    const start = Date.now();
    expect(fibLenientMatch('a'.repeat(200_000), 'mitosis', 'en')).toBe(false);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
