import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LocalFlashcardAdapter,
  MemoryFlashcardAdapter,
  TrackedFlashcardAdapter,
  type FlashcardProgressWrite,
} from './adapters';

describe('flashcard progress adapters', () => {
  beforeEach(() => localStorage.clear());

  it('persists public progress under the share-specific key', () => {
    const adapter = new LocalFlashcardAdapter('share-one');
    adapter.record('card-a', true, 1);
    adapter.star('card-a');

    const reloaded = new LocalFlashcardAdapter('share-one').load();
    expect(reloaded.cards['card-a']).toMatchObject({ s: 1, due: 2, c: 1 });
    expect(reloaded.starred).toEqual(['card-a']);
  });

  it('falls back from corrupt local storage and can reset progress', () => {
    localStorage.setItem('spart.flashcards.v1.bad', '{not json');
    const adapter = new LocalFlashcardAdapter('bad');
    expect(adapter.load()).toEqual({ cards: {}, starred: [], round: 1 });
    adapter.record('card-a', false, 1);
    expect(adapter.reset()).toEqual({ cards: {}, starred: [], round: 1 });
  });

  it('can restart rounds without clearing favorites', () => {
    const adapter = new LocalFlashcardAdapter('restart');
    adapter.record('card-a', true, 1);
    adapter.star('card-a');
    expect(adapter.reset({ keepStarred: true })).toEqual({
      cards: {},
      starred: ['card-a'],
      round: 1,
    });
  });

  it('keeps present-mode marks in memory and hides mark controls', () => {
    const adapter = new MemoryFlashcardAdapter();
    expect(adapter.showsMarks).toBe(false);
    expect(adapter.record('card-a', true, 1).cards['card-a']?.s).toBe(1);
  });
});

describe('TrackedFlashcardAdapter', () => {
  afterEach(() => vi.useRealTimers());

  const setup = (
    initial: ConstructorParameters<
      typeof TrackedFlashcardAdapter
    >[0]['initial'] = null
  ) => {
    const writes: FlashcardProgressWrite[] = [];
    let now = 1_000;
    const adapter = new TrackedFlashcardAdapter({
      classId: 'class-a',
      initial,
      now: () => now,
      write: (payload) => {
        writes.push(payload);
        return Promise.resolve();
      },
    });
    return {
      adapter,
      writes,
      advance: (ms: number) => {
        now += ms;
      },
    };
  };

  it('resumes stored progress and blocks resets', () => {
    const { adapter } = setup({
      cards: { 'card-a': { s: 2, due: 3, c: 2, w: 0 } },
      starred: ['card-a'],
      round: 2,
      studyMs: 5000,
    });
    expect(adapter.canReset).toBe(false);
    expect(adapter.load()).toEqual({
      cards: { 'card-a': { s: 2, due: 3, c: 2, w: 0 } },
      starred: ['card-a'],
      round: 2,
    });
  });

  it('debounces writes and sends only changed cards', async () => {
    vi.useFakeTimers();
    const { adapter, writes, advance } = setup({
      cards: { 'card-a': { s: 1, due: 2, c: 1, w: 0 } },
      starred: [],
      round: 1,
      studyMs: 0,
    });
    advance(30_000);
    adapter.record('card-b', true, 1);
    adapter.noteMode('write');
    expect(writes).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(5000);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      classId: 'class-a',
      cards: { 'card-b': { s: 1, due: 2, c: 1, w: 0 } },
      round: 1,
      studyMs: 30_000,
      modesUsed: ['write'],
      tests: [],
    });
    expect(Object.keys(writes[0]?.cards ?? {})).toEqual(['card-b']);
  });

  it('caps idle gaps, keeps newest tests first, and writes check progress on flush', async () => {
    const { adapter, writes, advance } = setup();
    advance(60 * 60 * 1000);
    adapter.recordTest({ types: ['mc'], count: 4, score: 3 });
    adapter.recordCheckWrite('card-a', {
      response: 'hola',
      attempts: 1,
      done: true,
    });
    await adapter.flush();
    expect(writes[0]).toMatchObject({
      studyMs: 2 * 60 * 1000,
      tests: [{ types: ['mc'], count: 4, score: 3 }],
      checkLog: { 'card-a': { response: 'hola', attempts: 1, done: true } },
    });
    expect(adapter.loadCheckLog()['card-a']?.done).toBe(true);
    await adapter.flush();
    expect(writes).toHaveLength(1);
  });

  it('holds writes while paused and sends them on resume', async () => {
    vi.useFakeTimers();
    const { adapter, writes } = setup();
    adapter.record('card-a', true, 1);
    adapter.setPaused(true);
    await vi.advanceTimersByTimeAsync(10_000);
    adapter.record('card-b', false, 1);
    await adapter.flush();
    expect(writes).toHaveLength(0);

    adapter.setPaused(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(writes).toHaveLength(1);
    expect(Object.keys(writes[0]?.cards ?? {}).sort()).toEqual([
      'card-a',
      'card-b',
    ]);
  });

  it('retries cards whose save failed on the next flush', async () => {
    const payloads: FlashcardProgressWrite[] = [];
    let fail = true;
    const adapter = new TrackedFlashcardAdapter({
      classId: 'class-a',
      initial: null,
      write: (payload) => {
        payloads.push(payload);
        if (fail) return Promise.reject(new Error('offline'));
        return Promise.resolve();
      },
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    adapter.record('card-a', false, 1);
    await adapter.flush();
    fail = false;
    await adapter.flush();
    expect(payloads).toHaveLength(2);
    expect(Object.keys(payloads[1]?.cards ?? {})).toEqual(['card-a']);
    consoleError.mockRestore();
  });
});
