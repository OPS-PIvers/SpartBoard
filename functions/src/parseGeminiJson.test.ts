import { describe, it, expect } from 'vitest';
import { parseGeminiJson } from './parseGeminiJson';

interface Sample {
  foo: string;
  items: number[];
}

describe('parseGeminiJson', () => {
  it('parses plain JSON', () => {
    const raw = '{"foo":"bar","items":[1,2,3]}';
    expect(parseGeminiJson<Sample>(raw)).toEqual({
      foo: 'bar',
      items: [1, 2, 3],
    });
  });

  it('strips ```json fenced blocks', () => {
    const raw = '```json\n{"foo":"bar","items":[1]}\n```';
    expect(parseGeminiJson<Sample>(raw)).toEqual({ foo: 'bar', items: [1] });
  });

  it('strips bare ``` fences', () => {
    const raw = '```\n{"foo":"bar","items":[]}\n```';
    expect(parseGeminiJson<Sample>(raw)).toEqual({ foo: 'bar', items: [] });
  });

  it('trims trailing markdown/explanation after the JSON object', () => {
    const raw =
      '{"foo":"bar","items":[1,2]}\n\nHere is an explanation of my choices…';
    expect(parseGeminiJson<Sample>(raw)).toEqual({ foo: 'bar', items: [1, 2] });
  });

  it('handles leading prose before the JSON object', () => {
    const raw =
      'Sure! Here is the JSON you requested:\n{"foo":"x","items":[9]}';
    expect(parseGeminiJson<Sample>(raw)).toEqual({ foo: 'x', items: [9] });
  });

  it('throws on empty input', () => {
    expect(() => parseGeminiJson('')).toThrow(/empty/i);
    expect(() => parseGeminiJson('   \n  ')).toThrow(/empty/i);
  });

  it('throws on genuinely malformed JSON', () => {
    expect(() => parseGeminiJson('{not json at all}')).toThrow();
  });
});
