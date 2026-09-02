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

  it('states the slot count as a neutral fact', () => {
    const lines = buildQuizAuthoringAdvisory(
      {
        questions: [
          question({ recording: recording() }),
          question(),
          question({ recording: recording() }),
        ],
      },
      t
    );
    const slots = lines.find((l) => l.id === 'recording-slots');
    expect(slots?.text).toBe('Records up to 2 slots per student.');
  });

  it('singularises one slot', () => {
    const lines = buildQuizAuthoringAdvisory(
      { questions: [question({ recording: recording() })] },
      t
    );
    expect(lines.find((l) => l.id === 'recording-slots')?.text).toBe(
      'Records up to 1 slot per student.'
    );
  });

  it('never estimates bytes or suggests a take limit', () => {
    const lines = buildQuizAuthoringAdvisory(
      { questions: [question({ recording: recording() })] },
      t
    );
    const all = lines.map((l) => l.text).join(' ');
    expect(all).not.toMatch(/\b(MB|KB|GB|megabyte)\b/i);
    expect(all).not.toMatch(/take limit|limit the takes|cap the takes/i);
  });

  it('uses RR-07 wording verbatim for the device-blocked line', () => {
    const lines = buildQuizAuthoringAdvisory(
      { questions: [question({ recording: recording() })] },
      t
    );
    const blocked = lines.find((l) => l.id === 'device-blocked');
    expect(blocked?.text).toBe(
      "If a student's device blocks the microphone, the question comes to you ungraded — you choose whether it's excused, scored zero, or answered another way."
    );
  });

  it('never says "skip" and never promises a text alternative', () => {
    const lines = buildQuizAuthoringAdvisory(
      { questions: [question({ recording: recording() })] },
      t
    );
    const all = lines.map((l) => l.text).join(' ');
    expect(all.toLowerCase()).not.toContain('skip');
    expect(all).not.toMatch(/type (it|their answer)|written alternative/i);
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

  it('never emits a district video-gate line — no client signal exists', () => {
    const lines = buildQuizAuthoringAdvisory(
      { questions: [question({ recording: recording() })] },
      t
    );
    expect(lines.map((l) => l.id)).toEqual([
      'recording-slots',
      'device-blocked',
    ]);
  });
});
