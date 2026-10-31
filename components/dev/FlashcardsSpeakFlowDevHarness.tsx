// Flashcards Speak end to end at /flashcards-speak-dev (also in auth-bypass E2E builds): teacher stamp, student practice aloud, teacher's Speaking view.
// The recognizer is scripted: each take says the word on screen exactly, so tests/e2e/flashcards-speak.spec.ts can practise to mastery.

import React, { useMemo, useState } from 'react';
import type {
  FlashcardCard,
  FlashcardSession,
  FlashcardSet,
  FlashcardSpeakReference,
} from '@/types';
import { normalizeFlashcardsSpeakAdminConfig } from '@/config/flashcardsSpeakAdmin';
import {
  buildSpeakStamp,
  speakCardsFor,
} from '@/components/widgets/Flashcards/utils/flashcardAssign';
import { setRecognizerForTests } from '@/utils/pronunciation/recognizer';
import { LocalFlashcardAdapter } from '@/components/flashcards/adapters';
import { FlashcardPlayer } from '@/components/flashcards/FlashcardPlayer';
import { createFakeRecognizer } from '@/components/flashcards/speak/fakeRecognizer';
import { FlashcardStudyResults } from '@/components/widgets/Flashcards/results/FlashcardStudyResults';

const ref = (
  tokens: string[],
  letterSpans: number[],
  stress: number[]
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
  reference: FlashcardSpeakReference
): FlashcardCard => ({
  id,
  term,
  definition,
  speak: { term, refs: [reference], g2pVersion: 'dev', status: 'ready' },
});

const SET: FlashcardSet = {
  id: 'speak-flow',
  title: 'Animales',
  termLanguage: 'es-MX',
  definitionLanguage: 'en-US',
  cards: [
    card(
      'perro',
      'perro',
      'dog',
      ref(['p', 'e', 'r', 'o'], [0, 1, 1, 2, 2, 4, 4, 5], [0])
    ),
    card(
      'casa',
      'casa',
      'house',
      ref(['k', 'a', 's', 'a'], [0, 1, 1, 2, 2, 3, 3, 4], [0])
    ),
  ],
  speak: {
    dialects: ['es-419'],
    preset: 'beginner',
    strict: false,
    groups: {},
    attempts: 2,
    example: false,
  },
  createdAt: 0,
  updatedAt: 0,
};

// The district settings the teacher's save reads (admin_settings/flashcardsSpeak).
const ADMIN_CONFIG = normalizeFlashcardsSpeakAdminConfig({
  attempts: 3,
  unclearConfidence: 0.5,
});

// One second of a voiced vowel-like tone, so stress measuring runs on real samples.
const takeAudio = (): Float32Array =>
  Float32Array.from({ length: 16000 }, (_, i) => {
    const envelope = Math.sin((Math.PI * i) / 16000);
    return 0.4 * envelope * Math.sin((2 * Math.PI * 180 * i) / 16000);
  });

const tokensFor = (word: string): string[] =>
  SET.cards.find((c) => c.term === word)?.speak?.refs[0].tokens ?? [];

export const FlashcardsSpeakFlowDevHarness: React.FC = () => {
  const [view, setView] = useState<'student' | 'teacher'>('student');
  const [adapter] = useState(() => {
    const fake = createFakeRecognizer();
    setRecognizerForTests({
      ...fake,
      recognize(audio) {
        const word = document.querySelector('h2[lang]')?.textContent ?? '';
        fake.queue({ tokens: tokensFor(word), audio16k: takeAudio() });
        return fake.recognize(audio);
      },
    });
    return new LocalFlashcardAdapter(`speak-flow-${Date.now()}`);
  });
  // The same stamp a Study assignment saved with "Lock Speak settings" carries.
  const stamp = useMemo(
    () => buildSpeakStamp(SET, true, ADMIN_CONFIG, true),
    []
  );
  const session: FlashcardSession = useMemo(
    () => ({
      id: 'speak-flow-session',
      teacherUid: 'teacher-1',
      setId: SET.id,
      title: SET.title,
      kind: 'study',
      termLanguage: SET.termLanguage,
      definitionLanguage: SET.definitionLanguage,
      cards: speakCardsFor(SET.cards, stamp),
      ...(stamp ? { speak: stamp } : {}),
      classIds: ['class-1'],
      classId: 'class-1',
      status: 'active',
      createdAt: 0,
    }),
    [stamp]
  );
  const study = view === 'teacher' ? adapter.load() : null;

  return (
    <div className="flex h-screen h-dvh flex-col items-center gap-3 overflow-y-auto bg-slate-100 p-4 pb-8">
      <div className="flex gap-2">
        {/* no-tour-anchor: dev harness switch */}
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold"
          onClick={() => setView('student')}
        >
          Student
        </button>
        {/* no-tour-anchor: dev harness switch */}
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold"
          onClick={() => setView('teacher')}
        >
          Teacher
        </button>
      </div>
      <div
        className="w-full max-w-[900px] shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        style={{ height: 640, containerType: 'size' }}
      >
        {view === 'student' ? (
          <FlashcardPlayer
            cards={session.cards}
            termLanguage={session.termLanguage}
            definitionLanguage={session.definitionLanguage}
            adapter={adapter}
            speak={session.speak}
            allowedModes={['flashcards', 'write', 'test', 'speak']}
          />
        ) : (
          <div className="h-full overflow-y-auto pb-4">
            <FlashcardStudyResults
              session={session}
              results={[
                {
                  studentUid: 'student-1',
                  cards: study?.cards,
                  speak: study?.speak,
                  speakSounds: study?.speakSounds,
                  modesUsed: ['speak'],
                  lastActiveAt: 1,
                },
              ]}
              tests={{}}
              nameFor={() => 'Ana Student'}
              onResetStudent={() => undefined}
              now={2}
              speakLanguage="es"
            />
          </div>
        )}
      </div>
    </div>
  );
};
