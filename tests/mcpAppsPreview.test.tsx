import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QuizPreviewCard } from '@/mcpApps/quizPreview/QuizPreviewCard';
import {
  MAX_ASK,
  cleanMessage,
  criterionMessage,
  questionMessage,
  rubricDraftMessage,
  wholeQuizMessage,
  wholeRubricMessage,
} from '@/mcpApps/quizPreview/messages';
import { isNewer } from '@/mcpApps/quizPreview/supersede';
import { RubricCard } from '@/mcpApps/quizPreview/RubricCard';
import type {
  QuestionView,
  QuizView,
  RubricView,
} from '@/mcpApps/quizPreview/types';

const question = (n: number): QuestionView => ({
  n,
  id: `q${n}`,
  type: 'multiple_choice',
  text: `Question ${n}`,
  points: 1,
  changed: false,
  correct_answer: 'Right',
  incorrect_answers: ['Wrong'],
  rubric: null,
});

const quiz = (extra: Partial<QuizView> = {}): QuizView => ({
  view: 'quiz',
  kind: 'quiz',
  id: 'abc',
  title: 'Cells',
  shared_with_plc: false,
  updated_at: 10,
  total_points: 2,
  missing_answer_keys: 0,
  sections: 0,
  passages: 0,
  bank_pulls: 0,
  removed_questions: 0,
  open_url: 'https://spartboard.web.app',
  questions: [question(1), question(2)],
  quiz: {
    id: 'abc',
    title: 'Cells',
    questions: [],
    createdAt: 1,
    updatedAt: 10,
  },
  behavior: null,
  ...extra,
});

const rubric: RubricView = {
  view: 'rubric',
  rubric_id: 'r1',
  updated_at: 3,
  open_url: 'https://spartboard.web.app',
  title: 'CER',
  description: '',
  max_points: 6,
  criteria: ['Claim', 'Evidence'].map((name) => ({
    name,
    description: '',
    examples: [],
    levels: [
      { label: 'Low', points: 1, description: 'Missing.' },
      { label: 'High', points: 3, description: 'Complete.' },
    ],
  })),
};

describe('preview card messages', () => {
  it('names the quiz and question so Claude can find them', () => {
    expect(questionMessage(quiz(), question(2), '  harder  ')).toBe(
      'From the preview card: in the quiz "Cells" (quiz_id abc), change question 2: harder'
    );
    expect(wholeQuizMessage(quiz({ kind: 'bank' }), 'shorter')).toBe(
      'From the preview card: change the question bank "Cells" (bank_id abc): shorter'
    );
    expect(rubricDraftMessage(quiz(), question(1))).toContain(
      'draft a scoring rubric for question 1 of the quiz "Cells"'
    );
  });

  it('names the rubric and criterion', () => {
    expect(criterionMessage(rubric, rubric.criteria[1], 'four levels')).toBe(
      'From the preview card: in the rubric "CER" (rubric_id r1), change the "Evidence" criterion: four levels'
    );
    expect(wholeRubricMessage(rubric, 'simpler')).toContain('rubric_id r1');
  });

  it('cleans what the host would refuse and clips long asks', () => {
    expect(cleanMessage('a​b\n\n\n\n\nc')).toBe('ab\n\n\nc');
    const long = questionMessage(quiz(), question(1), 'x'.repeat(MAX_ASK + 50));
    expect(long.endsWith('…')).toBe(true);
    expect(long.length).toBeLessThan(MAX_ASK + 100);
  });
});

describe('supersede ordering', () => {
  const a = { key: 'k', version: 1, mountedAt: 1, instance: 'a' };
  it('prefers the newer saved version, then the later card', () => {
    expect(isNewer({ ...a, version: 2 }, { ...a, mountedAt: 9 })).toBe(true);
    expect(isNewer({ ...a, mountedAt: 2 }, a)).toBe(true);
    expect(isNewer(a, { ...a, instance: 'b' })).toBe(false);
  });
});

describe('quiz card', () => {
  const stored = [
    {
      id: 'q1',
      type: 'MC' as const,
      text: 'Question 1',
      timeLimit: 0,
      correctAnswer: 'Right',
      incorrectAnswers: ['Wrong'],
    },
    {
      id: 'q2',
      type: 'FIB' as const,
      text: 'Question 2',
      timeLimit: 0,
      correctAnswer: 'blank',
      incorrectAnswers: [],
    },
  ];
  const view = () =>
    quiz({
      questions: [
        question(1),
        { ...question(2), type: 'fill_in_blank', correct_answer: 'blank' },
      ],
      quiz: {
        id: 'abc',
        title: 'Cells',
        questions: stored,
        createdAt: 1,
        updatedAt: 10,
      },
    });

  it('shows every question and asks Claude about the one typed under', async () => {
    const ask = vi.fn(() => Promise.resolve(true));
    render(
      <QuizPreviewCard
        view={view()}
        actions={{ ask, expand: vi.fn(), open: vi.fn() }}
        fullscreen={false}
        superseded={false}
      />
    );
    expect(screen.getByRole('region', { name: 'Question 1' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Question 2' })).toBeTruthy();
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Ask Claude to change question 2' }),
      { target: { value: 'harder' } }
    );
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Question 2' })).getByRole(
        'button',
        { name: 'Ask Claude' }
      )
    );
    await Promise.resolve();
    expect(ask).toHaveBeenCalledWith(
      'From the preview card: in the quiz "Cells" (quiz_id abc), change question 2: harder'
    );
  });

  it('marks the key only when the answer key is on', () => {
    render(
      <QuizPreviewCard
        view={view()}
        actions={{ ask: vi.fn(), expand: vi.fn(), open: vi.fn() }}
        fullscreen={false}
        superseded={false}
      />
    );
    expect(screen.queryByLabelText('Correct')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Answer key' }));
    expect(screen.getByLabelText('Correct')).toBeTruthy();
    expect(screen.getByText('blank')).toBeTruthy();
  });

  it('hides the ask boxes once a newer card shows the quiz', () => {
    render(
      <QuizPreviewCard
        view={view()}
        actions={{ ask: vi.fn(), expand: vi.fn(), open: vi.fn() }}
        fullscreen={false}
        superseded
      />
    );
    expect(screen.getByText('A newer version is below.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ask Claude' })).toBeNull();
  });
});

describe('rubric card', () => {
  it('shows the criteria and sends a change for one criterion', async () => {
    const ask = vi.fn(() => Promise.resolve(true));
    render(
      <RubricCard
        view={rubric}
        superseded={false}
        openUrl={rubric.open_url}
        actions={{ ask, expand: vi.fn(), open: vi.fn() }}
      />
    );
    expect(screen.getAllByText('Evidence')).toHaveLength(2);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'add an example' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await Promise.resolve();
    expect(ask).toHaveBeenCalledWith(
      'From the preview card: in the rubric "CER" (rubric_id r1), change the "Evidence" criterion: add an example'
    );
  });
});
