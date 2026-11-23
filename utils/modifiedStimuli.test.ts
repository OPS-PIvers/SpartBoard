import { describe, expect, it } from 'vitest';
import type { QuizQuestion, QuizStimulus } from '@/types';
import {
  projectSessionStimuli,
  questionsUsingModifiedStimulus,
  readAloudTextByStimulusId,
  sanitizeStimulusPointers,
} from './quizStimuli';
import { stimulusIdsForResponse } from './rubricOverrideResolution';
import { copyBankQuestions } from './questionBanks';

const stim = (id: string, text = ''): QuizStimulus => ({
  id,
  type: 'text',
  url: '',
  label: id,
  text,
});
const question = (patch: Partial<QuizQuestion>): QuizQuestion => ({
  id: 'q1',
  type: 'MC',
  text: 'Q',
  correctAnswer: 'A',
  incorrectAnswers: ['B'],
  timeLimit: 0,
  ...patch,
});

describe('modified stimuli', () => {
  it('projects a stimulus used only by a modified version onto the session', () => {
    const quiz = {
      questions: [
        question({ stimulusIds: ['s1'], modifiedStimulusIds: ['s2'] }),
      ],
      stimuli: [stim('s1', 'one'), stim('s2', 'two'), stim('s3', 'three')],
    };
    expect(projectSessionStimuli(quiz).map((s) => s.id)).toEqual(['s1', 's2']);
    expect(readAloudTextByStimulusId(quiz)).toEqual({ s1: 'one', s2: 'two' });
  });

  it('drops modified pointers to deleted stimuli', () => {
    const qs = [question({ modifiedStimulusIds: ['gone', 's1'] })];
    expect(
      sanitizeStimulusPointers(qs, [stim('s1')])[0].modifiedStimulusIds
    ).toEqual(['s1']);
    const out = sanitizeStimulusPointers(
      [question({ modifiedStimulusIds: ['gone'] })],
      [stim('s1')]
    );
    expect(out[0].modifiedStimulusIds).toBeUndefined();
  });

  it('lists questions whose modified version uses a stimulus', () => {
    const qs = [
      question({ stimulusIds: ['s1'] }),
      question({ id: 'q2', modifiedStimulusIds: ['s1'] }),
    ];
    expect(questionsUsingModifiedStimulus(qs, 's1')).toEqual([1]);
  });

  it('gives the grader the stimuli this student saw', () => {
    const q = { stimulusIds: ['s1'], modifiedStimulusIds: ['s2'] };
    const refs = new Map([
      ['uid-mod', 'ref-mod'],
      ['uid-plain', 'ref-plain'],
    ]);
    const overrides = { 'ref-mod': { modifiedQuestions: true } };
    expect(stimulusIdsForResponse(q, 'uid-mod', overrides, refs)).toEqual([
      's2',
    ]);
    expect(stimulusIdsForResponse(q, 'uid-plain', overrides, refs)).toEqual([
      's1',
    ]);
    expect(stimulusIdsForResponse(q, undefined, overrides, refs)).toEqual([
      's1',
    ]);
    expect(
      stimulusIdsForResponse(
        { stimulusIds: ['s1'] },
        'uid-mod',
        overrides,
        refs
      )
    ).toEqual(['s1']);
  });

  it('copies a bank question with its modified stimuli', () => {
    let n = 0;
    const { questions, stimuli } = copyBankQuestions(
      {
        questions: [
          question({ stimulusIds: ['s1'], modifiedStimulusIds: ['s2', 's1'] }),
        ],
        stimuli: [stim('s1'), stim('s2')],
      } as unknown as Parameters<typeof copyBankQuestions>[0],
      ['q1'],
      () => `new-${++n}`
    );
    const [q] = questions;
    expect(q.stimulusIds).toHaveLength(1);
    expect(q.modifiedStimulusIds).toHaveLength(2);
    expect(q.modifiedStimulusIds?.[1]).toBe(q.stimulusIds?.[0]);
    expect(stimuli).toHaveLength(2);
  });
});
