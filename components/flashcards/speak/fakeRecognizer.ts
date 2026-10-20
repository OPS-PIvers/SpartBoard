// A scripted recognizer for tests and the DEV harness; never loaded by the app itself.
import type {
  RecognizeResult,
  Recognizer,
  RecognizerState,
} from '@/utils/pronunciation/recognizer';

export interface FakeTake {
  tokens: string[];
  confidence?: number;
  voicedMs?: number;
  audio16k?: Float32Array;
}

export interface FakeRecognizer extends Recognizer {
  setState: (state: RecognizerState) => void;
  /** Takes answered in order; the last one repeats. */
  queue: (...takes: FakeTake[]) => void;
  readonly heard: number;
}

export const toResult = (take: FakeTake): RecognizeResult => ({
  tokens: take.tokens.map((symbol, index) => ({
    symbol,
    startFrame: index * 4,
    endFrame: index * 4 + 3,
  })),
  confidence: take.confidence ?? 0.9,
  voicedMs: take.voicedMs ?? 800,
  audio16k: take.audio16k ?? new Float32Array(0),
  decodeMs: 5,
});

export function createFakeRecognizer(
  initial: RecognizerState = { kind: 'ready' },
  onPrepare: (fake: FakeRecognizer) => void = (fake) =>
    fake.setState({ kind: 'ready' })
): FakeRecognizer {
  let current = initial;
  let takes: FakeTake[] = [];
  let heard = 0;
  const listeners = new Set<(s: RecognizerState) => void>();
  const fake: FakeRecognizer = {
    state: () => current,
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    prepare() {
      onPrepare(fake);
      return Promise.resolve();
    },
    recognize() {
      const take = takes.length > 1 ? takes.shift() : takes[0];
      heard += 1;
      return Promise.resolve(toResult(take ?? { tokens: [] }));
    },
    setState(next) {
      current = next;
      for (const cb of listeners) cb(next);
    },
    queue(...next) {
      takes = next;
    },
    get heard() {
      return heard;
    },
  };
  return fake;
}
