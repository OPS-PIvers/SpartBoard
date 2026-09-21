import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { PaperPrintModal } from '@/components/widgets/QuizWidget/components/PaperPrintModal';

const drive = {
  uploadFile: vi.fn<
    (file: File, name: string, folder: string) => Promise<{ id: string }>
  >(() => Promise.resolve({ id: 'uploaded-1' })),
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

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ driveService: drive }),
}));
vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({ openPicker }),
}));
vi.mock('@/hooks/usePaperSheetStimulusImages', () => ({
  usePaperSheetStimulusImages: () => sheetImages,
}));

import type {
  ClassRoster,
  PaperBatch,
  PaperSheetStimulus,
  QuizData,
  QuizQuestion,
} from '@/types';
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
  render(
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
  return { onSaveBatch, print, onClose, onError };
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
    vi.clearAllMocks();
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
    expect(screen.getByText(/Answer sheets sent to print/)).toBeInTheDocument();

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
      screen.getByText(/Question 1 has fewer choices/)
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

    it('turns away a file that is not an image', async () => {
      const { onError } = setup({ quiz: quiz({ paperSheetStimuli: [graph] }) });
      const file = new File(['x'], 'notes.pdf', { type: 'application/pdf' });
      fireEvent.change(fileInput(), { target: { files: [file] } });
      await waitFor(() =>
        expect(onError).toHaveBeenCalledWith('"notes.pdf" is not an image.')
      );
      expect(drive.uploadFile).not.toHaveBeenCalled();
    });
  });
});
