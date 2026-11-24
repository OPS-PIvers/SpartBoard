import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const auth = vi.hoisted(() => ({ written: false }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature: () => auth.written }),
}));
vi.mock('@/hooks/usePaperSheetStimulusImages', () => ({
  usePaperSheetStimulusImages: () => ({ src: {}, failed: [], loading: false }),
}));

import { PaperGroupReprintModal } from '@/components/widgets/QuizWidget/components/PaperGroupReprintModal';
import type { ClassRoster, PaperBatch, QuizData, QuizQuestion } from '@/types';
import type { PaperPrintJob } from '@/utils/paperSheetPrint';

const mc = (id: string): QuizQuestion => ({
  id,
  timeLimit: 0,
  text: `Question ${id}`,
  type: 'MC',
  correctAnswer: 'a',
  incorrectAnswers: ['b', 'c', 'd'],
});

const QUIZ: QuizData = {
  id: 'quiz-1',
  title: 'Unit 3 Test',
  questions: [mc('q1'), mc('q2')],
  createdAt: 0,
  updatedAt: 0,
};

const ROSTER: ClassRoster = {
  id: 'r1',
  name: 'Period 1',
  driveFileId: null,
  studentCount: 2,
  createdAt: 0,
  students: [
    { id: 's1', firstName: 'Sam', lastName: 'Alvarez', pin: '01' },
    { id: 's2', firstName: 'Jo', lastName: 'Baker', pin: '02' },
  ],
};

const BATCH: PaperBatch = {
  id: 'batch-1',
  quizId: 'quiz-1',
  rosterIds: ['r1'],
  questionCount: 2,
  choiceCount: 4,
  seats: {
    1: { rosterId: 'r1', studentId: 's1' },
    2: { rosterId: 'r1', studentId: 's2' },
  },
  spareSeats: [3],
  choiceOrder: { q1: ['a', 'b', 'c', 'd'], q2: ['d', 'c', 'b', 'a'] },
  pagesPerSheet: 1,
  createdAt: 0,
};

const GROUPS = [
  {
    label: 'Group 1',
    quiz: QUIZ,
    batch: {
      ...BATCH,
      id: 'g1',
      seats: { 1: { rosterId: 'r1', studentId: 's2' } },
    },
  },
  {
    label: 'Group 2',
    quiz: QUIZ,
    batch: {
      ...BATCH,
      id: 'g2',
      seats: { 1: { rosterId: 'r1', studentId: 's1' } },
    },
  },
];

const setup = () => {
  const print = vi.fn<(job: PaperPrintJob) => void>();
  const onClose = vi.fn();
  render(
    <PaperGroupReprintModal
      groups={GROUPS}
      rosters={[ROSTER]}
      onClose={onClose}
      onError={vi.fn()}
      print={print}
    />
  );
  return { print, onClose };
};

describe('PaperGroupReprintModal', () => {
  it('lists every printed student in one list, by last name', () => {
    setup();
    const names = screen.getAllByRole('checkbox').map((c) => c.textContent);
    expect(names).toEqual([
      'Group 11 student',
      'Group 21 student',
      'Alvarez, Sam',
      'Baker, Jo',
    ]);
  });

  it('a group checkbox picks its students', () => {
    setup();
    fireEvent.click(screen.getByLabelText(/Group 1/));
    expect(screen.getByLabelText('Baker, Jo')).toBeChecked();
    expect(screen.getByLabelText('Alvarez, Sam')).not.toBeChecked();
  });

  it('prints each group on its own stack, one at a time', () => {
    const { print, onClose } = setup();
    fireEvent.click(screen.getByLabelText('Baker, Jo'));
    fireEvent.click(screen.getByLabelText('Alvarez, Sam'));
    fireEvent.click(screen.getByRole('button', { name: /Print 1 of 2/ }));
    expect(print.mock.calls[0][0].batchId).toBe('g1');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    expect(print.mock.calls[1][0].batchId).toBe('g2');
    expect(print.mock.calls[1][0].sheets.map((s) => s.displayName)).toEqual([
      'Alvarez, Sam',
    ]);
    expect(onClose).toHaveBeenCalled();
  });

  it('prints each group with its own written prompt wording', () => {
    auth.written = true;
    const fr = (text: string): QuizQuestion => ({
      id: 'q3',
      timeLimit: 0,
      text,
      type: 'free-response',
      correctAnswer: '',
      incorrectAnswers: [],
    });
    const withPrompt = (text: string): QuizData => ({
      ...QUIZ,
      questions: [...QUIZ.questions, fr(text)],
    });
    const print = vi.fn<(job: PaperPrintJob) => void>();
    render(
      <PaperGroupReprintModal
        groups={[
          {
            ...GROUPS[0],
            quiz: withPrompt('Explain.\nBase wording'),
            batch: { ...GROUPS[0].batch, pageMaps: [] },
          },
          {
            ...GROUPS[1],
            quiz: withPrompt('Explain.\nGroup 2 wording'),
            batch: { ...GROUPS[1].batch, pageMaps: [] },
          },
        ]}
        rosters={[ROSTER]}
        onClose={vi.fn()}
        onError={vi.fn()}
        print={print}
      />
    );
    fireEvent.click(screen.getByLabelText('Baker, Jo'));
    fireEvent.click(screen.getByLabelText('Alvarez, Sam'));
    fireEvent.click(screen.getByRole('button', { name: /Print 1 of 2/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    expect(print.mock.calls[0][0].prompts?.q3.text).toBe(
      'Explain.\nBase wording'
    );
    expect(print.mock.calls[1][0].prompts?.q3.text).toBe(
      'Explain.\nGroup 2 wording'
    );
    auth.written = false;
  });

  it("prints a translated group's question text in its language", () => {
    const print = vi.fn<(job: PaperPrintJob) => void>();
    render(
      <PaperGroupReprintModal
        groups={[
          {
            ...GROUPS[0],
            batch: { ...GROUPS[0].batch, sheetLayout: 'questions' },
            translation: {
              questions: {
                q1: { text: 'Pregunta q1', choices: { a: 'una' } },
              },
            },
          },
        ]}
        rosters={[ROSTER]}
        onClose={vi.fn()}
        onError={vi.fn()}
        print={print}
      />
    );
    fireEvent.click(screen.getByLabelText('Baker, Jo'));
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    const texts = print.mock.calls[0][0].questionTexts;
    expect(texts?.[0]).toEqual({
      text: 'Pregunta q1',
      choices: ['una', 'b', 'c', 'd'],
    });
    expect(texts?.[1].text).toBe('Question q2');
  });
});
