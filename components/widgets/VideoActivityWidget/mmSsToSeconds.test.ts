import { describe, it, expect } from 'vitest';
import { mmSsToSeconds as editorParse } from './components/useVideoActivityEditorState';
import { mmSsToSeconds as importParse } from './adapters/videoActivityImportAdapter';

describe.each([
  ['editor', editorParse],
  ['import', importParse],
])('mmSsToSeconds (%s)', (_name, parse) => {
  it('parses valid MM:SS', () => {
    expect(parse('01:30')).toBe(90);
    expect(parse('0:5')).toBe(5);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parse(' 1:30 ')).toBe(90);
    expect(parse('1: 30')).toBe(90);
    expect(parse('1 : 30')).toBe(90);
  });

  it('rejects negative parts instead of producing a shifted time', () => {
    expect(parse('1:-30')).toBeNaN();
    expect(parse('-1:30')).toBeNaN();
  });

  it('rejects trailing junk and decimals', () => {
    expect(parse('12abc:30')).toBeNaN();
    expect(parse('1.5:30')).toBeNaN();
    expect(parse('1:30s')).toBeNaN();
  });
});
