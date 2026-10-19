import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LocalFlashcardAdapter,
  MemoryFlashcardAdapter,
  TrackedFlashcardAdapter,
  type FlashcardProgressWrite,
  type FlashcardRating,
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

  it('sends ratings instead of cards when the server owns mastery', async () => {
    const writes: FlashcardProgressWrite[] = [];
    const batches: FlashcardRating[][] = [];
    let fail = true;
    const adapter = new TrackedFlashcardAdapter({
      classId: 'class-a',
      initial: null,
      write: (payload) => {
        writes.push(payload);
        return Promise.resolve();
      },
      rate: (ratings) => {
        batches.push(ratings);
        return fail ? Promise.reject(new Error('offline')) : Promise.resolve();
      },
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    adapter.record('card-a', true, 1);
    await adapter.flush();
    expect(writes[0]).not.toHaveProperty('cards');
    expect(adapter.load().cards['card-a']).toEqual({
      s: 1,
      due: 2,
      c: 1,
      w: 0,
    });
    fail = false;
    adapter.record('card-b', false, 2);
    await adapter.flush();
    expect(batches).toEqual([
      [{ cardId: 'card-a', correct: true, round: 1 }],
      [
        { cardId: 'card-a', correct: true, round: 1 },
        { cardId: 'card-b', correct: false, round: 2 },
      ],
    ]);
    consoleError.mockRestore();
  });

  it('writes nothing after discard', async () => {
    vi.useFakeTimers();
    const { adapter, writes } = setup();
    adapter.record('card-a', true, 1);
    adapter.discard();
    await vi.advanceTimersByTimeAsync(10_000);
    await adapter.flush();
    expect(writes).toHaveLength(0);
  });

  it('skips a pending write and rating once discarded mid-flush', async () => {
    let release: () => void = () => undefined;
    const writes: FlashcardProgressWrite[] = [];
    const rate = vi.fn(() => Promise.resolve());
    const adapter = new TrackedFlashcardAdapter({
      classId: 'class-a',
      initial: null,
      write: (payload) => {
        writes.push(payload);
        return new Promise<void>((done) => {
          release = done;
        });
      },
      rate,
    });
    adapter.record('card-a', true, 1);
    const first = adapter.flush();
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    adapter.record('card-b', true, 1);
    const second = adapter.flush();
    adapter.discard();
    release();
    await first;
    await second;
    expect(writes).toHaveLength(1);
    expect(rate).not.toHaveBeenCalled();
  });

  it('splits a long rating queue into callable-sized batches', async () => {
    const batches: FlashcardRating[][] = [];
    const adapter = new TrackedFlashcardAdapter({
      classId: 'class-a',
      initial: null,
      write: () => Promise.resolve(),
      rate: (ratings) => {
        batches.push(ratings);
        return Promise.resolve();
      },
    });
    for (let round = 1; round <= 1200; round += 1) {
      adapter.record('card-a', false, round);
    }
    await adapter.flush();
    expect(batches.map((batch) => batch.length)).toEqual([500, 500, 200]);
    expect(adapter.hasUnsentRatings()).toBe(false);
  });
  it('ignores a second rating of a card in the same round, as the server does', async () => {
    const batches: FlashcardRating[][] = [];
    const adapter = new TrackedFlashcardAdapter({
      classId: 'class-a',
      initial: null,
      write: () => Promise.resolve(),
      rate: (ratings) => {
        batches.push(ratings);
        return Promise.resolve();
      },
    });
    adapter.record('card-a', true, 1);
    const state = adapter.record('card-a', true, 1);
    expect(state.cards['card-a']).toEqual({ s: 1, due: 2, c: 1, w: 0 });
    await adapter.flush();
    expect(batches).toEqual([[{ cardId: 'card-a', correct: true, round: 1 }]]);
  });
});

