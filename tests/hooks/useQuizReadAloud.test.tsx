/**
 * Locale-aware read-aloud playback: switching the language chip mid-playback must
 * stop the audio, and a passage speaker stays English on a translated view.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { QuizPublicQuestion, QuizReadAloudManifest } from '@/types';

vi.mock('@/utils/quizReadAloudApi', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/quizReadAloudApi')>();
  return {
    ...actual,
    synthesizeQuizAudio: vi.fn(),
    resolveReadAloudUrl: vi.fn(() => Promise.resolve('blob:audio')),
  };
});

import { synthesizeQuizAudio } from '@/utils/quizReadAloudApi';
import { useQuizReadAloud } from '@/components/quiz/readAloud/useQuizReadAloud';

const QUESTION: QuizPublicQuestion = {
  id: 'q1',
  type: 'MC',
  text: 'What is 2 + 2?',
  timeLimit: 0,
  choices: ['3', '4'],
  stimulusIds: ['img'],
  localized: { es: { text: '¿Cuánto es 2 + 2?', choices: ['3', '4'] } },
};

const MANIFEST: QuizReadAloudManifest = {
  status: 'ready',
  voice: 'en-US-Neural2-F',
  files: { 'q:q1:question': 'en.mp3' },
  localized: {
    es: { voice: 'es-US-Neural2-A', files: { 'q:q1:question': 'es.mp3' } },
  },
};

const noop = () => undefined;

const args = (locale?: string) => ({
  enabled: true,
  sessionId: 's1',
  manifest: MANIFEST,
  canonicalQuestions: [QUESTION],
  question: QUESTION,
  nextQuestion: undefined,
  stimulusTextById: { img: 'A sign reads STOP.' },
  locale,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(noop);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(noop);
});

describe('useQuizReadAloud - locale', () => {
  it('stops playback when the language chip flips mid-read', async () => {
    const { result, rerender } = renderHook((locale?: string) =>
      useQuizReadAloud(args(locale))
    );
    act(() => result.current.play({ kind: 'question' }));
    await waitFor(() => expect(result.current.playingPart).not.toBeNull());
    rerender(undefined);
    expect(result.current.playingPart).not.toBeNull();
    rerender('es');
    await waitFor(() => expect(result.current.playingPart).toBeNull());
  });

  it('keeps the English passage speaker on a translated view', async () => {
    const { result } = renderHook(() => useQuizReadAloud(args('es')));
    expect(result.current.stimulusText('img')).toBe('A sign reads STOP.');
    act(() => result.current.play({ kind: 'stimulus', stimulusId: 'img' }));
    await waitFor(() => expect(synthesizeQuizAudio).toHaveBeenCalled());
    expect(vi.mocked(synthesizeQuizAudio).mock.calls[0][0]).not.toHaveProperty(
      'locale'
    );
  });

  it('asks for the locale on a question part', async () => {
    const manifest = { ...MANIFEST, localized: undefined };
    const { result } = renderHook(() =>
      useQuizReadAloud({ ...args('es'), manifest })
    );
    act(() => result.current.play({ kind: 'question' }));
    await waitFor(() => expect(synthesizeQuizAudio).toHaveBeenCalled());
    expect(vi.mocked(synthesizeQuizAudio).mock.calls[0][0]).toMatchObject({
      locale: 'es',
    });
  });
});
