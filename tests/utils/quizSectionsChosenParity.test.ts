import { describe, expect, it } from 'vitest';
import { isSectionAnswered, notChosenQuestionIds } from '@/utils/quizSections';
import {
  hasContent,
  notChosenIds,
  parseChooseSections,
} from '@/functions/src/quizSectionsChosen';
import { parseCompletedResponse } from '@/functions/src/recomputePlcAssessments';
import type { QuizResponseAnswer, QuizSessionSection } from '@/types';

type Answer = Pick<
  QuizResponseAnswer,
  'questionId' | 'answer' | 'unresponded' | 'artifacts' | 'paperTranscript'
>;

const artifact = (
  uploadState: 'pending' | 'uploaded' | 'failed'
): NonNullable<QuizResponseAnswer['artifacts']>[number] =>
  ({ id: 'a', kind: 'audio', uploadState }) as NonNullable<
    QuizResponseAnswer['artifacts']
  >[number];

// Every shape that decides whether a choose-N question holds an answer.
const answerCases: { name: string; answer: Answer }[] = [
  { name: 'text', answer: { questionId: 'q', answer: 'x' } },
  { name: 'empty', answer: { questionId: 'q', answer: '' } },
  { name: 'whitespace', answer: { questionId: 'q', answer: '   ' } },
  { name: 'tags only', answer: { questionId: 'q', answer: '<p><br></p>' } },
  {
    name: 'nested split tags',
    answer: { questionId: 'q', answer: '<<b>p>' },
  },
  {
    name: 'unresponded with text',
    answer: { questionId: 'q', answer: 'x', unresponded: true },
  },
  {
    name: 'recording only',
    answer: { questionId: 'q', answer: '', artifacts: [artifact('uploaded')] },
  },
  {
    name: 'recording still uploading',
    answer: { questionId: 'q', answer: '', artifacts: [artifact('pending')] },
  },
  {
    name: 'failed recording',
    answer: { questionId: 'q', answer: '', artifacts: [artifact('failed')] },
  },
  {
    name: 'failed then good recording',
    answer: {
      questionId: 'q',
      answer: '',
      artifacts: [artifact('failed'), artifact('uploaded')],
    },
  },
  {
    name: 'empty artifact list',
    answer: { questionId: 'q', answer: '', artifacts: [] },
  },
  {
    name: 'recording but unresponded',
    answer: {
      questionId: 'q',
      answer: '',
      artifacts: [artifact('uploaded')],
      unresponded: true,
    },
  },
  {
    name: 'blank paper box with a crop',
    answer: {
      questionId: 'q',
      answer: '',
      paperTranscript: 'blank',
      artifacts: [artifact('uploaded')],
    },
  },
  {
    name: 'blank paper box with stray text',
    answer: { questionId: 'q', answer: 'x', paperTranscript: 'blank' },
  },
  {
    name: 'paper box kept as an image',
    answer: {
      questionId: 'q',
      answer: '',
      paperTranscript: 'image',
      artifacts: [artifact('uploaded')],
    },
  },
  {
    name: 'paper box in transcription',
    answer: {
      questionId: 'q',
      answer: '',
      paperTranscript: 'pending',
      artifacts: [artifact('uploaded')],
    },
  },
  {
    name: 'transcribed paper answer',
    answer: { questionId: 'q', answer: 'x', paperTranscript: 'done' },
  },
];

const sections: QuizSessionSection[] = [
  { id: 's1', title: 'Part A', chooseCount: 1, questionIds: ['a', 'b', 'c'] },
  { id: 's2', title: 'Part B', chooseCount: 2, questionIds: ['d', 'e', 'f'] },
];

describe('choose-N answered: client and server agree', () => {
  it.each(answerCases)('$name', ({ answer }) => {
    expect(hasContent(answer)).toBe(isSectionAnswered([answer], 'q'));
  });

  it.each(answerCases)('$name after the PLC/gradebook parse', ({ answer }) => {
    const parsed = parseCompletedResponse({
      studentUid: 'u',
      answers: [answer],
    }).answers;
    expect(parsed.some(hasContent)).toBe(isSectionAnswered([answer], 'q'));
  });

  it.each(answerCases)('$name decides the same counted questions', (c) => {
    // The case's answer sits on the last question of each section, so it counts only when answered.
    const answers = ['c', 'f'].map((questionId) => ({
      ...c.answer,
      questionId,
    }));
    const client = notChosenQuestionIds(
      { answers, status: 'completed' },
      sections
    );
    const server = notChosenIds(parseChooseSections(sections), answers);
    expect([...server].sort()).toEqual([...client].sort());
    const parsed = parseCompletedResponse({ studentUid: 'u', answers }).answers;
    expect(
      [...notChosenIds(parseChooseSections(sections), parsed)].sort()
    ).toEqual([...client].sort());
  });
});
