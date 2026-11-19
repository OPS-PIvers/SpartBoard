import { describe, expect, it } from 'vitest';
import { WritingRecorder } from '@/utils/writingRecorder';
import { parseWritingLog, textAfter } from '@/utils/writingLog';
import {
  draftMarkAt,
  isKeptAfterPurge,
  joinWritingLog,
  purgedInserts,
  readWritingRecord,
  writingInserts,
  type WritingRecordChunk,
} from '@/utils/writingRecord';

/** Types `words` one at a time into a recorder with small chunks, pasting `paste` halfway. */
function record(chunkBytes: number) {
  const rec = new WritingRecorder({
    log: '',
    startText: '',
    chunk: 0,
    base: null,
    chunkBytes,
  });
  const chunks: WritingRecordChunk[] = [];
  const flushClosed = () => {
    for (let c = rec.nextClosing; c; c = rec.nextClosing) {
      chunks.push({ index: c.index, log: c.log });
      rec.confirmClosed(c.index);
    }
  };
  let text = '';
  let t = 0;
  const wall = Date.UTC(2026, 10, 17, 15);
  const words = 'the quick brown fox jumps over the lazy dog '.repeat(6);
  for (let i = 0; i < words.length; i += 1) {
    const next = text + words[i];
    rec.edit(text, next, (t += 150), 'typed', wall + t);
    text = next;
    flushClosed();
    if (i === Math.floor(words.length / 2)) {
      const pasted = `${text}PASTED TEXT `;
      rec.edit(text, pasted, (t += 150), 'pasted', wall + t);
      text = pasted;
      flushClosed();
    }
  }
  // An extension adds text between events: the next typed edit records it as untyped.
  const dictated = `${text}said aloud `;
  rec.edit(dictated, `${dictated}!`, (t += 150), 'typed', wall + t);
  text = `${dictated}!`;
  flushClosed();
  const open = rec.openChunk;
  return { chunks: [...chunks, open], text, rec };
}

describe('joinWritingLog', () => {
  it('replays every chunk into the final text, in any order', () => {
    const { chunks, text } = record(400);
    expect(chunks.length).toBeGreaterThan(2);
    const joined = joinWritingLog([...chunks].reverse());
    expect(textAfter(joined.edits, joined.edits.length)).toBe(text);
    expect(joined.chunkStarts[0]).toBe(0);
    expect(joined.cutOff).toBe(false);
  });

  it('stops at a missing chunk rather than misplacing later edits', () => {
    const { chunks } = record(400);
    const joined = joinWritingLog(chunks.filter((c) => c.index !== 1));
    expect(joined.chunkStarts).toEqual([0]);
  });
});

describe('writingInserts', () => {
  it('lists each paste and untyped addition with its text', () => {
    const { chunks } = record(400);
    const joined = joinWritingLog(chunks);
    const ins = writingInserts(joined.edits);
    expect(ins.pastes.map((p) => p.text)).toEqual(['PASTED TEXT ']);
    expect(ins.untyped.map((p) => p.text)).toEqual(['said aloud ']);
    expect(joined.edits[ins.pastes[0].at - 1].kind).toBe('pasted');
  });
});

describe('draftMarkAt', () => {
  it('places a turn in at the edits its log mark covers', () => {
    const { chunks } = record(400);
    const joined = joinWritingLog(chunks);
    const second = chunks[1];
    const at = draftMarkAt(joined, chunks, {
      chunk: 1,
      length: second.log.length,
    });
    expect(at).toBe(joined.chunkStarts[2] ?? joined.edits.length);
    expect(draftMarkAt(joined, chunks, { chunk: 0, length: 0 })).toBe(0);
    expect(draftMarkAt(joined, chunks, { chunk: 40, length: 3 })).toBeNull();
    expect(draftMarkAt(joined, chunks, undefined)).toBeNull();
  });
});

describe('draftMarkAt in a later chunk', () => {
  it('counts deletions before the mark, which name positions past the chunk start', () => {
    const rec = new WritingRecorder({
      log: '',
      startText: '',
      chunk: 0,
      base: null,
      chunkBytes: 200,
    });
    const chunks: WritingRecordChunk[] = [];
    let text = '';
    let t = 0;
    const step = (next: string) => {
      t += 100;
      rec.edit(text, next, t, 'typed', 1_000_000 + t);
      text = next;
      for (let c = rec.nextClosing; c; c = rec.nextClosing) {
        chunks.push({ index: c.index, log: c.log });
        rec.confirmClosed(c.index);
      }
    };
    for (const ch of 'a long opening that fills the first chunk of the log ')
      step(text + ch);
    expect(rec.openChunk.index).toBeGreaterThan(0);
    step(text + 'x');
    step(text.slice(0, -1));
    step(text + 'y');
    const mark = {
      chunk: rec.openChunk.index,
      length: rec.openChunk.log.length,
    };
    step(text + 'z');
    const all = [...chunks, rec.openChunk];
    const joined = joinWritingLog(all);
    expect(draftMarkAt(joined, all, mark)).toBe(joined.edits.length - 1);
  });
});

describe('readWritingRecord', () => {
  it('marks where a full log stopped (D25)', () => {
    const { chunks } = record(400);
    const r = readWritingRecord(chunks, {
      summary: { logStoppedAt: 5 },
    });
    expect(r.kind).toBe('playback');
    if (r.kind === 'playback') expect(r.stoppedAt).toBe(r.log.edits.length);
    const open = readWritingRecord(chunks, { summary: {} });
    if (open.kind === 'playback') expect(open.stoppedAt).toBeNull();
  });

  it('is empty with no log', () => {
    expect(readWritingRecord([], { summary: undefined }).kind).toBe('empty');
  });

  it('after the yearly purge keeps pastes and untyped text without playback (D21)', () => {
    const purged = [
      { index: 0, log: 'P0,2,,pasted words;S5,,,said aloud' },
      { index: 3, log: 'S0,0,, ;P0,9,,more' },
    ];
    const r = readWritingRecord(purged, {
      summary: {},
      logPurgedAt: 1,
    });
    expect(r).toEqual({
      kind: 'purged',
      inserts: purgedInserts(purged),
    });
    if (r.kind === 'purged') {
      expect(r.inserts.pastes.map((p) => p.text)).toEqual([
        'pasted words',
        'more',
      ]);
      expect(r.inserts.untyped.map((p) => p.text)).toEqual(['said aloud']);
    }
  });
});

describe('dictated passages (Speech to text)', () => {
  const log = '0:a;D5,,, spoken words;S0,,, tool;P3,,, pasted';

  it('lists each dictated passage apart from pastes and untyped additions', () => {
    const ins = writingInserts(parseWritingLog(log).edits);
    expect(ins.dictated).toEqual([{ at: 2, text: ' spoken words' }]);
    expect(ins.untyped.map((p) => p.text)).toEqual([' tool']);
    expect(ins.pastes.map((p) => p.text)).toEqual([' pasted']);
  });

  it('does not keep dictated text past the yearly purge', () => {
    expect(isKeptAfterPurge('D5,,, spoken words')).toBe(false);
  });
});
