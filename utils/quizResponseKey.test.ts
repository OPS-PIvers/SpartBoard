import { describe, it, expect } from 'vitest';
import { encodeResponseKeySegment, quizPinKeySegment } from './quizResponseKey';

describe('quizPinKeySegment', () => {
  it('gives padded and unpadded forms of one PIN the same seat', () => {
    for (const pin of ['4821', '04821', '004821']) {
      expect(quizPinKeySegment(pin)).toBe('4821');
    }
  });

  it('keeps two-digit roster PINs as they are', () => {
    expect(quizPinKeySegment('05')).toBe('05');
    expect(quizPinKeySegment('5')).toBe('05');
    expect(quizPinKeySegment('005')).toBe('05');
    expect(quizPinKeySegment('10')).toBe('10');
    expect(quizPinKeySegment('0')).toBe('00');
  });

  it('leaves non-numeric PINs on the shared encoding', () => {
    expect(quizPinKeySegment('Ab-12')).toBe(encodeResponseKeySegment('Ab-12'));
    expect(quizPinKeySegment('')).toBe('default');
  });
});