describe('Speak progress (F7, F8)', () => {
  beforeEach(() => localStorage.clear());

  const tally = { r: { n: 1, m: 1, f: 0 }, a: { n: 2, m: 0, f: 0 } };

  it('round-trips Speak progress through local storage on its own round', () => {
    const adapter = new LocalFlashcardAdapter('speak-share');
    adapter.record('card-a', true, 1);
    adapter.recordSpeak('card-a', false, 40, 3, tally, 2);
    adapter.recordSpeak('card-a', true, 90, 1, { r: { n: 1, m: 0, f: 1 } });

    const reloaded = new LocalFlashcardAdapter('speak-share').load();
    expect(reloaded.cards['card-a']).toMatchObject({ s: 1, c: 1 });
    expect(reloaded.round).toBe(1);
    expect(reloaded.speakRound).toBe(2);
    expect(reloaded.speak?.['card-a']).toEqual({
      s: 1,
      due: 3,
      c: 1,
      w: 1,
      best: 90,
      last: 90,
      tries: 1,
    });
    expect(reloaded.speakSounds).toEqual({
      r: { n: 2, m: 1, f: 1 },
      a: { n: 2, m: 0, f: 0 },
    });
  });

  it('keeps the old shape for a learner who never used Speak', () => {
    const adapter = new LocalFlashcardAdapter('no-speak');
    adapter.record('card-a', true, 1);
    expect(
      JSON.parse(localStorage.getItem('spart.flashcards.v1.no-speak') ?? '')
    ).toEqual({
      cards: { 'card-a': { s: 1, due: 2, c: 1, w: 0 } },
      starred: [],
      round: 1,
    });
  });

  it('drops malformed Speak entries from stored state', () => {
    localStorage.setItem(
      'spart.flashcards.v1.bad-speak',
      JSON.stringify({
        cards: {},
        starred: [],
        round: 1,
        speak: {
          ok: { s: 1, due: 2, c: 1, w: 0, best: 80, last: 80, tries: 2 },
          over: { s: 1, due: 2, c: 1, w: 0, best: 180, last: 80, tries: 2 },
          plain: { s: 1, due: 2, c: 1, w: 0 },
        },
        speakRound: 0,
        speakSounds: { r: { n: 1, m: 0, f: 0 }, x: { n: -1, m: 0, f: 0 } },
      })
    );
    const state = new LocalFlashcardAdapter('bad-speak').load();
    expect(Object.keys(state.speak ?? {})).toEqual(['ok']);
    expect(state.speakRound).toBeUndefined();
    expect(Object.keys(state.speakSounds ?? {})).toEqual(['r']);
  });

  it('clamps accuracy and tries, and resets clear Speak', () => {
    const adapter = new MemoryFlashcardAdapter();
    const state = adapter.recordSpeak('card-a', true, 140, 25, {});
    expect(state.speak?.['card-a']).toMatchObject({
      best: 100,
      last: 100,
      tries: 10,
    });
    expect(adapter.reset().speak).toBeUndefined();
  });

  it('writes only changed Speak cards and sounds from the tracked adapter', async () => {
    const writes: FlashcardProgressWrite[] = [];
    const adapter = new TrackedFlashcardAdapter({
      classId: 'class-a',
      initial: {
        cards: {},
        starred: [],
        round: 1,
        speak: {
          old: { s: 1, due: 2, c: 1, w: 0, best: 70, last: 70, tries: 1 },
        },
        speakRound: 1,
        speakSounds: { e: { n: 4, m: 0, f: 0 } },
      },
      write: (payload) => {
        writes.push(payload);
        return Promise.resolve();
      },
    });
    adapter.recordSpeak('card-b', true, 85, 2, tally, 2);
    await adapter.flush();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ speakRound: 2 });
    expect(Object.keys(writes[0]?.speak ?? {})).toEqual(['card-b']);
    expect(writes[0]?.speakSounds).toEqual(tally);

    const next = adapter.load();
    next.speak = {
      ...next.speak,
      old: { s: 2, due: 4, c: 2, w: 0, best: 90, last: 90, tries: 1 },
    };
    await adapter.flush(next);
    expect(Object.keys(writes[1]?.speak ?? {})).toEqual(['old']);
    expect(writes[1]?.speakSounds).toBeUndefined();
  });

  it('sends no Speak keys when Speak was never used', async () => {
    const writes: FlashcardProgressWrite[] = [];
    const adapter = new TrackedFlashcardAdapter({
      classId: 'class-a',
      initial: null,
      write: (payload) => {
        writes.push(payload);
        return Promise.resolve();
      },
    });
    adapter.record('card-a', true, 1);
    await adapter.flush();
    expect(Object.keys(writes[0] ?? {}).sort()).toEqual([
      'cards',
      'classId',
      'lastActiveAt',
      'modesUsed',
      'round',
      'starred',
      'studyMs',
      'tests',
    ]);
  });
});
