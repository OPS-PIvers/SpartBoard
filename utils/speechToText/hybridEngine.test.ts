import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPEECH_CLIP_MAX_SECONDS } from '@/config/speechToText';
import { createBrowserEngine } from './browserEngine';
import {
  FakeMediaRecorder,
  installFakeMediaRecorder,
  type FakeMicrophone,
} from './fakeMediaRecorder';
import { FakeRecognition, installFakeRecognition } from './fakeRecognition';
import {
  LEAD_IN_ROTATE_MS,
  TRANSCRIBE_TIMEOUT_MS,
  createHybridEngine,
  plausibleRevision,
} from './hybridEngine';
import {
  isPaidTranscribeOff,
  resetPaidDictationState,
  type TranscribeSpeechCall,
} from './paidCalls';
import type {
  PaidDictationResponse,
  SpeechEngine,
  TranscribeSpeechRequest,
} from './types';

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

const rec = () => FakeRecognition.current;
const flush = () => vi.advanceTimersByTimeAsync(0);

interface Harness {
  engine: SpeechEngine;
  transcribe: ReturnType<typeof vi.fn<TranscribeSpeechCall>>;
  onInterim: ReturnType<typeof vi.fn<(text: string) => void>>;
  onFinal: ReturnType<typeof vi.fn<(text: string) => void>>;
  onRevise: ReturnType<typeof vi.fn<(phrase: number, text: string) => void>>;
  onEnd: ReturnType<typeof vi.fn<() => void>>;
}

function listen(
  answer: (
    request: TranscribeSpeechRequest
  ) => Promise<PaidDictationResponse> = () =>
    Promise.resolve({ text: 'The cat sat.' })
): Harness {
  const base = createBrowserEngine();
  if (!base) throw new Error('no browser engine');
  const transcribe = vi.fn<TranscribeSpeechCall>(answer);
  const engine = createHybridEngine(base, {
    assignmentId: 'asn-1',
    transcribe,
  });
  const harness: Harness = {
    engine,
    transcribe,
    onInterim: vi.fn<(text: string) => void>(),
    onFinal: vi.fn<(text: string) => void>(),
    onRevise: vi.fn<(phrase: number, text: string) => void>(),
    onEnd: vi.fn<() => void>(),
  };
  engine.start(
    { locale: 'en-US', language: 'en' },
    {
      onInterim: harness.onInterim,
      onFinal: harness.onFinal,
      onRevise: harness.onRevise,
      onError: vi.fn(),
      onEnd: harness.onEnd,
    }
  );
  return harness;
}

/** Speak one phrase: interim words, then the browser finalises it. */
async function say(text: string): Promise<void> {
  rec().emit([[text, false]]);
  rec().final(text);
  await flush();
}

