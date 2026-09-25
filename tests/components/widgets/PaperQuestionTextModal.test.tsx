import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { PaperQuestionTextModal } from '@/components/widgets/QuizWidget/components/PaperQuestionTextModal';
import type { QuizData } from '@/types';
import type { RasterizedPage } from '@/utils/paperScanRaster';
import { buildPaperStubQuiz } from '@/utils/paperSheetPlan';

vi.mock('@/utils/quizDocumentImport/uploadIntake', async () => {
  const actual = await vi.importActual<
    typeof import('@/utils/quizDocumentImport/uploadIntake')
  >('@/utils/quizDocumentImport/uploadIntake');
  return {
    ...actual,
    looksLikeAnswerKey: (_file: Blob, name: string) =>
      Promise.resolve(actual.looksLikeKeyName(name)),
  };
});
import type {
  ExtractedQuestion,
  ExtractedQuiz,
} from '@/utils/quizDocumentImport';

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

/** The shared uploader: the test goes in its zone, then Read. */
const chooseTest = async () => {
  const file = new File([new Uint8Array(4)], 'test.pdf', {
    type: 'application/pdf',
  });
  fireEvent.change(screen.getByLabelText('Upload test questions'), {
    target: { files: [file] },
  });
  await screen.findByText('test.pdf');
  fireEvent.click(screen.getByRole('button', { name: 'Read the test' }));
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

  it('reads a test paper dropped onto the zone, not just one chosen', async () => {
    const { recognize } = setup(['1. Dropped in\n']);
    const file = new File([new Uint8Array(4)], 'test.pdf', {
      type: 'application/pdf',
    });
    const zone = screen.getByRole('button', { name: /Drop the test paper/i });
    fireEvent.drop(zone, {
      dataTransfer: { files: [file], types: ['Files'] },
    });
    await waitFor(() => expect(recognize).toHaveBeenCalled());
    expect(screen.getByLabelText('Question 1 text')).toHaveValue('Dropped in');
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

/**
 * Filling a stub from the import wizard's readers (D17). The win over the
 * OCR path is that choices and the key come across too, so a teacher who
 * scanned a printed multiple-choice test gets a quiz that can be assigned
 * rather than three rows of text and four blank choices each.
 */
describe('PaperQuestionTextModal with the shared readers', () => {
  const question = (
    number: number,
    over: Partial<ExtractedQuestion> = {}
  ): ExtractedQuestion => ({
    number,
    text: `Question ${number} from the paper`,
    type: 'MC',
    options: [
      { letter: 'A', text: 'First' },
      { letter: 'B', text: 'Second' },
      { letter: 'C', text: 'Third' },
    ],
    correctAnswer: 'Second',
    imageIds: [],
    warnings: [],
    ...over,
  });

  const read = (
    questions: ExtractedQuestion[],
    warnings: string[] = []
  ): ExtractedQuiz => ({
    title: 'Unit 3 Test',
    questions,
    images: [],
    warnings,
  });

  const readSetup = (extracted: ExtractedQuiz, quiz: QuizData = stub) => {
    const readDocument = vi.fn(() => Promise.resolve(extracted));
    const utils = setup([], { quiz, readDocument });
    return { ...utils, readDocument };
  };

  it('fills the choices and the key onto a stub row', async () => {
    const { onSave } = readSetup(read([question(1), question(2), question(3)]));
    await chooseTest();
    await waitFor(() =>
      expect(screen.getByLabelText('Question 1 text')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByText(/^Apply to /));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    const saved = onSave.mock.calls[0][0];
    expect(saved.questions[0].text).toBe('Question 1 from the paper');
    expect(saved.questions[0].correctAnswer).toBe('Second');
    expect(saved.questions[0].incorrectAnswers).toEqual(['First', 'Third']);
    // The key came from the paper, so the teacher no longer owes one.
    expect(saved.questions[0].needsKey).toBeUndefined();
  });

  it('shows the choices it will apply, with the answer named', async () => {
    readSetup(read([question(1)]));
    await chooseTest();
    await waitFor(() =>
      expect(screen.getByLabelText('Question 1 text')).toBeInTheDocument()
    );
    expect(screen.getByText(/First/)).toBeInTheDocument();
    expect(screen.getByText(/Second \(answer\)/)).toBeInTheDocument();
  });

  it('says a question still needs an answer when the paper marked none', async () => {
    readSetup(read([question(1, { correctAnswer: '' })]));
    await chooseTest();
    await waitFor(() =>
      expect(screen.getByLabelText('Question 1 text')).toBeInTheDocument()
    );
    expect(screen.getByText(/No answer marked/)).toBeInTheDocument();
  });

  it('keeps the teacher’s own wording when they edit the box', async () => {
    const { onSave } = readSetup(read([question(1)]));
    await chooseTest();
    await waitFor(() =>
      expect(screen.getByLabelText('Question 1 text')).toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText('Question 1 text'), {
      target: { value: 'My own wording' },
    });
    fireEvent.click(screen.getByText(/^Apply to /));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    const saved = onSave.mock.calls[0][0];
    expect(saved.questions[0].text).toBe('My own wording');
    // Editing the stem must not cost the question its choices.
    expect(saved.questions[0].incorrectAnswers).toEqual(['First', 'Third']);
  });

  it('surfaces the reader’s row notes', async () => {
    readSetup(
      read(
        [question(1, { warnings: ['Only one answer choice was found.'] })],
        ['The document was read the simple way.']
      )
    );
    await chooseTest();
    await waitFor(() =>
      expect(screen.getByLabelText('Question 1 text')).toBeInTheDocument()
    );
    expect(
      screen.getByText('Question 1: Only one answer choice was found.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('The document was read the simple way.')
    ).toBeInTheDocument();
  });

  it('names the rows the paper had nothing for', async () => {
    readSetup(read([question(1)]));
    await chooseTest();
    await waitFor(() =>
      expect(screen.getByLabelText('Question 1 text')).toBeInTheDocument()
    );
    expect(screen.getByText(/questions 2, 3/)).toBeInTheDocument();
  });

  it('never reaches for the OCR path when a reader is supplied', async () => {
    const { recognize, readDocument } = readSetup(read([question(1)]));
    await chooseTest();
    await waitFor(() => expect(readDocument).toHaveBeenCalled());
    expect(recognize).not.toHaveBeenCalled();
  });

  it('reads without AI unless the teacher ticks it', async () => {
    const readDocument = vi.fn(() => Promise.resolve(read([question(1)])));
    setup([], { readDocument, canUseAi: true });
    expect(screen.getByLabelText(/Read with AI/)).not.toBeChecked();
    await chooseTest();
    await waitFor(() =>
      expect(readDocument).toHaveBeenCalledWith(
        expect.objectContaining({ fileName: 'test.pdf' }),
        { useAi: false, key: null }
      )
    );
  });

  it('reads with AI once the teacher ticks it', async () => {
    const readDocument = vi.fn(() => Promise.resolve(read([question(1)])));
    setup([], { readDocument, canUseAi: true });
    fireEvent.click(screen.getByLabelText(/Read with AI/));
    await chooseTest();
    await waitFor(() =>
      expect(readDocument).toHaveBeenCalledWith(
        expect.objectContaining({ fileName: 'test.pdf' }),
        { useAi: true, key: null }
      )
    );
  });

  it('names the reader in plain text, not as a warning', async () => {
    const extracted = { ...read([question(1)]), readBy: 'plain' as const };
    setup([], { readDocument: vi.fn(() => Promise.resolve(extracted)) });
    await chooseTest();
    expect(await screen.findByText('Read without AI.')).toBeInTheDocument();
  });

  it('shows no AI switch to a teacher without AI', () => {
    setup([], { readDocument: vi.fn() });
    expect(screen.queryByLabelText(/Read with AI/)).not.toBeInTheDocument();
  });
});

describe('PaperQuestionTextModal with only an answer key (R17)', () => {
  const chooseKey = async () => {
    const file = new File([new Uint8Array(4)], 'key.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(screen.getByLabelText('Upload answer key'), {
      target: { files: [file] },
    });
    await screen.findByText('key.pdf');
  };

  it('fills the stub rows from the key and names what it skipped', async () => {
    const readKey = vi.fn(() =>
      Promise.resolve([
        { item: 1, answer: 'C' },
        { item: 2, answer: 'E' },
      ])
    );
    const { onSave, onClose } = setup([], {
      readDocument: vi.fn(),
      readKey,
    });
    await chooseKey();
    fireEvent.click(
      screen.getByRole('button', { name: 'Read the answer key' })
    );
    const list = await screen.findByRole('list', {
      name: 'Answers to fill in',
    });
    expect(list).toHaveTextContent('1.C');
    expect(
      screen.getByText(/key says E, question has 4 choices/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fill 1 answer' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0].questions[0]).toMatchObject({
      correctAnswer: 'C',
      incorrectAnswers: ['A', 'B', 'D'],
    });
    expect(onSave.mock.calls[0][0].questions[1]).toBe(stub.questions[1]);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
