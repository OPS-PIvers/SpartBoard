import { describe, expect, it } from 'vitest';
import {
  WRITING_LOG_MAX,
  WritingLogWriter,
  buildCheckpoints,
  diffText,
  parseWritingLog,
  summarizeWriting,
  textAfter,
  textAt,
} from './writingLog';

const type = (w: WritingLogWriter, steps: string[], gap = 100) => {
  let prev = '';
  steps.forEach((next, i) => {
    w.write(prev, next, i * gap, 'typed', 1e6);
    prev = next;
  });
};

describe('diffText', () => {
  it('finds the one splice between two texts', () => {
    expect(diffText('hello world', 'hello brave world')).toEqual({
      pos: 6,
      del: 0,
      ins: 'brave ',
    });
    expect(diffText('abc', 'ac')).toEqual({ pos: 1, del: 1, ins: '' });
    expect(diffText('same', 'same')).toBeNull();
  });

  it('never splits an emoji', () => {
    const d = diffText('a😀', 'a😁');
    expect(d).toEqual({ pos: 1, del: 2, ins: '😁' });
  });
});

describe('WritingLogWriter', () => {
  it('round-trips typing, a deletion and special characters', () => {
    const w = new WritingLogWriter(undefined);
    type(w, ['T', 'Th', 'The', 'Th', 'Thi', 'Thi;', 'Thi;,%!:', 'A Thi;,%!:']);
    const { edits, cutOff } = parseWritingLog(w.value);
    expect(cutOff).toBe(false);
    expect(textAfter(edits, edits.length)).toBe('A Thi;,%!:');
    expect(textAfter(edits, 3)).toBe('The');
    const s = summarizeWriting(edits);
    expect(s.deletions).toBe(1);
    expect(s.deletedChars).toBe(1);
    expect(s.insertsInside).toBe(1);
    expect(s.writingMs).toBe(700);
  });

  it('marks pasted text and text that changed with no edit event', () => {
    const w = new WritingLogWriter(undefined);
    w.write('', 'a', 0, 'typed', 1e6);
    w.write('a restored draft', 'a restored draft!', 50, 'typed', 1e6);
    w.write('a restored draft!', 'a restored draft! pasted', 90, 'pasted', 1e6);
    const { edits } = parseWritingLog(w.value);
    expect(edits.map((e) => e.kind)).toEqual([
      'typed',
      'sync',
      'typed',
      'pasted',
    ]);
    const s = summarizeWriting(edits);
    expect(s.syncChars).toBe(15);
    expect(s.pastedChars).toBe(7);
    expect(s.finalText).toBe('a restored draft! pasted');
  });

  it('continues a log saved by an earlier page load', () => {
    const first = new WritingLogWriter(undefined);
    type(first, ['o', 'on', 'one']);
    const second = new WritingLogWriter(first.value);
    second.write('one', 'one two', 5, 'typed', 1e6);
    const { edits } = parseWritingLog(second.value);
    expect(edits).toHaveLength(4);
    expect(edits.every((e) => e.kind === 'typed')).toBe(true);
    expect(textAfter(edits, 4)).toBe('one two');
  });

  it('holds an essay and jumps to any point in it', () => {
    const w = new WritingLogWriter(undefined);
    let text = '';
    for (let i = 0; i < 6000; i += 1) {
      const next = `${text}${i % 6 === 5 ? ' ' : 'x'}`;
      w.write(text, next, i * 10, 'typed', 1e6);
      text = next;
    }
    const parsed = parseWritingLog(w.value);
    expect(parsed.cutOff).toBe(false);
    expect(parsed.edits).toHaveLength(6000);
    expect(w.value.length / 6000).toBeLessThan(5);
    const marks = buildCheckpoints(parsed.edits);
    expect(textAt(parsed.edits, marks, 6000)).toBe(text);
    expect(textAt(parsed.edits, marks, 1234)).toBe(text.slice(0, 1234));
  });

  it('stops when the shared budget runs out', () => {
    const w = new WritingLogWriter(undefined);
    w.write('', 'a', 0, 'typed', 0);
    expect(w.write('a', 'ab', 10, 'typed', 0)).toBe(0);
    expect(parseWritingLog(w.value).cutOff).toBe(true);
  });
});

describe('parseWritingLog', () => {
  it('skips malformed tokens and clamps positions', () => {
    const { edits } = parseWritingLog('0,,,hi;junk;1,zz,9,!;%%%;2,,,ok');
    expect(textAfter(edits, edits.length)).toBe('hi!ok');
    expect(parseWritingLog(42).edits).toEqual([]);
    expect(parseWritingLog('x'.repeat(WRITING_LOG_MAX + 100)).edits).toEqual(
      []
    );
  });
});