describe('hybrid engine', () => {
  let uninstallRecognition: () => void;
  let uninstallRecorder: () => void;
  let mic: FakeMicrophone;

  beforeEach(() => {
    vi.useFakeTimers();
    resetPaidDictationState();
    uninstallRecognition = installFakeRecognition();
    ({ mic, uninstall: uninstallRecorder } = installFakeMediaRecorder());
  });

  afterEach(() => {
    uninstallRecorder();
    uninstallRecognition();
    vi.useRealTimers();
  });

  it('passes the browser text through at once, then revises it from the clip', async () => {
    const h = listen();
    await flush();
    expect(mic.calls).toBe(1);

    rec().emit([['the cat', false]]);
    expect(h.onInterim).toHaveBeenLastCalledWith('the cat');
    rec().final('the cat sat');
    expect(h.onFinal).toHaveBeenCalledWith('the cat sat');
    expect(h.onRevise).not.toHaveBeenCalled();

    await flush();
    expect(h.transcribe).toHaveBeenCalledTimes(1);
    const request = h.transcribe.mock.calls[0][0];
    expect(request).toMatchObject({
      assignmentId: 'asn-1',
      mimeType: 'audio/webm;codecs=opus',
      language: 'en',
    });
    expect(atob(request.audioBase64)).toBe('spoken words');
    expect(h.onRevise).toHaveBeenCalledWith(0, 'The cat sat.');
  });

  it('numbers revisions by phrase', async () => {
    const h = listen(() => Promise.resolve({ text: 'Heard it.' }));
    await flush();
    await say('first one');
    await say('second one');
    expect(h.onRevise.mock.calls.map((c) => c[0])).toEqual([0, 1]);
  });

  it('never sends silence', async () => {
    const h = listen();
    await flush();
    await vi.advanceTimersByTimeAsync(LEAD_IN_ROTATE_MS * 10);
    expect(h.transcribe).not.toHaveBeenCalled();
    // Idle takes are rotated out, so no long silence builds up.
    expect(FakeMediaRecorder.live.length).toBeLessThanOrEqual(2);
    expect(FakeMediaRecorder.instances.length).toBeGreaterThan(5);

    h.engine.stop();
    await flush();
    expect(h.transcribe).not.toHaveBeenCalled();
    expect(FakeMediaRecorder.live).toHaveLength(0);
    expect(mic.tracks.every((track) => track.stopped)).toBe(true);
  });

  it('keeps the browser text and stops recording after a cap fallback', async () => {
    const h = listen(() => Promise.resolve({ fallback: 'cap' }));
    await flush();
    await say('the cat sat');
    expect(h.onFinal).toHaveBeenCalledWith('the cat sat');
    expect(h.onRevise).not.toHaveBeenCalled();
    expect(isPaidTranscribeOff()).toBe(true);
    expect(FakeMediaRecorder.live).toHaveLength(0);
    expect(mic.tracks.every((track) => track.stopped)).toBe(true);

    await say('on the mat');
    expect(h.onFinal).toHaveBeenLastCalledWith('on the mat');
    expect(h.transcribe).toHaveBeenCalledTimes(1);

    // A later session on this page does not record either.
    h.engine.stop();
    const again = listen();
    await flush();
    await say('still free');
    expect(again.onFinal).toHaveBeenCalledWith('still free');
    expect(again.transcribe).not.toHaveBeenCalled();
    expect(mic.calls).toBe(1);
  });

  it('keeps recording after an error fallback or a thrown error', async () => {
    let call = 0;
    const h = listen(() => {
      call += 1;
      if (call === 1) return Promise.resolve({ fallback: 'error' });
      if (call === 2) return Promise.reject(new Error('unavailable'));
      return Promise.resolve({ text: 'Third time.' });
    });
    await flush();
    await say('one');
    await say('two');
    await say('third time');
    expect(isPaidTranscribeOff()).toBe(false);
    expect(h.onRevise).toHaveBeenCalledTimes(1);
    expect(h.onRevise).toHaveBeenCalledWith(2, 'Third time.');
  });

  it('gives up on a slow answer and keeps the browser text', async () => {
    let answer: (response: PaidDictationResponse) => void = () => undefined;
    const h = listen(
      () =>
        new Promise<PaidDictationResponse>((resolve) => {
          answer = resolve;
        })
    );
    await flush();
    await say('the cat sat');
    expect(h.transcribe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(TRANSCRIBE_TIMEOUT_MS + 1);
    answer({ text: 'Too late.' });
    await flush();
    expect(h.onRevise).not.toHaveBeenCalled();
    expect(isPaidTranscribeOff()).toBe(false);
  });

  it('does not send a phrase longer than the clip limit', async () => {
    const h = listen();
    await flush();
    rec().emit([['a very long', false]]);
    await vi.advanceTimersByTimeAsync((SPEECH_CLIP_MAX_SECONDS + 2) * 1_000);
    rec().final('a very long phrase');
    await flush();
    expect(h.onFinal).toHaveBeenCalledWith('a very long phrase');
    expect(h.transcribe).not.toHaveBeenCalled();
    // The next phrase is recorded as usual.
    await say('short one');
    expect(h.transcribe).toHaveBeenCalledTimes(1);
  });

  it('drops an answer that is nothing like what the browser heard', async () => {
    const h = listen(() => Promise.resolve({ text: 'Cat.' }));
    await flush();
    await say('the cat sat on the mat by the door');
    expect(h.onRevise).not.toHaveBeenCalled();
  });

  it('drops answers still on their way after abort', async () => {
    let answer: (response: PaidDictationResponse) => void = () => undefined;
    const h = listen(
      () =>
        new Promise<PaidDictationResponse>((resolve) => {
          answer = resolve;
        })
    );
    await flush();
    await say('the cat sat');
    h.engine.abort();
    answer({ text: 'The cat sat.' });
    await flush();
    expect(h.onRevise).not.toHaveBeenCalled();
    expect(h.onEnd).toHaveBeenCalledTimes(1);
  });

  it('still revises the last phrase after the student stops', async () => {
    const h = listen();
    await flush();
    rec().emit([['the cat sat', false]]);
    h.engine.stop();
    await flush();
    expect(h.onFinal).toHaveBeenCalledWith('the cat sat');
    expect(h.onEnd).toHaveBeenCalledTimes(1);
    expect(h.onRevise).toHaveBeenCalledWith(0, 'The cat sat.');
    expect(mic.tracks.every((track) => track.stopped)).toBe(true);
  });

  it('runs as the browser engine when the microphone cannot be opened twice', async () => {
    mic.deny = true;
    const h = listen();
    await flush();
    await say('the cat sat');
    expect(h.onFinal).toHaveBeenCalledWith('the cat sat');
    expect(h.transcribe).not.toHaveBeenCalled();
    expect(FakeMediaRecorder.instances).toHaveLength(0);
  });
});

describe('hybrid engine without MediaRecorder', () => {
  let uninstallRecognition: () => void;
  let uninstallRecorder: () => void;
  let mic: FakeMicrophone;

  beforeEach(() => {
    vi.useFakeTimers();
    resetPaidDictationState();
    uninstallRecognition = installFakeRecognition();
    ({ mic, uninstall: uninstallRecorder } = installFakeMediaRecorder({
      recorder: false,
    }));
  });

  afterEach(() => {
    uninstallRecorder();
    uninstallRecognition();
    vi.useRealTimers();
  });

  it('degrades to the browser engine', async () => {
    const h = listen();
    await flush();
    rec().emit([['the cat', false]]);
    expect(h.onInterim).toHaveBeenLastCalledWith('the cat');
    rec().final('the cat sat');
    await flush();
    expect(h.onFinal).toHaveBeenCalledWith('the cat sat');
    expect(mic.calls).toBe(0);
    expect(h.transcribe).not.toHaveBeenCalled();
    h.engine.stop();
    expect(h.onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('plausibleRevision', () => {
  it('accepts a close transcript and rejects an empty or runaway one', () => {
    expect(plausibleRevision('the cat sat', 'The cat sat.')).toBe(true);
    expect(plausibleRevision('hi', 'Hi there, friend.')).toBe(true);
    expect(plausibleRevision('the cat sat', '')).toBe(false);
    expect(plausibleRevision('a b c d e f', 'A.')).toBe(false);
    expect(
      plausibleRevision('hi', 'one two three four five six seven eight nine')
    ).toBe(false);
  });
});
