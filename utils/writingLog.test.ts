import { describe, expect, it } from 'vitest';
import {
  WRITING_LOG_MAX,
  WritingLogWriter,
  buildCheckpoints,
  diffText,
  SESSION_GAP_MS,
  parseWritingLog,
  replacedWords,
  summarizeWriting,
  writingSessions,
  textAfter,
  textAt,
  utf8Length,
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
    expect(s.wordsReplaced).toBe(0);
    expect(s.writingMs).toBe(700);
  });

  it('marks pasted text and text that changed with no edit event', () => {
    const w = new WritingLogWriter(undefined);
    w.write('', 'a', 0, 'typed', 1e6);
    w.write('a set by a tool', 'a set by a tool!', 50, 'typed', 1e6);
    w.write('a set by a tool!', 'a set by a tool! pasted', 90, 'pasted', 1e6);
    const { edits } = parseWritingLog(w.value);
    expect(edits.map((e) => e.kind)).toEqual([
      'typed',
      'sync',
      'typed',
      'pasted',
    ]);
    const s = summarizeWriting(edits);
    expect(s.syncChars).toBe(14);
    expect(s.pastedChars).toBe(7);
    expect(s.finalText).toBe('a set by a tool! pasted');
  });

  it('continues a log saved by an earlier page load', () => {
    const first = new WritingLogWriter(undefined);
    type(first, ['o', 'on', 'one']);
    const second = new WritingLogWriter(first.value);
    second.write('one', 'one two', 5, 'typed', 1e6);
    const lost = new WritingLogWriter(first.value);
    lost.write('one and', 'one and more', 5, 'typed', 1e6);
    const gap = parseWritingLog(lost.value).edits;
    expect(gap.map((e) => e.kind)).toEqual([
      'typed',
      'typed',
      'typed',
      'restored',
      'typed',
    ]);
    expect(summarizeWriting(gap).restoredChars).toBe(4);
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

  it('budgets in bytes, so non-Latin text costs more', () => {
    const w = new WritingLogWriter(undefined);
    w.write('', 'a', 0, 'typed', 1e6, 0);
    expect(w.write('a', 'a你', 0, 'typed', 1e6, 0)).toBe(6);
    expect(w.size).toBe(utf8Length(w.value));
  });

  it('stops when the shared budget runs out', () => {
    const w = new WritingLogWriter(undefined);
    w.write('', 'a', 0, 'typed', 0);
    expect(w.write('a', 'ab', 10, 'typed', 0)).toBe(0);
    expect(parseWritingLog(w.value).cutOff).toBe(true);
  });

  it('drops one huge paste instead of letting it overrun the budget', () => {
    const w = new WritingLogWriter(undefined);
    w.write('', 'a', 0, 'typed', 1e6);
    w.write('a', 'a' + 'b'.repeat(WRITING_LOG_MAX + 10), 10, 'pasted', 1e6);
    expect(w.size).toBeLessThan(64);
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

describe('replacedWords', () => {
  it('counts a whole word swapped for another', () => {
    expect(replacedWords('the big dog ran', 'the huge dog ran')).toBe(1);
  });

  it('leaves out typo fixes, additions and cuts', () => {
    expect(replacedWords('teh dog ran', 'the dog ran')).toBe(0);
    expect(replacedWords('it was becuase of', 'it was because of')).toBe(0);
    expect(replacedWords('the dog ran', 'the black dog ran')).toBe(0);
    expect(replacedWords('the black dog ran', 'the dog ran')).toBe(0);
  });
});

describe('summarizeWriting words replaced', () => {
  const run = (steps: string[]) => {
    const w = new WritingLogWriter(undefined);
    type(w, steps);
    return summarizeWriting(parseWritingLog(w.value).edits).wordsReplaced;
  };

  it('counts selecting a word earlier in the text and typing a new one', () => {
    expect(
      run([
        'the big dog ran',
        'the  dog ran',
        'the h dog ran',
        'the hu dog ran',
        'the huge dog ran',
      ])
    ).toBe(1);
  });

  it('ignores retyping the word being written at the end', () => {
    expect(run(['I like dogs', 'I like ', 'I like c', 'I like cats'])).toBe(0);
  });

  it('ignores fixing a typo earlier in the text', () => {
    expect(run(['teh dog ran', 'th dog ran', 'the dog ran'])).toBe(0);
  });
});

describe('writing sessions', () => {
  const at = (h: number) => Date.UTC(2026, 10, 16, h);

  it('starts a new session after a long break, even in the same page load', () => {
    const w = new WritingLogWriter(undefined);
    w.write('', 'a', 0, 'typed', 1e6, at(9));
    w.write('a', 'ab', 60_000, 'typed', 1e6, at(9) + 60_000);
    w.write('ab', 'abc', 61_000, 'typed', 1e6, at(14));
    const { edits, stamps } = parseWritingLog(w.value);
    expect(stamps.map((s) => s.at)).toEqual([0, 2]);
    expect(writingSessions(edits, stamps)).toEqual([
      { at: 0, start: at(9), end: at(9) + 60_000 },
      { at: 2, start: at(14), end: at(14) },
    ]);
  });

  it('continues the session across a quick page reload', () => {
    const first = new WritingLogWriter(undefined);
    first.write('', 'a', 0, 'typed', 1e6, at(9));
    first.write('a', 'ab', 120_000, 'typed', 1e6, at(9) + 120_000);
    const second = new WritingLogWriter(first.value);
    second.write('ab', 'abc', 0, 'typed', 1e6, at(9) + 180_000);
    const { edits, stamps } = parseWritingLog(second.value);
    expect(stamps).toHaveLength(2);
    expect(writingSessions(edits, stamps)).toEqual([
      { at: 0, start: at(9), end: at(9) + 180_000 },
    ]);
    expect(SESSION_GAP_MS).toBe(900_000);
  });

  it('has no sessions for a log written before stamps', () => {
    const { edits, stamps } = parseWritingLog('0:a;64:b');
    expect(edits).toHaveLength(2);
    expect(writingSessions(edits, stamps)).toEqual([]);
  });
});

describe('logs from the recorder that doubled paragraph breaks', () => {
  it('re-spaces breaks after a reload without calling it lost typing', () => {
    // An old log: innerText gave each paragraph break as two newlines, and no clock stamps.
    const old = '0:a;64:\n;64:\n;64:b';
    const w = new WritingLogWriter(old);
    w.write('a\nb', 'a\nbc', 0, 'typed', 1e6);
    const { edits, stamps } = parseWritingLog(w.value);
    expect(edits.map((e) => e.kind)).toEqual([
      'typed',
      'typed',
      'typed',
      'typed',
      'format',
      'typed',
    ]);
    const s = summarizeWriting(edits);
    expect(s.restoredChars).toBe(0);
    expect(s.finalText).toBe('a\nbc');
    // The old part has no clock time, so no sessions are shown.
    expect(writingSessions(edits, stamps)).toEqual([]);
  });

  it('still reports text lost to a reload', () => {
    const w = new WritingLogWriter('0:a;64:\n;64:\n;64:b');
    w.write('a\nb lost', 'a\nb lost!', 0, 'typed', 1e6);
    const s = summarizeWriting(parseWritingLog(w.value).edits);
    expect(s.restoredChars).toBeGreaterThan(0);
  });
});
