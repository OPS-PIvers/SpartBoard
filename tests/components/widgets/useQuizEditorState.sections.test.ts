/** Section rows in the quiz editor (docs/plans/QUIZ_EXAMVIEW_IMPORT.md E12). */
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { QuizData, QuizQuestion } from '@/types';
import { useQuizEditorState } from '@/components/widgets/QuizWidget/components/useQuizEditorState';
import { buildPaperTestHtml } from '@/utils/paperTestPrint';
import {
  chooseLineFor,
  overAnsweredSections,
  sectionQuestionCounts,
} from '@/utils/quizSections';

const question = (id: string): QuizQuestion => ({
  id,
  timeLimit: 0,
  text: id,
  type: 'MC',
  correctAnswer: 'a',
  incorrectAnswers: ['b'],
});

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Quiz',
  questions: [question('q1'), question('q2'), question('q3')],
  createdAt: 1,
  updatedAt: 1,
};

const rows = (r: { current: { order: { kind: string; id: string }[] } }) =>
  r.current.order.map((e) => e.kind);

describe('useQuizEditorState sections', () => {
  it('inserts a section above the selected question and removes only the heading', () => {
    const { result } = renderHook(() => useQuizEditorState({ quiz }));
    act(() => result.current.setSelectedId('q2'));
    act(() => result.current.addSection());
    expect(rows(result)).toEqual([
      'question',
      'section',
      'question',
      'question',
    ]);
    const id = result.current.sections[0].id;

    act(() =>
      result.current.updateSection(id, {
        title: 'Short Answer',
        chooseCount: 1,
      })
    );
    expect(result.current.sections[0]).toMatchObject({
      title: 'Short Answer',
      chooseCount: 1,
    });
    act(() => result.current.updateSection(id, { chooseCount: undefined }));
    expect('chooseCount' in result.current.sections[0]).toBe(false);

    act(() => result.current.removeSection(id));
    expect(result.current.sections).toEqual([]);
    expect(rows(result)).toEqual(['question', 'question', 'question']);
  });

  it('loads a quiz’s sections with their order rows', () => {
    const withSection: QuizData = {
      ...quiz,
      sections: [{ id: 's1', title: 'Part 2', chooseCount: 1 }],
      order: [
        { kind: 'question', id: 'q1' },
        { kind: 'section', id: 's1' },
        { kind: 'question', id: 'q2' },
        { kind: 'question', id: 'q3' },
      ],
    };
    const { result } = renderHook(() =>
      useQuizEditorState({ quiz: withSection })
    );
    expect(rows(result)).toEqual([
      'question',
      'section',
      'question',
      'question',
    ]);
    expect(result.current.sections).toEqual(withSection.sections);
  });
});

describe('sectionQuestionCounts', () => {
  it('counts each section’s questions and bank draws up to the next section', () => {
    const counts = sectionQuestionCounts(
      [
        { kind: 'question', id: 'q1' },
        { kind: 'section', id: 'a' },
        { kind: 'question', id: 'q2' },
        { kind: 'slot', id: 'slot' },
        { kind: 'section', id: 'b' },
      ],
      new Map([['slot', 3]])
    );
    expect(counts).toEqual(
      new Map([
        ['a', 4],
        ['b', 0],
      ])
    );
  });
});

describe('paper (E15)', () => {
  const section = {
    id: 's',
    title: 'Short Answer',
    chooseCount: 2,
    questionIds: ['q1', 'q2', 'q3'],
  };

  it('prints the heading and the count above the section’s first question', () => {
    const html = buildPaperTestHtml({
      quizTitle: 'Quiz',
      questions: [
        {
          row: 1,
          text: 'First?',
          choices: ['yes', 'no'],
          section: {
            title: 'Short Answer',
            chooseLine: chooseLineFor(section) ?? undefined,
          },
        },
      ],
    });
    expect(html).toContain('<h2>Short Answer</h2>');
    expect(html).toContain('Answer any 2 of these 3 questions.');
  });

  it('flags a sheet that answered more than N', () => {
    expect(
      overAnsweredSections([section], new Set(['q1', 'q2', 'q3']))
    ).toEqual([{ section, answered: 3 }]);
    expect(overAnsweredSections([section], new Set(['q1', 'q2']))).toEqual([]);
  });
});
