import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { PaperQuestionTextModal } from '@/components/widgets/QuizWidget/components/PaperQuestionTextModal';
import type { QuizData } from '@/types';
import type { RasterizedPage } from '@/utils/paperScanRaster';
import { buildPaperStubQuiz } from '@/utils/paperSheetPlan';

const stub: QuizData = buildPaperStubQuiz({
  quizId: 'quiz-1',
  title: 'Paper quiz',
  questionCount: 3,
  choiceCount: 4,
  createdAt: 0,
});

const blankPage = (): RasterizedPage['page'] => ({
  width: 4,
  height: 4,
  data: new Uint8ClampedArray(64),
});

const rasterizer = (count: number) =>
  async function* (): AsyncGenerator<RasterizedPage> {
    for (let n = 1; n <= count; n += 1) {
      yield { pageNumber: n, page: blankPage(), crop: () => '' };
      await Promise.resolve();
    }
  };

const setup = (
  pagesText: string[],
  over: Partial<React.ComponentProps<typeof PaperQuestionTextModal>> = {}
) => {
  let call = 0;
  const recognize = vi.fn(() => Promise.resolve(pagesText[call++] ?? ''));
  const onSave = vi.fn<(q: QuizData) => Promise<void>>(() => Promise.resolve());
  const onClose = vi.fn();
  const onError = vi.fn();
  render(
    <PaperQuestionTextModal
      quiz={over.quiz ?? stub}
      onSave={onSave}
      onClose={onClose}
      onError={onError}
      rasterize={rasterizer(pagesText.length)}
      recognize={recognize}
      {...over}
    />
  );
  return { recognize, onSave, onClose, onError };
};

const chooseFile = () => {
  const input = screen.getByLabelText('Test paper file');
  const file = new File([new Uint8Array(4)], 'test.pdf', {
    type: 'application/pdf',
  });
  fireEvent.change(input, { target: { files: [file] } });
};

describe('PaperQuestionTextModal', () => {
  it('reads every page, proposes text for placeholder rows and saves the ticked ones', async () => {
    const { recognize, onSave, onClose } = setup([
      'Unit test\n1. What is 3 + 4?\nA. A\nB. B\n2. Name a planet.\n',
      '3. Solve 2x = 10.\n',
    ]);
    chooseFile();
    await waitFor(() =>
      expect(screen.getByLabelText('Question 3 text')).toBeInTheDocument()
    );
    expect(recognize).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Question 1 text')).toHaveValue(
      'What is 3 + 4?'
    );
    expect(screen.getByLabelText('Apply question 2')).toBeChecked();
    fireEvent.change(screen.getByLabelText('Question 2 text'), {
      target: { value: 'Name the closest planet.' },
    });
    fireEvent.click(screen.getByLabelText('Apply question 3'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply to 2 questions' })
    );
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0].questions.map((q) => q.text)).toEqual([
      'What is 3 + 4?',
      'Name the closest planet.',
      'Question 3',
    ]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('leaves real question text unticked and names rows the scan lacked', async () => {
    const authored: QuizData = {
      ...stub,
      questions: stub.questions.map((q, i) =>
        i === 0 ? { ...q, text: 'Typed by the teacher' } : q
      ),
    };
    setup(['1. From the scan\n2. Second\n'], { quiz: authored });
    chooseFile();
    await waitFor(() =>
      expect(screen.getByLabelText('Question 1 text')).toBeInTheDocument()
    );
    expect(screen.getByLabelText('Apply question 1')).not.toBeChecked();
    expect(screen.getByText(/Now: Typed by the teacher/)).toBeInTheDocument();
    expect(
      screen.getByText(/Not found in the scan: question 3/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Apply to 1 question' })
    ).toBeEnabled();
  });

  it('reports a scan it cannot read and returns to setup', async () => {
    const { onError } = setup([], {
      recognize: () => Promise.reject(new Error('OCR exploded')),
      rasterize: rasterizer(1),
    });
    chooseFile();
    await waitFor(() => expect(onError).toHaveBeenCalledWith('OCR exploded'));
    expect(screen.getByLabelText('Test paper file')).toBeInTheDocument();
  });
});
