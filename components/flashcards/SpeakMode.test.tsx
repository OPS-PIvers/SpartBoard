import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FlashcardCard,
  FlashcardSpeakReference,
  TakeMicState,
} from '@/types';
import type { UseAudioRecordingOptions } from '@/hooks/useAudioRecording';
import { setRecognizerForTests } from '@/utils/pronunciation/recognizer';
import { LocalFlashcardAdapter } from './adapters';
import { FlashcardPlayer, type FlashcardPlayerSpeak } from './FlashcardPlayer';
import {
  createFakeRecognizer,
  toResult,
  type FakeRecognizer,
} from './speak/fakeRecognizer';

const capture = vi.hoisted(() => ({
  fail: null as TakeMicState | null,
  options: null as UseAudioRecordingOptions | null,
  // When set, a take stays open until stop(), like a real recorder.
  hold: false,
  starts: 0,
}));
const speechEnd = vi.hoisted(() => ({
  onEnd: null as ((event: 'ended' | 'no-speech') => void) | null,
}));
const mic = vi.hoisted(() => ({
  permission: 'granted',
  frameAllows: true,
}));

vi.mock('@/hooks/useAudioRecording', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/hooks/useAudioRecording')>();
  const { useState } = await import('react');
  return {
    ...actual,
    useAudioRecording: (options: UseAudioRecordingOptions) => {
      capture.options = options;
      const [phase, setPhase] = useState<string>('armed');
      const [micState, setMicState] = useState<TakeMicState | null>(null);
      // Like the real hook, the take goes to the latest render's onTakeReady.
      const deliver = () =>
        capture.options?.onTakeReady?.({
          blob: new Blob(['take'], { type: 'audio/webm' }),
          mimeType: 'audio/webm',
          durationMs: 900,
          micState: 'on',
        });
      return {
        phase,
        micState,
        take: null,
        takeUrl: null,
        prepSecondsLeft: null,
        recordSecondsLeft: null,
        wrapUpWarning: false,
        arm: () => setPhase('armed'),
        start: async () => {
          capture.starts += 1;
          if (capture.fail) {
            setMicState(capture.fail);
            setPhase('capture-unavailable');
            return;
          }
          if (capture.hold) {
            setPhase('recording');
            return;
          }
          await Promise.resolve();
          deliver();
        },
        stop: () => {
          if (!capture.hold) return;
          setPhase('armed');
          deliver();
        },
        discard: () => undefined,
        commit: () => null,
        reset: () => undefined,
        restore: () => false,
      };
    },
  };
});

const hear = vi.hoisted(() => ({ played: 0 }));
vi.mock('@/utils/pronunciation/hearIt', () => ({
  hearIt: () => {
    hear.played += 1;
    return { stop: () => undefined };
  },
  hearItVoice: () => ({}) as SpeechSynthesisVoice,
  subscribeVoices: () => () => undefined,
}));

vi.mock('./speak/useSpeechEnd', () => ({
  useSpeechEnd: (
    stream: MediaStream | null,
    onEnd: (event: 'ended' | 'no-speech') => void
  ) => {
    speechEnd.onEnd = onEnd;
  },
}));

vi.mock('./speak/micAccess', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./speak/micAccess')>();
  return {
    ...actual,
    canCapture: () => true,
    frameAllowsMic: () => mic.frameAllows,
    micPermission: () => Promise.resolve(mic.permission),
  };
});

const ref = (
  tokens: string[],
  letterSpans?: number[],
  stress: number[] = []
): FlashcardSpeakReference => ({
  dialect: 'es-419',
  tokens,
  stress,
  ...(letterSpans ? { letterSpans } : {}),
});

const speakCard = (
  id: string,
  term: string,
  refs: FlashcardSpeakReference[],
  status: 'ready' | 'needs-review' | 'unavailable' = 'ready'
): FlashcardCard => ({
  id,
  term,
  definition: id,
  speak: { term, refs, g2pVersion: 'test', status },
});

