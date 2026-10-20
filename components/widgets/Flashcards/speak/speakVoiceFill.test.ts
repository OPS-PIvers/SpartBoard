import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FlashcardCard, FlashcardCardSpeak, FlashcardSet } from '@/types';
import {
  SPEAK_G2P_VERSION,
  SPEAK_G2P_VOICES_PENDING,
} from '@/utils/pronunciation/g2pVersion';
import type { LookupInput, LookupOutput } from './lookupSpeakReferences';
import {
  applyVoiceResults,
  resetVoiceFillForTests,
  startVoiceFill,
  VOICE_BATCH_SIZE,
  VOICE_PARALLEL_CALLS,
} from './speakVoiceFill';

vi.mock('@/config/firebase', () => ({ functions: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const espeak = (term: string): FlashcardCardSpeak['refs'][number] => ({
  dialect: 'es-419',
  tokens: [...term],
  stress: [0],
});

const pendingSpeak = (term: string): FlashcardCardSpeak => ({
  term,
  refs: [espeak(term)],
  g2pVersion: SPEAK_G2P_VOICES_PENDING,
  status: 'ready',
  dialects: ['es-419'],
});

const voicedSpeak = (term: string): FlashcardCardSpeak => ({
  ...pendingSpeak(term),
  refs: [
    espeak(term),
    { dialect: 'es-419', tokens: ['x'], stress: [0], source: 'voice' },
  ],
  g2pVersion: SPEAK_G2P_VERSION,
});

const card = (i: number, speak = pendingSpeak(`t${i}`)): FlashcardCard => ({
  id: `c${i}`,
  term: `t${i}`,
  definition: 'd',
  speak,
});

const makeSet = (cards: FlashcardCard[]): FlashcardSet => ({
  id: 's1',
  title: 'Set',
  termLanguage: 'es-MX',
  definitionLanguage: 'en-US',
  cards,
  createdAt: 1,
  updatedAt: 1,
});

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

interface Pending {
  input: LookupInput;
  resolve: (out: LookupOutput) => void;
  reject: (err: Error) => void;
}

const controlledCall = () => {
  const calls: Pending[] = [];
  const call = (input: LookupInput) =>
    new Promise<LookupOutput>((resolve, reject) =>
      calls.push({ input, resolve, reject })
    );
  const answer = (pending: Pending) =>
    pending.resolve({
      g2pVersion: SPEAK_G2P_VERSION,
      cards: Object.fromEntries(
        pending.input.terms.map((t) => [t.cardId, voicedSpeak(t.term)])
      ),
    });
  return { calls, call, answer };
};

afterEach(() => resetVoiceFillForTests());

describe('startVoiceFill', () => {
  it('reads voices in small batches, a few at a time, then writes them onto the latest copy', async () => {
    const cards = Array.from({ length: 12 }, (_, i) => card(i));
    let stored = makeSet(cards);
    const write = vi.fn((merge: (s: FlashcardSet) => FlashcardSet) => {
      stored = merge(stored);
      return Promise.resolve();
    });
    const { calls, call, answer } = controlledCall();
    startVoiceFill(stored, write, call);

    expect(calls).toHaveLength(VOICE_PARALLEL_CALLS);
    expect(calls[0].input.terms).toHaveLength(VOICE_BATCH_SIZE);
    expect(calls[0].input.voices).toBeUndefined();

    // A definition edit saved meanwhile survives the voice write.
    stored = {
      ...stored,
      cards: stored.cards.map((c) =>
        c.id === 'c0' ? { ...c, definition: 'edited' } : c
      ),
    };
    calls.forEach(answer);
    await flush();
    expect(stored.cards.every((c) => c.speak?.refs.length === 2)).toBe(true);
    expect(stored.cards[0].definition).toBe('edited');
    expect(write.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('skips a card whose term changed while its voices were read', async () => {
    let stored = makeSet([card(0), card(1)]);
    const write = (merge: (s: FlashcardSet) => FlashcardSet) => {
      stored = merge(stored);
      return Promise.resolve();
    };
    const { calls, call, answer } = controlledCall();
    startVoiceFill(stored, write, call);
    stored = {
      ...stored,
      cards: [{ ...stored.cards[0], term: 'nuevo' }, stored.cards[1]],
    };
    calls.forEach(answer);
    await flush();
    expect(stored.cards[0].speak?.g2pVersion).toBe(SPEAK_G2P_VOICES_PENDING);
    expect(stored.cards[1].speak?.g2pVersion).toBe(SPEAK_G2P_VERSION);
  });

  it('leaves cards pending when a batch fails', async () => {
    let stored = makeSet([card(0)]);
    const write = vi.fn((merge: (s: FlashcardSet) => FlashcardSet) => {
      stored = merge(stored);
      return Promise.resolve();
    });
    const { calls, call } = controlledCall();
    startVoiceFill(stored, write, call);
    calls[0].reject(new Error('down'));
    await flush();
    expect(stored.cards[0].speak?.g2pVersion).toBe(SPEAK_G2P_VOICES_PENDING);
  });

  it('does not read a card twice when the set is saved again mid-fill', () => {
    const set = makeSet([card(0)]);
    const { calls, call } = controlledCall();
    startVoiceFill(set, vi.fn(), call);
    startVoiceFill(set, vi.fn(), call);
    expect(calls).toHaveLength(1);
  });

  it('ignores sets with nothing waiting or no Speak language', () => {
    const { calls, call } = controlledCall();
    startVoiceFill(makeSet([card(0, voicedSpeak('t0'))]), vi.fn(), call);
    startVoiceFill(
      { ...makeSet([card(0)]), termLanguage: 'fr-FR' },
      vi.fn(),
      call
    );
    expect(calls).toHaveLength(0);
  });
});

describe('applyVoiceResults', () => {
  it('keeps a teacher confirmation on a card that needed checking', async () => {
    const speak = {
      ...pendingSpeak('t0'),
      status: 'needs-review' as const,
      reasons: ['stress-disagree' as const],
      confirmedAt: 5,
    };
    let stored = makeSet([card(0, speak)]);
    const { calls, call } = controlledCall();
    startVoiceFill(
      stored,
      (merge) => {
        stored = merge(stored);
        return Promise.resolve();
      },
      call
    );
    calls[0].resolve({
      g2pVersion: SPEAK_G2P_VERSION,
      cards: {
        c0: {
          ...voicedSpeak('t0'),
          status: 'needs-review',
          reasons: ['stress-disagree'],
        },
      },
    });
    await flush();
    expect(stored.cards[0].speak?.confirmedAt).toBe(5);
    expect(stored.cards[0].speak?.refs).toHaveLength(2);
    // An older editor copy saved later gets the same readings.
    expect(
      applyVoiceResults(makeSet([card(0, speak)])).cards[0].speak?.refs
    ).toHaveLength(2);
  });
});
