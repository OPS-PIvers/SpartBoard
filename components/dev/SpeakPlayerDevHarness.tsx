// DEV-only: the Flashcards Speak player with a scripted recognizer at /speak-player-dev, for screenshots.
// Query: take=exact|accepted|wrong|unclear, state=ready|idle|needs-download|downloading|starting|<unsupported reason>, w, h.

import React, { useState } from 'react';
import type { FlashcardCard, FlashcardSpeakReference } from '@/types';
import { setRecognizerForTests } from '@/utils/pronunciation/recognizer';
import type { RecognizerState } from '@/utils/pronunciation/recognizer';
import { LocalFlashcardAdapter } from '@/components/flashcards/adapters';
import {
  FlashcardPlayer,
  type FlashcardPlayerSpeak,
} from '@/components/flashcards/FlashcardPlayer';
import {
  createFakeRecognizer,
  type FakeTake,
} from '@/components/flashcards/speak/fakeRecognizer';

const ref = (
  tokens: string[],
  letterSpans: number[],
  stress: number[] = []
): FlashcardSpeakReference => ({
  dialect: 'es-419',
  tokens,
  stress,
  letterSpans,
});

const card = (
  id: string,
  term: string,
  definition: string,
  refs: FlashcardSpeakReference[]
): FlashcardCard => ({
  id,
  term,
  definition,
  speak: { term, refs, g2pVersion: 'dev', status: 'ready' },
});

const CARDS: FlashcardCard[] = [
  card('perro', 'perro', 'dog', [
    ref(['p', 'e', 'r', 'o'], [0, 1, 1, 2, 2, 4, 4, 5], [0]),
  ]),
  card('casa', 'casa', 'house', [
    ref(['k', 'a', 's', 'a'], [0, 1, 1, 2, 2, 3, 3, 4], [0]),
  ]),
  card('hola', 'hola', 'hello', [ref(['o', 'l', 'a'], [1, 2, 2, 3, 3, 4])]),
];

const TAKES: Record<string, FakeTake> = {
  exact: { tokens: ['p', 'e', 'r', 'o'] },
  accepted: { tokens: ['p', 'e', 'ɾ', 'o'] },
  wrong: { tokens: ['b', 'a', 'r', 'u'] },
  extra: { tokens: ['p', 'e', 'r', 'o', 's'] },
  unclear: { tokens: [] },
};

const SPEAK: FlashcardPlayerSpeak = {
  dialects: ['es-419'],
  preset: 'beginner',
  strict: false,
  groups: { 'es-trill': 'forgive' },
  attempts: 3,
  example: true,
};

const UNSUPPORTED = new Set([
  'no-wasm',
  'no-worker',
  'download-failed',
  'integrity',
  'too-slow',
]);

const readState = (value: string | null): RecognizerState => {
  if (value === 'idle') return { kind: 'idle' };
  if (value === 'starting') return { kind: 'starting' };
  if (value === 'needs-download')
    return { kind: 'needs-download', bytes: 241_430_967 };
  if (value === 'downloading')
    return { kind: 'downloading', loaded: 98_000_000, total: 241_430_967 };
  if (value && UNSUPPORTED.has(value))
    return {
      kind: 'unsupported',
      reason: value as Extract<
        RecognizerState,
        { kind: 'unsupported' }
      >['reason'],
    };
  return { kind: 'ready' };
};

export const SpeakPlayerDevHarness: React.FC = () => {
  const [setup] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const fake = createFakeRecognizer(readState(params.get('state')));
    fake.queue(TAKES[params.get('take') ?? 'exact'] ?? TAKES.exact);
    setRecognizerForTests(fake);
    return {
      width: Number(params.get('w')) || 900,
      height: Number(params.get('h')) || 640,
      locked: params.get('locked') === '1',
      framed: params.get('framed') === '1',
    };
  });
  const [adapter] = useState(
    () => new LocalFlashcardAdapter(`speak-dev-${Date.now()}`)
  );
  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-100 p-4">
      <div
        className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow"
        style={{ width: setup.width, height: setup.height }}
      >
        <FlashcardPlayer
          cards={CARDS}
          termLanguage="es-MX"
          definitionLanguage="en-US"
          adapter={adapter}
          speak={{ ...SPEAK, locked: setup.locked }}
          framed={setup.framed}
          allowedModes={['flashcards', 'write', 'test', 'speak']}
        />
      </div>
    </div>
  );
};
