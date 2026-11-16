import { describe, expect, it } from 'vitest';
import { WritingRecorder, emptyWritingSummary } from './writingRecorder';
import { parseWritingLog, textAfter } from './writingLog';

const fresh = (over: Partial<ConstructorParameters<typeof WritingRecorder>[0]> = {}) =>
  new WritingRecorder({
    log: '',
    startText: '',
    chunk: 0,
    base: emptyWritingSummary(0),
    ...over,
  });

const MIN = 60_000;

describe('WritingRecorder', () => {
  it('logs typing and counts one Writing session', () => {
    const rec = fresh();
    rec.edit('', 'H', 0, 'typed', 10 * MIN);
    rec.edit('H', 'Hi', 300, 'typed', 10 * MIN + 300);
    const { edits } = parseWritingLog(rec.openChunk.log);
    expect(textAfter(edits, edits.length)).toBe('Hi');
    expect(rec.summary(1, 99)).toMatchObject({
      sessions: 1,
      writingMs: 300,
      pasteCount: 0,
      wordCount: 1,
      savedAt: 99,
    });
  });

  it('keeps each paste with its text (D8, D9)', () => {
    const rec = fresh();
    rec.edit('', 'a ', 0, 'typed', MIN);
    rec.edit('a ', 'a pasted words', 10, 'pasted', MIN);
    const { edits } = parseWritingLog(rec.openChunk.log);
    expect(edits.at(-1)).toMatchObject({ kind: 'pasted', ins: 'pasted words' });
    expect(rec.summary(3, 1)).toMatchObject({ pasteCount: 1, pastedChars: 12 });
  });

  it('counts text that appeared with no typing or paste, but not moved line breaks', () => {
    const rec = fresh();
    rec.edit('', 'a', 0, 'typed', MIN);
    rec.edit('a\n', 'a\nb', 10, 'typed', MIN);
    expect(rec.summary(1, 1).untypedCount).toBe(0);
    rec.edit('a\nb dictated', 'a\nb dictated.', 20, 'typed', MIN);
    expect(rec.summary(1, 1)).toMatchObject({
      untypedCount: 1,
      untypedChars: 9,
    });
  });

  it('starts a new Writing session after a 15 minute gap, carrying on from the server counts', () => {
    const rec = fresh({
      base: { ...emptyWritingSummary(MIN), sessions: 2, savedAt: MIN },
    });
    rec.edit('', 'a', 0, 'typed', 5 * MIN);
    expect(rec.summary(1, 1).sessions).toBe(2);
    rec.edit('a', 'ab', 1, 'typed', 25 * MIN);
    expect(rec.summary(1, 1).sessions).toBe(3);
  });

  it('adds time away to the summary', () => {
    const rec = fresh();
    rec.away(4_200);
    rec.away(800);
    expect(rec.summary(0, 1)).toMatchObject({ awayCount: 2, awayMs: 5_000 });
  });

  it('appends to the open chunk from an earlier page load', () => {
    const first = fresh();
    first.edit('', 'one', 0, 'typed', MIN);
    const again = fresh({ log: first.openChunk.log });
    again.edit('one', 'one two', 0, 'typed', 2 * MIN);
    const { edits } = parseWritingLog(again.openChunk.log);
    expect(textAfter(edits, edits.length)).toBe('one two');
    expect(edits.some((e) => e.kind === 'restored')).toBe(false);
  });

  it('closes a full chunk and opens the next from the current text (D25)', () => {
    const rec = fresh({ chunkBytes: 200 });
    let text = '';
    for (let i = 0; i < 40; i += 1) {
      const next = `${text}word${i} `;
      rec.edit(text, next, i * 100, 'typed', MIN + i);
      text = next;
    }
    const closed = rec.nextClosing;
    expect(closed?.index).toBe(0);
    expect(rec.openChunk.index).toBeGreaterThan(0);
    expect(rec.logDirty).toBe(true);
    // The closed chunk plus the open chunk, read from its start text, give the whole piece.
    const first = parseWritingLog(closed?.log);
    const before = textAfter(first.edits, first.edits.length);
    expect(text.startsWith(before)).toBe(true);
    rec.confirmClosed(0);
    while (rec.nextClosing) rec.confirmClosed(rec.nextClosing.index);
    const open = rec.openChunk;
    const rest = parseWritingLog(open.log, open.startText.length);
    expect(textAfter(rest.edits, rest.edits.length, open.startText)).toBe(text);
  });

  it('stops recording after the last chunk but keeps counting (D25)', () => {
    const rec = fresh({ chunk: 9, chunkBytes: 120 });
    let text = '';
    for (let i = 0; i < 10; i += 1) {
      const next = `${text}pasted${i} `;
      rec.edit(text, next, i, 'pasted', MIN + i);
      text = next;
    }
    const s = rec.summary(10, 1);
    expect(s.logStoppedAt).toBeDefined();
    expect(s.pasteCount).toBe(10);
    expect(rec.openChunk.index).toBe(9);
  });

  it('tracks which log has been saved', () => {
    const rec = fresh();
    expect(rec.logDirty).toBe(false);
    rec.edit('', 'a', 0, 'typed', MIN);
    const v = rec.logVersion;
    expect(rec.logDirty).toBe(true);
    rec.markLogSaved(v);
    expect(rec.logDirty).toBe(false);
  });
});
