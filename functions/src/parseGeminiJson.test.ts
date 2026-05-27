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

  it('parses correctly when trailing explanation contains closing-brace characters', () => {
    // Regression: lastIndexOf('}') was used to find the slice end, so any `}`
    // in the trailing prose (JSON notation, template literals, CSS rules, etc.)
    // caused the slice to extend past the JSON boundary, producing a string
    // that JSON.parse rejects even though the embedded JSON is valid.
    const raw =
      '{"foo":"bar","items":[1,2]}\n\nNote: use {curly braces} in JSON objects.';
    expect(parseGeminiJson<Sample>(raw)).toEqual({ foo: 'bar', items: [1, 2] });
  });

  // ---------------------------------------------------------------------------
  // Top-level JSON array support
  // ---------------------------------------------------------------------------

  it('parses a plain top-level array of objects', () => {
    // Regression: the brace-only scanner entered the array at the first `{`
    // (index 1) and exited at depth 0 on the *first* object's closing `}`,
    // silently discarding every subsequent element and returning only the
    // first object instead of the full array.
    const raw = '[{"foo":"first","items":[1]},{"foo":"second","items":[2]}]';
    const result = parseGeminiJson<Sample[]>(raw);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ foo: 'first', items: [1] });
    expect(result[1]).toEqual({ foo: 'second', items: [2] });
  });

  it('trims trailing prose after a top-level array', () => {
    const raw =
      '[{"foo":"a","items":[]},{"foo":"b","items":[]}]\n\nHere is my explanation.';
    const result = parseGeminiJson<Sample[]>(raw);
    expect(result).toHaveLength(2);
    expect(result[0].foo).toBe('a');
    expect(result[1].foo).toBe('b');
  });

  it('parses a fenced top-level array', () => {
    const raw =
      '```json\n[{"foo":"x","items":[7]},{"foo":"y","items":[8]}]\n```';
    const result = parseGeminiJson<Sample[]>(raw);
    expect(result).toHaveLength(2);
    expect(result[0].foo).toBe('x');
    expect(result[1].foo).toBe('y');
  });

  it('handles top-level array where trailing prose contains `]` characters', () => {
    // Guards against a symmetric version of the trailing-`}` regression:
    // a naive lastIndexOf(']') would extend the slice into prose that
    // contains `]` (e.g., Markdown list items, code snippets).
    const raw = '[{"foo":"a","items":[1,2]}]\n\nSee the [docs] for more info.';
    const result = parseGeminiJson<Sample[]>(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ foo: 'a', items: [1, 2] });
  });

  it('prefers the outermost array when the array appears before the first object', () => {
    // The outer `[` at index 0 must win over the inner `{` at index 1.
    const raw = '[{"foo":"only","items":[]}]';
    const result = parseGeminiJson<Sample[]>(raw);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].foo).toBe('only');
  });

  it('still prefers an object when the `{` appears before any `[`', () => {
    // A plain object response must not be treated as an array even though
    // arrays are now supported.
    const raw = '{"foo":"obj","items":[1,2,3]}';
    expect(parseGeminiJson<Sample>(raw)).toEqual({
      foo: 'obj',
      items: [1, 2, 3],
    });
  });
});
