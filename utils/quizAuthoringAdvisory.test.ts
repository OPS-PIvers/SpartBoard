import { describe, it, expect } from 'vitest';
import i18n from '@/i18n';
import { buildQuizAuthoringAdvisory } from './quizAuthoringAdvisory';
import { DEFAULT_RECORDING_CONFIG } from '@/config/quizRecordingDefaults';
import type { QuizQuestion } from '@/types';

const t = (key: string, params?: Record<string, unknown>): string =>
  i18n.t(key, params);

const question = (over: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: crypto.randomUUID(),
  timeLimit: 0,
  text: 'Q',
  type: 'MC',
  correctAnswer: 'a',
  incorrectAnswers: ['b'],
  ...over,
});

const recording = () => ({ ...DEFAULT_RECORDING_CONFIG });

describe('buildQuizAuthoringAdvisory', () => {
  it('returns nothing for a quiz that predates media responses', () => {
    const lines = buildQuizAuthoringAdvisory(
      { questions: [question(), question()] },
      t
    );
    expect(lines).toEqual([]);
  });

  it('adds nothing for a spoken question on its own', () => {
    const lines = buildQuizAuthoringAdvisory(
      { questions: [question({ recording: recording() })] },
      t
    );
    expect(lines).toEqual([]);
  });

  it('omits the shuffle line when shuffle is off', () => {
    const lines = buildQuizAuthoringAdvisory(
      {
        questions: [
          question({ stimulusIds: ['s1'] }),
          question({ stimulusIds: ['s1'] }),
        ],
        shuffleQuestionsEnabled: false,
      },
      t
    );
    expect(lines.find((l) => l.id === 'shuffle-noop')).toBeUndefined();
  });

  it('flags shuffle as a no-op when one stimulus unit covers the quiz', () => {
    const lines = buildQuizAuthoringAdvisory(
      {
        questions: [
          question({ stimulusIds: ['s1'] }),
          question({ stimulusIds: ['s1'] }),
        ],
        shuffleQuestionsEnabled: true,
      },
      t
    );
    expect(lines.find((l) => l.id === 'shuffle-noop')).toBeTruthy();
  });

  it('leaves shuffle alone when the questions still form two units', () => {
    const lines = buildQuizAuthoringAdvisory(
      {
        questions: [question({ stimulusIds: ['s1'] }), question()],
        shuffleQuestionsEnabled: true,
      },
      t
    );
    expect(lines.find((l) => l.id === 'shuffle-noop')).toBeUndefined();
  });
});
