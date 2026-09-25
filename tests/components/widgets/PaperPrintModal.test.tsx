import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { PaperPrintModal } from '@/components/widgets/QuizWidget/components/PaperPrintModal';

const drive = {
  uploadFile: vi.fn<
    (file: File, name: string, folder: string) => Promise<{ id: string }>
  >(() => Promise.resolve({ id: 'uploaded-1' })),
  makePublic: vi.fn<(fileId: string, domain?: string) => Promise<void>>(() =>
    Promise.resolve()
  ),
  listFilePermissions: vi.fn<
    (fileId: string) => Promise<Array<{ id: string; type?: string }>>
  >(() => Promise.resolve([])),
};
const openPicker = vi.fn(() =>
  Promise.resolve({
    id: 'picked-1',
    name: 'Diagram.png',
    mimeType: 'image/png',
  })
);
let sheetImages: {
  src: Record<string, string>;
  failed: PaperSheetStimulus[];
  loading: boolean;
} = { src: {}, failed: [], loading: false };

/** Nulled in the one test that checks what happens with no Drive connected. */
let driveConnected = true;
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
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ driveService: driveConnected ? drive : null }),
}));
vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({ openPicker }),
}));
vi.mock('@/hooks/usePaperSheetStimulusImages', () => ({
  usePaperSheetStimulusImages: () => sheetImages,
}));

/** pdf.js never runs in a test; what matters is which page gets rendered. */
const renderPdfPage = vi.fn((pageNumber: number) =>
  Promise.resolve({
    blob: new Blob([`page-${pageNumber}`]),
    widthPx: 1700,
    heightPx: 2200,
  })
);
const closePdf = vi.fn();
let pdfPageCount = 3;
vi.mock('@/utils/paperSheetPdfPage', async (importActual) => {
  const actual =
    await importActual<typeof import('@/utils/paperSheetPdfPage')>();
  return {
    ...actual,
    openPdfPages: () =>
      Promise.resolve({
        pageCount: pdfPageCount,
        render: renderPdfPage,
        close: closePdf,
      }),
  };
});

import type {
  ClassRoster,
  PaperBatch,
  PaperSheetStimulus,
  QuizData,
  QuizQuestion,
} from '@/types';
import type {
  ExtractedQuestion,
  ExtractedQuiz,
} from '@/utils/quizDocumentImport';
import type { PaperPrintJob } from '@/utils/paperSheetPrint';
import type { PaperTestJob } from '@/utils/paperTestPrint';

const mc = (id: string, distractors = 3): QuizQuestion => ({
  id,
  timeLimit: 0,
  text: `Question ${id}`,
  type: 'MC',
  correctAnswer: 'a',
  incorrectAnswers: Array.from({ length: distractors }, (_, i) => `d${i}`),
});