const perro = speakCard('perro', 'perro', [
  ref(['p', 'e', 'r', 'o'], [0, 1, 1, 2, 2, 4, 4, 5]),
]);
const hola = speakCard('hola', 'hola', [
  ref(['o', 'l', 'a'], [1, 2, 2, 3, 3, 4]),
]);
const cards = [perro, hola];

const stamp = (
  over: Partial<FlashcardPlayerSpeak> = {}
): FlashcardPlayerSpeak => ({
  dialects: ['es-419'],
  preset: 'custom',
  strict: false,
  groups: {},
  attempts: 2,
  example: false,
  ...over,
});

let fake: FakeRecognizer;

const renderPlayer = (
  props: Partial<React.ComponentProps<typeof FlashcardPlayer>> = {},
  key = 'speak-test'
) => {
  const adapter = new LocalFlashcardAdapter(key);
  render(
    <FlashcardPlayer
      cards={cards}
      termLanguage="es-MX"
      definitionLanguage="en-US"
      adapter={adapter}
      speak={stamp()}
      {...props}
    />
  );
  return adapter;
};

const openSpeak = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Speak' }));
  return screen.findByRole('button', { name: 'Start speaking' });
};

describe('Speak mode', () => {
  beforeEach(() => {
    localStorage.clear();
    capture.fail = null;
    capture.options = null;
    capture.hold = false;
    capture.starts = 0;
    speechEnd.onEnd = null;
    hear.played = 0;
    mic.permission = 'granted';
    mic.frameAllows = true;
    fake = createFakeRecognizer();
    setRecognizerForTests(fake);
    URL.createObjectURL = vi.fn(() => 'blob:take');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => setRecognizerForTests(null));

  it('has no Speak tab without the teacher stamp or a supported language', () => {
    const { unmount } = render(
      <FlashcardPlayer
        cards={cards}
        termLanguage="es-US"
        definitionLanguage="en-US"
        adapter={new LocalFlashcardAdapter('no-stamp')}
      />
    );
    expect(screen.queryByRole('button', { name: 'Speak' })).toBeNull();
    unmount();
    render(
      <FlashcardPlayer
        cards={cards}
        termLanguage="fr-FR"
        definitionLanguage="en-US"
        adapter={new LocalFlashcardAdapter('french')}
        speak={stamp()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Speak' })).toBeNull();
  });

  it('never writes Speak state for a student who never opens it', async () => {
    const user = userEvent.setup();
    const adapter = renderPlayer({}, 'flashcards-only');
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    const state = adapter.load();
    expect(state.speak).toBeUndefined();
    expect(state.speakRound).toBeUndefined();
    expect(state.speakSounds).toBeUndefined();
  });

  it('records an Exact take on Speak progress, not recall progress', async () => {
    const user = userEvent.setup();
    const adapter = renderPlayer();
    fake.queue({ tokens: ['p', 'e', 'r', 'o'] });
    await user.click(await openSpeak(user));
    expect(await screen.findByText('Exact')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain(
      'You said it just right.'
    );
    const state = adapter.load();
    expect(state.speak?.perro).toMatchObject({ s: 1, tries: 1, last: 100 });
    expect(state.cards).toEqual({});
    expect(state.speakSounds?.r).toEqual({ n: 1, m: 0, f: 0 });

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('hola')).toBeTruthy();
    expect(screen.getByText('0/2 said well')).toBeTruthy();
  });

  it('passes the F25 capture settings to the recorder', async () => {
    const user = userEvent.setup();
    renderPlayer();
    await openSpeak(user);
    expect(capture.options?.audioBitsPerSecond).toBe(128000);
    expect(capture.options?.constraints).toEqual({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: true,
    });
  });

  it('accepts a forgiven sound and names its group', async () => {
    const user = userEvent.setup();
    const adapter = renderPlayer();
    fake.queue({ tokens: ['p', 'e', 'ɾ', 'o'] });
    await user.click(await openSpeak(user));
    expect(await screen.findByText('Accepted')).toBeTruthy();
    expect(screen.getByText('Rolled r (perro)')).toBeTruthy();
    const mark = screen.getByRole('button', { name: /^Changed: / });
    expect(mark.textContent).toBe('rr');
    await user.click(mark);
    expect(screen.getByRole('note')).toBeTruthy();
    expect(adapter.load().speakSounds?.r).toEqual({ n: 1, m: 0, f: 1 });
  });

  it('gives Not yet, then decides on the last attempt', async () => {
    const user = userEvent.setup();
    const adapter = renderPlayer();
    fake.queue({ tokens: ['p', 'a', 'r', 'o'] });
    await user.click(await openSpeak(user));
    expect(await screen.findByText('Not yet')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Attempt 2 of 2' })).toBeTruthy();
    expect(adapter.load().speak).toBeUndefined();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByText("Not yet. We'll come back to this word.")
    ).toBeTruthy();
    const progress = adapter.load().speak?.perro;
    expect(progress).toMatchObject({ s: 0, w: 1, tries: 2 });
    expect(adapter.load().speakSounds?.e).toEqual({ n: 1, m: 1, f: 0 });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('never spends an attempt on an unclear take and opens the mic check after three', async () => {
    const user = userEvent.setup();
    const adapter = renderPlayer();
    fake.queue({ tokens: [] });
    await user.click(await openSpeak(user));
    expect(await screen.findByText("Couldn't hear you")).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText("Let's check your microphone")).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Attempt 1 of 2' })).toBeTruthy();
    expect(adapter.load().speak).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Back to practice' }));
    expect(screen.getByRole('button', { name: 'Start speaking' })).toBeTruthy();
  });

  it("uses the district's Repeat when unclear cut-off from the stamp", async () => {
    const user = userEvent.setup();
    renderPlayer({ speak: stamp({ unclearConfidence: 0.95 }) });
    fake.queue({ tokens: ['p', 'e', 'r', 'o'], confidence: 0.9 });
    await user.click(await openSpeak(user));
    expect(await screen.findByText("Couldn't hear you")).toBeTruthy();
  });

  it('skips cards that are not available to speak', async () => {
    const user = userEvent.setup();
    const multi = speakCard('dog', 'der Hund', [], 'unavailable');
    renderPlayer({ cards: [multi, hola] });
    await openSpeak(user);
    expect(screen.getByText('hola')).toBeTruthy();
    expect(screen.queryByText('der Hund')).toBeNull();
    expect(screen.getByText('0/1 said well')).toBeTruthy();
  });

  it('says so when no card can be spoken', async () => {
    const user = userEvent.setup();
    renderPlayer({
      cards: [
        speakCard('dog', 'der Hund', [], 'unavailable'),
        { id: 'plain', term: 'gato', definition: 'cat' },
      ],
    });
    await user.click(screen.getByRole('button', { name: 'Speak' }));
    expect(screen.getByText('No cards to speak')).toBeTruthy();
  });

  it('shows locked Speak settings read-only', async () => {
    const user = userEvent.setup();
    renderPlayer({ speak: stamp({ locked: true, attempts: 4 }) });
    await openSpeak(user);
    await user.click(screen.getByRole('button', { name: 'Study settings' }));
    expect(screen.getByText('Your teacher set these options.')).toBeTruthy();
    const attempts = screen.getByRole('combobox', {
      name: 'Attempts per card',
    });
    expect((attempts as HTMLSelectElement).disabled).toBe(true);
    expect((attempts as HTMLSelectElement).value).toBe('4');
  });

  it('lets an unlocked student change attempts', async () => {
    const user = userEvent.setup();
    renderPlayer();
    await openSpeak(user);
    await user.click(screen.getByRole('button', { name: 'Study settings' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Attempts per card' }),
      '5'
    );
    expect(
      await screen.findByRole('img', { name: 'Attempt 1 of 5' })
    ).toBeTruthy();
  });

  it('asks before the browser does, then records', async () => {
    const user = userEvent.setup();
    mic.permission = 'prompt';
    renderPlayer();
    fake.queue({ tokens: ['p', 'e', 'r', 'o'] });
    await user.click(await openSpeak(user));
    expect(screen.getByText('Speak uses your microphone')).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: 'Turn on microphone' })
    );
    expect(await screen.findByText('Exact')).toBeTruthy();
  });

  it.each([
    ['download-failed', "Speak couldn't get ready"],
    ['integrity', "Speak couldn't get ready"],
    ['too-slow', 'This device is too slow for Speak'],
    ['no-wasm', "This browser can't run Speak"],
    ['no-worker', "This browser can't run Speak"],
  ] as const)('shows the %s reason', async (reason, title) => {
    const user = userEvent.setup();
    fake.setState({ kind: 'unsupported', reason });
    renderPlayer();
    await user.click(screen.getByRole('button', { name: 'Speak' }));
    expect(await screen.findByText(title)).toBeTruthy();
    expect(screen.getByText('The other study modes still work.')).toBeTruthy();
  });

  it('shows a blocked microphone with a retry', async () => {
    const user = userEvent.setup();
    mic.permission = 'denied';
    renderPlayer();
    await user.click(screen.getByRole('button', { name: 'Speak' }));
    expect(await screen.findByText('Microphone blocked')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('shows a missing microphone when capture fails mid-round', async () => {
    const user = userEvent.setup();
    capture.fail = 'unavailable';
    renderPlayer();
    await user.click(await openSpeak(user));
    expect(await screen.findByText('No microphone found')).toBeTruthy();
  });

  it('turns a denied microphone mid-round into Microphone blocked', async () => {
    const user = userEvent.setup();
    capture.fail = 'denied';
    renderPlayer();
    await user.click(await openSpeak(user));
    expect(await screen.findByText('Microphone blocked')).toBeTruthy();
  });

  it('offers a new tab inside a frame that blocks the microphone', async () => {
    const user = userEvent.setup();
    mic.frameAllows = false;
    renderPlayer({ framed: true });
    await user.click(screen.getByRole('button', { name: 'Speak' }));
    expect(
      await screen.findByText("Speak can't use the microphone here")
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Open in a new tab' })
    ).toBeTruthy();
  });

  it('waits for a tap before the first download', async () => {
    const user = userEvent.setup();
    fake.setState({ kind: 'idle' });
    renderPlayer();
    await user.click(screen.getByRole('button', { name: 'Speak' }));
    const download = await screen.findByRole('button', {
      name: /Get Speak ready \(241 MB, once per device\)/,
    });
    await user.click(download);
    expect(
      await screen.findByRole('button', { name: 'Start speaking' })
    ).toBeTruthy();
  });

  it('asks first on a metered connection', async () => {
    const user = userEvent.setup();
    fake.setState({ kind: 'needs-download', bytes: 241_430_967 });
    renderPlayer();
    await user.click(screen.getByRole('button', { name: 'Speak' }));
    expect(
      await screen.findByText('This connection may have limited data')
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(fake.state().kind).toBe('ready'));
  });

  it('starts recording with Space and continues with Enter', async () => {
    const user = userEvent.setup();
    const adapter = renderPlayer();
    fake.queue({ tokens: ['p', 'e', 'r', 'o'] });
    await openSpeak(user);
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    await user.keyboard(' ');
    expect(await screen.findByText('Exact')).toBeTruthy();
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    await user.keyboard('{Enter}');
    expect(screen.getByText('hola')).toBeTruthy();
    expect(adapter.load().speak?.perro?.s).toBe(1);
  });

  it('drops a result that lands after the student leaves Speak', async () => {
    const user = userEvent.setup();
    const adapter = renderPlayer();
    let finish: (value: ReturnType<typeof toResult>) => void = () => undefined;
    fake.recognize = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    await user.click(await openSpeak(user));
    expect(await screen.findByText('Checking…')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Write' }));
    await act(async () => {
      finish(toResult({ tokens: ['p', 'e', 'r', 'o'] }));
      await Promise.resolve();
    });
    expect(adapter.load().speak).toBeUndefined();
  });

  it('keeps a mid-card attempts change without restarting the round', async () => {
    const user = userEvent.setup();
    renderPlayer();
    fake.queue({ tokens: ['p', 'a', 'r', 'o'] });
    await user.click(await openSpeak(user));
    expect(await screen.findByText('Not yet')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Study settings' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Attempts per card' }),
      '4'
    );
    expect(screen.getByText('Not yet')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Attempt 2 of 4' })).toBeTruthy();
  });

  it('skips stress judging on a disputed card the teacher has not confirmed', async () => {
    const user = userEvent.setup();
    const disputed: FlashcardCard = {
      ...perro,
      speak: {
        ...(perro.speak as NonNullable<FlashcardCard['speak']>),
        status: 'needs-review',
        reasons: ['stress-disagree'],
        refs: [ref(['p', 'e', 'r', 'o'], [0, 1, 1, 2, 2, 4, 4, 5], [1])],
      },
    };
    renderPlayer({ cards: [disputed], speak: stamp({ strict: true }) });
    fake.queue({ tokens: ['p', 'e', 'r', 'o'] });
    await user.click(await openSpeak(user));
    expect(await screen.findByText('Exact')).toBeTruthy();
  });
  describe('listening on the next card', () => {
    const speakFirstCard = async (user: ReturnType<typeof userEvent.setup>) => {
      capture.hold = true;
      await user.click(await openSpeak(user));
      expect(screen.getByText('Listening…')).toBeTruthy();
      act(() => speechEnd.onEnd?.('ended'));
      expect(await screen.findByText('Exact')).toBeTruthy();
    };

    it('waits for a tap on the first card, then listens on its own after Continue', async () => {
      const user = userEvent.setup();
      const adapter = renderPlayer();
      fake.queue({ tokens: ['p', 'e', 'r', 'o'] }, { tokens: ['o', 'l', 'a'] });
      await openSpeak(user);
      expect(capture.starts).toBe(0);
      await speakFirstCard(user);
      expect(capture.starts).toBe(1);

      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(screen.getByText('hola')).toBeTruthy();
      expect(capture.starts).toBe(2);
      expect(screen.getByText('Listening…')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();

      act(() => speechEnd.onEnd?.('ended'));
      expect(await screen.findByText('Exact')).toBeTruthy();
      expect(adapter.load().speak?.hola).toMatchObject({ s: 1, tries: 1 });
      expect(adapter.load().speak?.perro).toMatchObject({ s: 1, tries: 1 });
    });

    it('goes back to Start speaking when nobody speaks, without an unclear take', async () => {
      const user = userEvent.setup();
      fake.queue({ tokens: ['p', 'e', 'r', 'o'] });
      renderPlayer();
      await speakFirstCard(user);
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(screen.getByText('Listening…')).toBeTruthy();
      const heard = fake.heard;

      act(() => speechEnd.onEnd?.('no-speech'));
      expect(
        await screen.findByRole('button', { name: 'Start speaking' })
      ).toBeTruthy();
      expect(screen.queryByText("Couldn't hear you")).toBeNull();
      expect(fake.heard).toBe(heard);
      expect(screen.getByRole('img', { name: 'Attempt 1 of 2' })).toBeTruthy();
    });

    it('still says it could not hear a take the student started', async () => {
      const user = userEvent.setup();
      fake.queue({ tokens: [] });
      renderPlayer();
      capture.hold = true;
      await user.click(await openSpeak(user));
      act(() => speechEnd.onEnd?.('no-speech'));
      expect(await screen.findByText("Couldn't hear you")).toBeTruthy();
    });

    it('drops the listening take when the student asks to hear the word', async () => {
      const user = userEvent.setup();
      fake.queue({ tokens: ['p', 'e', 'r', 'o'] });
      renderPlayer({ speak: stamp({ example: true }) });
      await speakFirstCard(user);
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      const heard = fake.heard;

      await user.click(screen.getByRole('button', { name: 'Hear it' }));
      expect(hear.played).toBe(1);
      expect(
        await screen.findByRole('button', { name: 'Start speaking' })
      ).toBeTruthy();
      expect(fake.heard).toBe(heard);
    });

    it('ignores a Stop that lands before the key that pressed Continue is let go', async () => {
      const user = userEvent.setup();
      fake.queue({ tokens: ['p', 'e', 'r', 'o'] }, { tokens: ['o', 'l', 'a'] });
      renderPlayer();
      await speakFirstCard(user);
      act(() => (document.activeElement as HTMLElement | null)?.blur());
      fireEvent.keyDown(window, { key: 'Enter' });
      const stop = await screen.findByRole('button', { name: 'Stop' });
      fireEvent.click(stop);
      expect(screen.getByText('Listening…')).toBeTruthy();

      fireEvent.keyUp(window, { key: 'Enter' });
      fireEvent.click(stop);
      expect(await screen.findByText('Exact')).toBeTruthy();
    });

    it('waits for the browser to remember the mic before listening on its own', async () => {
      const user = userEvent.setup();
      mic.permission = 'prompt';
      fake.queue({ tokens: ['p', 'e', 'r', 'o'] });
      renderPlayer();
      capture.hold = true;
      await user.click(await openSpeak(user));
      await user.click(
        screen.getByRole('button', { name: 'Turn on microphone' })
      );
      act(() => speechEnd.onEnd?.('ended'));
      expect(await screen.findByText('Exact')).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(capture.starts).toBe(1);
      expect(
        screen.getByRole('button', { name: 'Start speaking' })
      ).toBeTruthy();
    });

    it('does not listen on its own after the last card', async () => {
      const user = userEvent.setup();
      fake.queue({ tokens: ['o', 'l', 'a'] });
      renderPlayer({ cards: [hola] });
      await speakFirstCard(user);
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(capture.starts).toBe(1);
    });
  });
  describe('moving on by itself', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    // Lets the countdown effect commit before the clock moves, so a loaded runner can't skip it.
    const runCountdown = async () => {
      await act(() => Promise.resolve());
      act(() => {
        vi.advanceTimersByTime(3100);
      });
    };

    const speakFirst = async (user: ReturnType<typeof userEvent.setup>) => {
      capture.hold = true;
      await user.click(await openSpeak(user));
      act(() => speechEnd.onEnd?.('ended'));
      expect(await screen.findByText('Exact')).toBeTruthy();
    };

    it('goes to the next card and listens once the countdown ends', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      fake.queue({ tokens: ['p', 'e', 'r', 'o'] }, { tokens: ['o', 'l', 'a'] });
      renderPlayer();
      await speakFirst(user);
      expect(screen.getByText('perro')).toBeTruthy();
      await runCountdown();
      expect(await screen.findByText('hola')).toBeTruthy();
      expect(await screen.findByText('Listening…')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
      expect(await screen.findByText('Exact')).toBeTruthy();
    });

    it('holds the countdown when the student taps the result', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      fake.queue({ tokens: ['p', 'e', 'r', 'o'] });
      renderPlayer();
      await speakFirst(user);
      await user.click(screen.getByText('You said it just right.'));
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByText('perro')).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(screen.getByText('hola')).toBeTruthy();
    });

    it('still counts down after Hear it was used before speaking', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      fake.queue({ tokens: ['p', 'e', 'r', 'o'] });
      renderPlayer({ speak: stamp({ example: true }) });
      await openSpeak(user);
      await user.click(screen.getByRole('button', { name: 'Hear it' }));
      await speakFirst(user);
      await runCountdown();
      expect(await screen.findByText('hola')).toBeTruthy();
    });

    it('waits on a missed card so the marks can be read', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      fake.queue({ tokens: ['p', 'a', 'r', 'o'] });
      renderPlayer({ speak: stamp({ attempts: 1 }) });
      capture.hold = true;
      await user.click(await openSpeak(user));
      act(() => speechEnd.onEnd?.('ended'));
      expect(
        await screen.findByText("Not yet. We'll come back to this word.")
      ).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByText('perro')).toBeTruthy();
    });

    it('stays put when the student turns it off', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      fake.queue({ tokens: ['p', 'e', 'r', 'o'] });
      renderPlayer();
      await openSpeak(user);
      await user.click(screen.getByRole('button', { name: 'Study settings' }));
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'Automatically continue to next card',
        })
      );
      await user.click(screen.getByRole('button', { name: 'Study settings' }));
      await speakFirst(user);
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByText('perro')).toBeTruthy();
    });
  });
});
