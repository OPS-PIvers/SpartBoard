import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { AnswerKeyFillModal } from '@/components/widgets/QuizWidget/components/AnswerKeyFill';
import type { QuizData, QuizQuestion } from '@/types';
import type { KeyItem } from '@/utils/quizDocumentImport/types';
import type { SavedKeyFill } from '@/utils/quizDocumentImport';

vi.mock('@/utils/quizDocumentImport/uploadIntake', async () => {
  const actual = await vi.importActual<
    typeof import('@/utils/quizDocumentImport/uploadIntake')
  >('@/utils/quizDocumentImport/uploadIntake');
  return { ...actual, looksLikeAnswerKey: () => Promise.resolve(false) };
});

const mc = (id: string, over: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id,
  timeLimit: 0,
  text: `Question ${id}`,
  type: 'MC',
  correctAnswer: '',
  incorrectAnswers: ['Sun', 'Mars', 'Moon'],
  needsKey: true,
  points: 1,
  ...over,
});

const quiz = (questions: QuizQuestion[]): QuizData => ({
  id: 'quiz-1',
  title: 'Unit 3 Test',
  questions,
  createdAt: 0,
  updatedAt: 0,
});

function setup(data: QuizData, items: KeyItem[]) {
  const onApply = vi.fn<(result: SavedKeyFill) => Promise<void>>(() =>
    Promise.resolve()
  );
  const onClose = vi.fn();
  const onError = vi.fn();
  render(
    <AnswerKeyFillModal
      quiz={data}
      onApply={onApply}
      onClose={onClose}
      onError={onError}
      readKey={() => Promise.resolve(items)}
    />
  );
  return { onApply, onClose, onError };
}

const readKeyFile = async () => {
  expect(screen.queryByLabelText('Upload test questions')).toBeNull();
  fireEvent.change(screen.getByLabelText('Upload answer key'), {
    target: {
      files: [
        new File([new Uint8Array(4)], 'key.pdf', { type: 'application/pdf' }),
      ],
    },
  });
  await screen.findByText('key.pdf');
  fireEvent.click(screen.getByRole('button', { name: 'Read the answer key' }));
};

describe('AnswerKeyFillModal', () => {
  it('fills only the questions that need an answer, after showing the teacher', async () => {
    const answered = mc('q2', {
      correctAnswer: 'Mars',
      incorrectAnswers: ['Sun', 'Moon'],
      needsKey: undefined,
    });
    const { onApply, onClose } = setup(quiz([mc('q1'), answered]), [
      { item: 1, answer: 'B' },
      { item: 2, answer: 'A' },
    ]);
    await readKeyFile();
    expect(
      await screen.findByRole('list', { name: 'Answers to fill in' })
    ).toHaveTextContent('B (Mars)');
    expect(
      screen.getByRole('list', { name: 'Not filled in' })
    ).toHaveTextContent('already answered — skipped');
    expect(
      screen.getByText(/Every question will then have an answer/)
    ).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Fill 1 answer' }));
    await waitFor(() => expect(onApply).toHaveBeenCalledOnce());
    const [result] = onApply.mock.calls[0];
    expect(result.questions[0]).toMatchObject({
      correctAnswer: 'Mars',
      incorrectAnswers: ['Sun', 'Moon'],
    });
    expect(result.questions[1]).toBe(answered);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('matches a key entry to the question printed with that label', async () => {
    const { onApply } = setup(
      quiz([mc('q1', { sourceLabel: '5A' }), mc('q2', { sourceLabel: '5B' })]),
      [{ item: 5, part: 'B', answer: 'C' }]
    );
    await readKeyFile();
    const list = await screen.findByRole('list', {
      name: 'Answers to fill in',
    });
    expect(list).toHaveTextContent('5B.C (Moon)');
    expect(screen.getByText(/1 question will still need/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fill 1 answer' }));
    await waitFor(() => expect(onApply).toHaveBeenCalledOnce());
    expect(onApply.mock.calls[0][0].filled).toEqual(['q2']);
  });

  it('will not write anything when the key filled nothing', async () => {
    setup(quiz([mc('q1')]), [{ item: 4, answer: 'A' }]);
    await readKeyFile();
    await screen.findByText(/no question with this number/);
    expect(
      screen.getByRole('button', { name: 'Fill 0 answers' })
    ).toBeDisabled();
  });

  it('says so when the key file cannot be read', async () => {
    const onError = vi.fn();
    render(
      <AnswerKeyFillModal
        quiz={quiz([mc('q1')])}
        onApply={vi.fn()}
        onClose={vi.fn()}
        onError={onError}
        readKey={() =>
          Promise.reject(new Error('That answer key can’t be read.'))
        }
      />
    );
    await readKeyFile();
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith('That answer key can’t be read.')
    );
    expect(screen.getByLabelText('Upload answer key')).toBeInTheDocument();
  });
});