const quiz = (over: Partial<QuizData> = {}): QuizData => ({
  id: 'quiz-1',
  title: 'Unit 3 Test',
  questions: [mc('q1'), mc('q2')],
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const roster: ClassRoster = {
  id: 'r1',
  name: 'Period 1',
  driveFileId: 'file-1',
  studentCount: 2,
  createdAt: 0,
  students: [
    { id: 's1', firstName: 'Sam', lastName: 'Alvarez', pin: '01' },
    { id: 's2', firstName: 'Jo', lastName: 'Baker', pin: '02' },
  ],
};

const setup = (
  over: Partial<React.ComponentProps<typeof PaperPrintModal>> = {}
) => {
  const onSaveBatch = vi
    .fn<(batch: PaperBatch) => Promise<void>>()
    .mockResolvedValue(undefined);
  const print = vi.fn<(job: PaperPrintJob) => void>();
  const onClose = vi.fn();
  const onError = vi.fn();
  const { unmount } = render(
    <PaperPrintModal
      quiz={quiz()}
      rosters={[roster]}
      onSaveBatch={onSaveBatch}
      onClose={onClose}
      onError={onError}
      print={print}
      {...over}
    />
  );
  return { onSaveBatch, print, onClose, onError, unmount };
};

/** The section's file input is hidden, and the modal renders in a portal. */
const fileInput = (): HTMLInputElement => {
  const input = document.querySelector('input[type=file]');
  if (!input) throw new Error('No file input rendered');
  return input as HTMLInputElement;
};

const selectWholeClass = () =>
  fireEvent.click(screen.getByLabelText('Period 1', { selector: 'input' }));

describe('PaperPrintModal', () => {
  beforeEach(() => {
    sheetImages = { src: {}, failed: [], loading: false };
    pdfPageCount = 3;
    driveConnected = true;
    vi.clearAllMocks();
    // clearAllMocks keeps whatever a test set with mockResolvedValue.
    drive.listFilePermissions.mockReset();
    drive.listFilePermissions.mockResolvedValue([]);
    drive.makePublic.mockResolvedValue(undefined);
  });

  it('cannot print until somebody is getting a sheet', () => {
    setup({ quiz: quiz(), rosters: [{ ...roster, students: [] }] });
    fireEvent.change(screen.getByLabelText(/Blank spare sheets/i), {
      target: { value: '0' },
    });
    expect(screen.getByRole('button', { name: /^Print$/ })).toBeDisabled();
    expect(screen.getByText(/Pick at least one student/i)).toBeInTheDocument();
  });

  it('counts sheets and pages for the chosen students plus spares', () => {
    setup();
    selectWholeClass();
    fireEvent.change(screen.getByLabelText(/Blank spare sheets/i), {
      target: { value: '3' },
    });
    expect(screen.getByText(/5 sheets · 5 pages/)).toBeInTheDocument();
  });

  it('saves the batch before printing, so no sheet exists without its record', async () => {
    const order: string[] = [];
    const onSaveBatch = vi.fn(() => {
      order.push('save');
      return Promise.resolve();
    });
    const print = vi.fn(() => {
      order.push('print');
    });
    setup({ onSaveBatch, print: print as never });
    selectWholeClass();
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    expect(order).toEqual(['save', 'print']);
  });

  it('never prints when the batch could not be saved', async () => {
    const onSaveBatch = vi.fn().mockRejectedValue(new Error('offline'));
    const { print, onError, onClose } = setup({ onSaveBatch });
    selectWholeClass();
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('offline'));
    expect(print).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('records each printed seat against its roster', async () => {
    const { onSaveBatch, print } = setup();
    selectWholeClass();
    fireEvent.change(screen.getByLabelText(/Blank spare sheets/i), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    const batch = onSaveBatch.mock.calls[0][0];
    expect(batch.quizId).toBe('quiz-1');
    expect(batch.questionCount).toBe(2);
    expect(Object.values(batch.seats)).toEqual([
      { rosterId: 'r1', studentId: 's1' },
      { rosterId: 'r1', studentId: 's2' },
    ]);
  });

  it('records the printed choice order and offers the matching test paper next', async () => {
    const printTest = vi.fn<(job: PaperTestJob) => void>();
    const { onSaveBatch, print, onClose } = setup({ printTest });
    selectWholeClass();
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    const batch = onSaveBatch.mock.calls[0][0];
    expect([...(batch.choiceOrder?.q1 ?? [])].sort()).toEqual([
      'a',
      'd0',
      'd1',
      'd2',
    ]);
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Response sheets sent to print/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Print test paper/ }));
    expect(printTest).toHaveBeenCalledOnce();
    const job = printTest.mock.calls[0][0];
    expect(job.quizTitle).toBe('Unit 3 Test');
    expect(job.questions.map((q) => q.row)).toEqual([1, 2]);
    expect(job.questions[0].choices).toEqual(batch.choiceOrder?.q1);
    expect(job.questions[1].choices).toEqual(batch.choiceOrder?.q2);

    fireEvent.click(screen.getByRole('button', { name: /^Done$/ }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('surfaces a blocked pop-up on the test paper without losing the batch', async () => {
    const printTest = vi.fn(() => {
      throw new Error('Printing blocked: please allow pop-ups for this site.');
    });
    const { print, onError } = setup({ printTest });
    selectWholeClass();
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Print test paper/ }));
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/pop-ups/));
    expect(
      screen.getByRole('button', { name: /Print test paper/ })
    ).toBeInTheDocument();
  });

  it('warns about questions that cannot be bubbled', () => {
    setup({
      quiz: quiz({
        questions: [
          mc('q1'),
          { ...mc('q2'), type: 'free-response', text: 'Explain' },
        ],
      }),
    });
    expect(
      screen.getByText(/1 question will not be on the sheet/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Free response: Explain/)).toBeInTheDocument();
  });

  it('locks an authored quiz to the bubble count its questions need', () => {
    setup({ quiz: quiz({ questions: [mc('q1', 1), mc('q2', 4)] }) });
    expect(screen.getByText('5 (A–E)')).toBeInTheDocument();
    expect(
      screen.getByText(/Question 1 has fewer than 5 choices/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('lets a new paper test choose its own length and creates the stub on print', async () => {
    const onCreateQuiz = vi.fn().mockResolvedValue(undefined);
    const { print, onSaveBatch } = setup({
      quiz: quiz({ title: '', questions: [] }),
      onCreateQuiz,
    });
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Pop quiz' },
    });
    fireEvent.change(screen.getByLabelText('Questions'), {
      target: { value: '30' },
    });
    fireEvent.change(screen.getByLabelText(/Choices per question/i), {
      target: { value: '2' },
    });
    selectWholeClass();
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));

    await waitFor(() => expect(print).toHaveBeenCalled());
    const created = onCreateQuiz.mock.calls[0][0] as QuizData;
    expect(created.title).toBe('Pop quiz');
    expect(created.questions).toHaveLength(30);
    expect(created.questions[0].incorrectAnswers).toEqual(['B']);
    expect(onSaveBatch.mock.calls[0][0].choiceCount).toBe(2);
    // The stub must exist before the batch that points at it.
    expect(onCreateQuiz).toHaveBeenCalledBefore(onSaveBatch);
  });

  describe('a new paper test built from the teacher’s own test paper', () => {
    const extracted = (
      questions: ExtractedQuestion[],
      warnings: string[] = []
    ): ExtractedQuiz => ({
      title: 'Unit 3 Test',
      questions,
      images: [],
      warnings,
    });

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

    const newPaperTest = (read: ExtractedQuiz) => {
      const onCreateQuiz = vi.fn().mockResolvedValue(undefined);
      const readDocument = vi.fn(() => Promise.resolve(read));
      const rest = setup({
        quiz: quiz({ title: '', questions: [] }),
        onCreateQuiz,
        readDocument,
      });
      return { ...rest, onCreateQuiz, readDocument };
    };

    const dropTestPaper = async () => {
      const file = new File([new Uint8Array(4)], 'unit3.pdf', {
        type: 'application/pdf',
      });
      fireEvent.drop(screen.getByTestId('test-zone'), {
        dataTransfer: { files: [file], types: ['Files'] },
      });
      await screen.findByText('unit3.pdf');
      fireEvent.click(screen.getByRole('button', { name: 'Read the test' }));
    };

    it('reads the paper, sizes the sheet to it and names the test', async () => {
      const { readDocument } = newPaperTest(
        extracted([question(1), question(2), question(3)])
      );
      await dropTestPaper();
      await waitFor(() => expect(readDocument).toHaveBeenCalled());
      expect(await screen.findByText(/3 questions read/)).toBeInTheDocument();
      expect(screen.getByLabelText('Questions')).toHaveValue(3);
      expect(screen.getByLabelText(/Choices per question/i)).toHaveValue('3');
      expect(screen.getByLabelText('Title')).toHaveValue('Unit 3 Test');
    });

    it('creates the quiz with the real questions, not placeholders', async () => {
      const { onCreateQuiz, print } = newPaperTest(
        extracted([question(1), question(2)])
      );
      await dropTestPaper();
      await screen.findByText(/2 questions read/);
      selectWholeClass();
      fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
      await waitFor(() => expect(print).toHaveBeenCalled());

      const created = onCreateQuiz.mock.calls[0][0] as QuizData;
      expect(created.questions.map((q) => q.text)).toEqual([
        'Question 1 from the paper',
        'Question 2 from the paper',
      ]);
      expect(created.questions[0].correctAnswer).toBe('Second');
      expect(created.questions[0].incorrectAnswers).toEqual(['First', 'Third']);
      expect(created.questions[0].needsKey).toBeUndefined();
    });

    it('records the printed choice order, so a bubbled B means that answer', async () => {
      const { onCreateQuiz, onSaveBatch, print } = newPaperTest(
        extracted([question(1)])
      );
      await dropTestPaper();
      await screen.findByText(/1 question read/);
      selectWholeClass();
      fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
      await waitFor(() => expect(print).toHaveBeenCalled());

      const created = onCreateQuiz.mock.calls[0][0] as QuizData;
      const batch = onSaveBatch.mock.calls[0][0];
      // The teacher's paper is already printed, so its own A/B/C order is
      // what the bubbles stand for — never a reshuffle.
      expect(batch.choiceOrder?.[created.questions[0].id]).toEqual([
        'First',
        'Second',
        'Third',
      ]);
    });

    it('says which questions the paper left unanswered', async () => {
      newPaperTest(
        extracted([question(1), question(2, { correctAnswer: '' })])
      );
      await dropTestPaper();
      expect(
        await screen.findByText(/1 question came in without an answer/)
      ).toBeInTheDocument();
    });

    it('shows what the reader doubted about a row, not just the document', async () => {
      newPaperTest(
        extracted(
          [
            question(1, {
              warnings: ['Only one answer choice was found.'],
            }),
          ],
          ['The document was read the simple way.']
        )
      );
      await dropTestPaper();
      expect(
        await screen.findByText('Question 1: Only one answer choice was found.')
      ).toBeInTheDocument();
      expect(
        screen.getByText('The document was read the simple way.')
      ).toBeInTheDocument();
    });

    it('keeps a plain stub when the paper is put back', async () => {
      const { onCreateQuiz, print } = newPaperTest(extracted([question(1)]));
      await dropTestPaper();
      await screen.findByText(/1 question read/);
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
      selectWholeClass();
      fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
      await waitFor(() => expect(print).toHaveBeenCalled());

      const created = onCreateQuiz.mock.calls[0][0] as QuizData;
      expect(created.questions[0].text).toBe('Question 1');
    });

    it('reports a paper it cannot read and leaves the zone open', async () => {
      const onCreateQuiz = vi.fn().mockResolvedValue(undefined);
      const { onError } = setup({
        quiz: quiz({ title: '', questions: [] }),
        onCreateQuiz,
        readDocument: () => Promise.reject(new Error('PDF exploded')),
      });
      await dropTestPaper();
      await waitFor(() => expect(onError).toHaveBeenCalledWith('PDF exploded'));
      expect(screen.getByTestId('test-zone')).toBeInTheDocument();
    });

    it('says so when the paper held no numbered questions', async () => {
      const { onError } = newPaperTest(extracted([]));
      await dropTestPaper();
      await waitFor(() =>
        expect(onError).toHaveBeenCalledWith(
          expect.stringContaining('No numbered questions')
        )
      );
    });

    it('offers no upload when the document reader is off', () => {
      setup({
        quiz: quiz({ title: '', questions: [] }),
        onCreateQuiz: vi.fn().mockResolvedValue(undefined),
      });
      expect(screen.queryByTestId('test-zone')).not.toBeInTheDocument();
    });
  });

  it('prints each question beside its bubbles when asked, on the tall-row layout', async () => {
    const tenQuestions = quiz({
      questions: Array.from({ length: 10 }, (_, i) => mc(`q${i}`)),
    });
    const { print, onSaveBatch } = setup({ quiz: tenQuestions });
    selectWholeClass();
    fireEvent.change(screen.getByLabelText(/Blank spare sheets/i), {
      target: { value: '0' },
    });
    expect(screen.getByText(/2 sheets · 2 pages/)).toBeInTheDocument();
    expect(screen.getByLabelText('Include question text')).not.toBeChecked();
    fireEvent.click(screen.getByLabelText('Include question text'));
    expect(screen.getByText(/2 sheets · 4 pages/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    const batch = onSaveBatch.mock.calls[0][0];
    expect(batch.sheetLayout).toBe('questions');
    expect(batch.pagesPerSheet).toBe(2);
    const job = print.mock.calls[0][0];
    expect(job.columnsPerPage).toBe('questions');
    expect(job.questionTexts?.[0]).toEqual({
      text: 'Question q0',
      choices: batch.choiceOrder?.q0,
    });
    expect(job.questionTexts).toHaveLength(10);
  });

  it('offers no question text on a new paper test', () => {
    render(
      <PaperPrintModal
        quiz={quiz({ questions: [] })}
        rosters={[roster]}
        onSaveBatch={vi.fn()}
        onClose={vi.fn()}
        onError={vi.fn()}
        print={vi.fn() as never}
      />
    );
    expect(screen.queryByLabelText('Include question text')).toBeNull();
  });

  it('defaults the answer key sheet on for a new paper test and off otherwise', () => {
    const { unmount } = render(
      <PaperPrintModal
        quiz={quiz({ questions: [] })}
        rosters={[roster]}
        onSaveBatch={vi.fn()}
        onClose={vi.fn()}
        onError={vi.fn()}
        print={vi.fn() as never}
      />
    );
    expect(screen.getByLabelText('Include an answer key sheet')).toBeChecked();
    unmount();

    setup();
    expect(
      screen.getByLabelText('Include an answer key sheet')
    ).not.toBeChecked();
  });

  describe('answer sheet stimuli', () => {
    // jsdom neither makes object URLs nor loads an <img>, and the upload path
    // measures the file through both before it uploads.
    beforeEach(() => {
      vi.stubGlobal('URL', {
        ...URL,
        createObjectURL: vi.fn(() => 'blob:stub'),
        revokeObjectURL: vi.fn(),
      });
      vi.stubGlobal(
        'Image',
        class {
          naturalWidth = 640;
          naturalHeight = 480;
          onload: (() => void) | null = null;
          onerror: (() => void) | null = null;
          set src(_value: string) {
            queueMicrotask(() => this.onload?.());
          }
        }
      );
    });
    afterEach(() => vi.unstubAllGlobals());

    const graph: PaperSheetStimulus = {
      id: 'stim-1',
      label: 'Unit 3 graph',
      source: 'image',
      driveFileId: 'drive-1',
      widthPx: 800,
      heightPx: 600,
    };

    it('drops the sheet to one answer column once something is on it', async () => {
      const thirtyQuestions = quiz({
        questions: Array.from({ length: 30 }, (_, i) => mc(`q${i}`)),
      });
      setup({ quiz: thirtyQuestions });
      selectWholeClass();
      fireEvent.change(screen.getByLabelText(/Blank spare sheets/i), {
        target: { value: '0' },
      });
      // 30 questions is one two-column page, and two once the band takes the
      // right half of each (D1).
      expect(screen.getByText(/2 sheets · 2 pages/)).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole('button', { name: /Add to the answer sheet/ })
      );
      fireEvent.click(screen.getByRole('button', { name: 'From Drive' }));
      await screen.findByText('1 item');
      expect(screen.getByText(/2 sheets · 4 pages/)).toBeInTheDocument();
    });

    it('prints a single-column stack and records the layout on the batch', async () => {
      sheetImages = {
        src: { 'stim-1': 'blob:graph' },
        failed: [],
        loading: false,
      };
      const { print, onSaveBatch } = setup({
        quiz: quiz({ paperSheetStimuli: [graph] }),
      });
      selectWholeClass();
      fireEvent.change(screen.getByLabelText(/Blank spare sheets/i), {
        target: { value: '0' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
      await waitFor(() => expect(print).toHaveBeenCalled());

      expect(onSaveBatch.mock.calls[0][0].columnsPerPage).toBe(1);
      const job = print.mock.calls[0][0];
      expect(job.columnsPerPage).toBe(1);
      expect(job.sheetStimuli).toEqual([graph]);
      expect(job.stimulusImageSrc).toEqual({ 'stim-1': 'blob:graph' });
    });

    it('leaves a sheet with nothing on it two-column, as it was', async () => {
      const { print, onSaveBatch } = setup();
      selectWholeClass();
      fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
      await waitFor(() => expect(print).toHaveBeenCalled());
      expect(onSaveBatch.mock.calls[0][0].columnsPerPage).toBeUndefined();
      const job = print.mock.calls[0][0];
      expect(job.columnsPerPage).toBeUndefined();
      expect(job.sheetStimuli).toBeUndefined();
    });

    it('blocks the print, and the batch, on an image it could not fetch', () => {
      sheetImages = { src: {}, failed: [graph], loading: false };
      const { print, onSaveBatch, onError } = setup({
        quiz: quiz({ paperSheetStimuli: [graph] }),
      });
      selectWholeClass();
      fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
      expect(onError).toHaveBeenCalledWith(
        expect.stringContaining('Unit 3 graph')
      );
      expect(onSaveBatch).not.toHaveBeenCalled();
      expect(print).not.toHaveBeenCalled();
    });

    it('waits for the images before it will print', () => {
      sheetImages = { src: {}, failed: [], loading: true };
      setup({ quiz: quiz({ paperSheetStimuli: [graph] }) });
      selectWholeClass();
      expect(screen.getByRole('button', { name: /^Print$/ })).toBeDisabled();
    });

    it('saves the stimuli onto the quiz before the batch that points at it', async () => {
      const order: string[] = [];
      const onSaveSheetStimuli = vi.fn(() => {
        order.push('quiz');
        return Promise.resolve();
      });
      const onSaveBatch = vi.fn(() => {
        order.push('batch');
        return Promise.resolve();
      });
      const { print } = setup({
        quiz: quiz({ paperSheetStimuli: [graph] }),
        onSaveSheetStimuli,
        onSaveBatch,
      });
      fireEvent.change(screen.getByLabelText('Caption for Unit 3 graph'), {
        target: { value: 'Use for 1-10' },
      });
      selectWholeClass();
      fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
      await waitFor(() => expect(print).toHaveBeenCalled());
      expect(onSaveSheetStimuli).toHaveBeenCalledWith([
        { ...graph, caption: 'Use for 1-10' },
      ]);
      expect(order).toEqual(['quiz', 'batch']);
    });

    it('does not re-save a quiz whose sheet nobody touched', async () => {
      const onSaveSheetStimuli = vi.fn();
      const { print } = setup({
        quiz: quiz({ paperSheetStimuli: [graph] }),
        onSaveSheetStimuli,
      });
      selectWholeClass();
      fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
      await waitFor(() => expect(print).toHaveBeenCalled());
      // An unchanged save would publish a new PLC version on every print.
      expect(onSaveSheetStimuli).not.toHaveBeenCalled();
    });

    it('carries them on the stub a new paper test creates, not a second save', async () => {
      const onCreateQuiz = vi.fn().mockResolvedValue(undefined);
      const onSaveSheetStimuli = vi.fn();
      const { print } = setup({
        quiz: quiz({ title: '', questions: [] }),
        onCreateQuiz,
        onSaveSheetStimuli,
      });
      fireEvent.change(screen.getByLabelText('Title'), {
        target: { value: 'Pop quiz' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: /Add to the answer sheet/ })
      );
      fireEvent.click(screen.getByRole('button', { name: 'From Drive' }));
      await screen.findByText('1 item');
      selectWholeClass();
      fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
      await waitFor(() => expect(print).toHaveBeenCalled());

      const created = onCreateQuiz.mock.calls[0][0] as QuizData;
      expect(created.paperSheetStimuli).toEqual([
        expect.objectContaining({
          label: 'Diagram.png',
          source: 'image',
          driveFileId: 'picked-1',
        }),
      ]);
      expect(onSaveSheetStimuli).not.toHaveBeenCalled();
    });

    it('stays open until the print window has the images, then closes', async () => {
      const onCreateQuiz = vi.fn().mockResolvedValue(undefined);
      const { print, onClose } = setup({
        quiz: quiz({ title: '', questions: [] }),
        onCreateQuiz,
      });
      fireEvent.change(screen.getByLabelText('Title'), {
        target: { value: 'Pop quiz' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: /Add to the answer sheet/ })
      );
      fireEvent.click(screen.getByRole('button', { name: 'From Drive' }));
      await screen.findByText('1 item');
      selectWholeClass();
      fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
      await waitFor(() => expect(print).toHaveBeenCalled());

      // Closing unmounts the modal, which revokes the object URLs the print
      // window is still reading from.
      expect(onClose).not.toHaveBeenCalled();
      print.mock.calls[0][0].onImagesReady?.();
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("uploads a chosen file unshared, so it stays the teacher's until the quiz is shared", async () => {
      const { print } = setup({ quiz: quiz({ paperSheetStimuli: [graph] }) });
      const file = new File(['x'], 'photo.png', { type: 'image/png' });
      fireEvent.change(fileInput(), { target: { files: [file] } });
      await waitFor(() => expect(drive.uploadFile).toHaveBeenCalled());
      const [uploaded, , folder] = drive.uploadFile.mock.calls[0];
      expect(uploaded).toBe(file);
      expect(folder).toBe('Assets/PaperSheetStimuli');
      // Three arguments: nothing here asks Drive to share the file.
      expect(drive.uploadFile.mock.calls[0]).toHaveLength(3);
      // The natural size rides along, so auto-fit never has to load the file.
      await screen.findByText('2 items');
      selectWholeClass();
      fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
      await waitFor(() => expect(print).toHaveBeenCalled());
      expect(print.mock.calls[0][0].sheetStimuli?.[1]).toMatchObject({
        label: 'photo.png',
        driveFileId: 'uploaded-1',
        widthPx: 640,
        heightPx: 480,
      });
    });
  });

  describe('sharing sheet images with a PLC (D6)', () => {
    const graph: PaperSheetStimulus = {
      id: 'stim-1',
      label: 'Unit 3 graph',
      source: 'image',
      driveFileId: 'drive-1',
    };
    const withGraph = () => quiz({ paperSheetStimuli: [graph] });

    const clickPrint = () =>
      fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));

    it('never asks about a quiz nobody else can see', async () => {
      const { print } = setup({ quiz: withGraph() });
      selectWholeClass();
      clickPrint();
      await waitFor(() => expect(print).toHaveBeenCalled());
      expect(drive.listFilePermissions).not.toHaveBeenCalled();
      expect(drive.makePublic).not.toHaveBeenCalled();
    });

    it('will not let a click beat the Drive lookup and skip the ask', async () => {
      let answer!: (permissions: Array<{ id: string; type?: string }>) => void;
      drive.listFilePermissions.mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        })
      );
      setup({ quiz: withGraph(), inPlcGroup: true });
      selectWholeClass();
      // Empty `unshared` while Drive is still thinking is not "nothing to
      // share", so the button stays out of reach until it answers.
      expect(screen.getByRole('button', { name: /^Print$/ })).toBeDisabled();
      answer([]);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /^Print$/ })).toBeEnabled()
      );
    });

    it('asks Drive nothing new when the teacher reorders the stack', async () => {
      const map: PaperSheetStimulus = {
        id: 'stim-2',
        label: 'Region map',
        source: 'image',
        driveFileId: 'drive-2',
      };
      setup({
        quiz: quiz({ paperSheetStimuli: [graph, map] }),
        inPlcGroup: true,
      });
      await waitFor(() =>
        expect(drive.listFilePermissions).toHaveBeenCalledTimes(2)
      );
      selectWholeClass();

      // The section opens itself when the quiz already has a stack.
      fireEvent.click(
        screen.getByRole('button', { name: 'Move Unit 3 graph down' })
      );

      // Same two files in a different order is the same question.
      expect(drive.listFilePermissions).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('button', { name: /^Print$/ })).toBeEnabled();
    });

    it('asks before printing a PLC quiz whose image only the owner can open', async () => {
      const { print } = setup({ quiz: withGraph(), inPlcGroup: true });
      await waitFor(() =>
        expect(drive.listFilePermissions).toHaveBeenCalledWith('drive-1')
      );
      selectWholeClass();
      clickPrint();

      expect(
        await screen.findByText(/"Unit 3 graph" is only visible to you/)
      ).toBeInTheDocument();
      expect(print).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: /Share and print/ }));
      await waitFor(() => expect(print).toHaveBeenCalled());
      expect(drive.makePublic).toHaveBeenCalledWith('drive-1', undefined);
    });

    it('prints anyway when the teacher would rather not share', async () => {
      const { print } = setup({ quiz: withGraph(), inPlcGroup: true });
      await waitFor(() => expect(drive.listFilePermissions).toHaveBeenCalled());
      selectWholeClass();
      clickPrint();
      fireEvent.click(
        await screen.findByRole('button', { name: /Print without sharing/ })
      );
      await waitFor(() => expect(print).toHaveBeenCalled());
      expect(drive.makePublic).not.toHaveBeenCalled();
    });

    it('does not ask again in the same sitting', async () => {
      const { print } = setup({ quiz: withGraph(), inPlcGroup: true });
      await waitFor(() => expect(drive.listFilePermissions).toHaveBeenCalled());
      selectWholeClass();
      clickPrint();
      fireEvent.click(
        await screen.findByRole('button', { name: /Print without sharing/ })
      );
      await waitFor(() => expect(print).toHaveBeenCalled());

      fireEvent.click(screen.getByRole('button', { name: /Print test paper/ }));
      // Back on the sheet screen the teacher would print again; no second ask.
      expect(screen.queryByText(/is only visible to you/)).toBeNull();
    });

    it('says nothing about an image the PLC can already open', async () => {
      drive.listFilePermissions.mockResolvedValue([
        { id: 'perm-1', type: 'anyone' },
      ]);
      const { print } = setup({ quiz: withGraph(), inPlcGroup: true });
      await waitFor(() => expect(drive.listFilePermissions).toHaveBeenCalled());
      selectWholeClass();
      clickPrint();
      await waitFor(() => expect(print).toHaveBeenCalled());
      expect(screen.queryByText(/is only visible to you/)).toBeNull();
    });

    it('tells the teacher when Drive refused to share, and still prints', async () => {
      drive.makePublic.mockRejectedValueOnce(new Error('403'));
      const { print, onError } = setup({
        quiz: withGraph(),
        inPlcGroup: true,
      });
      await waitFor(() => expect(drive.listFilePermissions).toHaveBeenCalled());
      selectWholeClass();
      clickPrint();
      fireEvent.click(
        await screen.findByRole('button', { name: /Share and print/ })
      );
      await waitFor(() => expect(print).toHaveBeenCalled());
      expect(onError).toHaveBeenCalledWith(
        expect.stringContaining('Unit 3 graph')
      );
    });
  });

  describe('a page of a PDF (D7)', () => {
    const pdf = () =>
      new File(['%PDF'], 'Unit 3 review.pdf', { type: 'application/pdf' });

    const choosePdf = async () => {
      setup({ quiz: quiz() });
      fireEvent.click(
        screen.getByRole('button', { name: /Add to the answer sheet/ })
      );
      fireEvent.change(fileInput(), { target: { files: [pdf()] } });
      return screen.findByText(/Which page goes on the sheet\?/);
    };

    it('asks which page, rather than printing the whole file', async () => {
      await choosePdf();
      expect(
        screen.getByText(/Unit 3 review\.pdf has 3 pages/)
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Page 3' })
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Page 4' })).toBeNull();
      // Nothing is on the sheet until a page is picked.
      expect(drive.uploadFile).not.toHaveBeenCalled();
    });

    it('renders the chosen page and uploads it as an ordinary image', async () => {
      await choosePdf();
      fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
      await waitFor(() => expect(drive.uploadFile).toHaveBeenCalled());

      expect(renderPdfPage).toHaveBeenCalledWith(2);
      // Printing must never need pdf.js, so a PNG goes to Drive, not the PDF.
      const [blob, name, folder] = drive.uploadFile.mock.calls[0];
      expect(blob).not.toBe(pdf());
      expect(name).toContain('Unit_3_review-p2.png');
      expect(folder).toBe('Assets/PaperSheetStimuli');

      const row = await screen.findByText('Unit 3 review — page 2');
      expect(row).toBeInTheDocument();
      // The picker closes, and the PDF is let go of.
      expect(screen.queryByText(/Which page goes on the sheet/)).toBeNull();
      expect(closePdf).toHaveBeenCalled();
    });

    it('carries the rendered size, so auto-fit knows the page shape', async () => {
      const { print } = setup({ quiz: quiz() });
      fireEvent.click(
        screen.getByRole('button', { name: /Add to the answer sheet/ })
      );
      fireEvent.change(fileInput(), { target: { files: [pdf()] } });
      fireEvent.click(await screen.findByRole('button', { name: 'Page 1' }));
      await screen.findByText('1 item');
      selectWholeClass();
      fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
      await waitFor(() => expect(print).toHaveBeenCalled());
      expect(print.mock.calls[0][0].sheetStimuli?.[0]).toMatchObject({
        widthPx: 1700,
        heightPx: 2200,
        driveFileId: 'uploaded-1',
      });
    });

    it('names a one-page file after the file, with no page number', async () => {
      pdfPageCount = 1;
      setup({ quiz: quiz() });
      fireEvent.click(
        screen.getByRole('button', { name: /Add to the answer sheet/ })
      );
      fireEvent.change(fileInput(), { target: { files: [pdf()] } });
      fireEvent.click(await screen.findByRole('button', { name: 'Page 1' }));
      expect(await screen.findByText('Unit 3 review')).toBeInTheDocument();
    });

    it('lets the teacher back out without adding anything', async () => {
      await choosePdf();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(closePdf).toHaveBeenCalled());
      expect(drive.uploadFile).not.toHaveBeenCalled();
      expect(screen.getByText('Nothing yet')).toBeInTheDocument();
    });

    it('will not let Cancel pull the document out from under a render', async () => {
      let finish!: () => void;
      renderPdfPage.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = () =>
              resolve({
                blob: new Blob(['page-1']),
                widthPx: 1700,
                heightPx: 2200,
              });
          })
      );
      const { onError } = setup({ quiz: quiz() });
      fireEvent.click(
        screen.getByRole('button', { name: /Add to the answer sheet/ })
      );
      fireEvent.change(fileInput(), { target: { files: [pdf()] } });
      fireEvent.click(await screen.findByRole('button', { name: 'Page 1' }));

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      finish();
      await waitFor(() => expect(drive.uploadFile).toHaveBeenCalled());
      expect(onError).not.toHaveBeenCalled();
    });

    it('says Drive is needed before parsing the PDF, not after', async () => {
      driveConnected = false;
      const { onError } = setup({ quiz: quiz() });
      fireEvent.click(
        screen.getByRole('button', { name: /Add to the answer sheet/ })
      );
      fireEvent.change(fileInput(), { target: { files: [pdf()] } });
      await waitFor(() =>
        expect(onError).toHaveBeenCalledWith(
          'Connect Google Drive to add an image to the answer sheet.'
        )
      );
      // No page picker to work through first.
      expect(screen.queryByRole('button', { name: 'Page 1' })).toBeNull();
      expect(renderPdfPage).not.toHaveBeenCalled();
    });

    it('lets the PDF go even if the modal is closed out from under it', async () => {
      const { unmount } = setup({ quiz: quiz() });
      fireEvent.click(
        screen.getByRole('button', { name: /Add to the answer sheet/ })
      );
      fireEvent.change(fileInput(), { target: { files: [pdf()] } });
      await screen.findByRole('button', { name: 'Page 1' });
      expect(closePdf).not.toHaveBeenCalled();

      // Nothing here clicks Cancel, so only unmount can release the worker.
      unmount();
      expect(closePdf).toHaveBeenCalled();
    });

    it('still turns away a file that is neither an image nor a PDF', async () => {
      const { onError } = setup({ quiz: quiz() });
      fireEvent.click(
        screen.getByRole('button', { name: /Add to the answer sheet/ })
      );
      fireEvent.change(fileInput(), {
        target: {
          files: [new File(['x'], 'notes.txt', { type: 'text/plain' })],
        },
      });
      await waitFor(() =>
        expect(onError).toHaveBeenCalledWith(
          '"notes.txt" is not an image or a PDF.'
        )
      );
    });
  });
});
