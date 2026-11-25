import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { PaperPrintModal } from '@/components/widgets/QuizWidget/components/PaperPrintModal';
import { isValidDraw, resolveQuizAssignment } from '@/utils/questionBanks';

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

/** Anything on the sheet sends the questions to a separate test paper. */
const SHEET_GRAPH: PaperSheetStimulus = {
  id: 'sheet-graph',
  label: 'Unit 3 graph',
  source: 'image',
  driveFileId: 'drive-graph',
  widthPx: 800,
  heightPx: 600,
};
const withSheetImage = () => {
  sheetImages = {
    src: { 'sheet-graph': 'blob:graph' },
    failed: [],
    loading: false,
  };
};

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
/** Features the signed-in teacher has; empty means the written-box flag is off. */
const features = new Set<string>();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature: (id: string) => features.has(id) }),
}));
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
  Plc,
  QuizData,
  QuizQuestion,
} from '@/types';
import {
  buildPaperSheetsHtml,
  type PaperPrintJob,
} from '@/utils/paperSheetPrint';

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

/** A printed group's stack for Period 1: the modal opens with its students already chosen. */
const WHOLE_CLASS = { label: '', students: { r1: ['s1', 's2'] } };

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
      group={WHOLE_CLASS}
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

describe('PaperPrintModal', () => {
  beforeEach(() => {
    sheetImages = { src: {}, failed: [], loading: false };
    pdfPageCount = 3;
    driveConnected = true;
    features.clear();
    vi.clearAllMocks();
    // clearAllMocks keeps whatever a test set with mockResolvedValue.
    drive.listFilePermissions.mockReset();
    drive.listFilePermissions.mockResolvedValue([]);
    drive.makePublic.mockResolvedValue(undefined);
  });

  describe('live preview', () => {
    const resizeObserver = globalThis.ResizeObserver;
    beforeEach(() => {
      features.add('paper-print-preview');
      globalThis.ResizeObserver = class {
        constructor(private cb: ResizeObserverCallback) {}
        observe() {
          this.cb(
            [
              {
                contentRect: { width: 400, height: 600 },
              } as ResizeObserverEntry,
            ],
            this
          );
        }
        unobserve() {
          return undefined;
        }
        disconnect() {
          return undefined;
        }
      };
    });
    afterEach(() => {
      globalThis.ResizeObserver = resizeObserver;
    });
    const pages = () => screen.getAllByTitle<HTMLIFrameElement>(/^Page \d+$/);
    // Every preview page, as one string.
    const frame = () => ({
      srcdoc: pages()
        .map((p) => p.srcdoc)
        .join(''),
    });

    it("draws the first student's packet without saving anything", () => {
      const { onSaveBatch, print } = setup();
      expect(frame().srcdoc).toContain('Alvarez, Sam');
      expect(frame().srcdoc).not.toContain('Baker, Jo');
      expect(onSaveBatch).not.toHaveBeenCalled();
      expect(print).not.toHaveBeenCalled();
    });

    it('draws the same pages the print sends', async () => {
      const { print } = setup({
        quiz: quiz({ questions: [{ ...mc('q1'), text: 'Which is a cell?' }] }),
      });
      const preview = frame().srcdoc;
      expect(preview).toContain('Which is a cell?');
      fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
      await waitFor(() => expect(print).toHaveBeenCalled());
      const job = print.mock.calls[0][0];
      const first = buildPaperSheetsHtml({ ...job, sheets: [job.sheets[0]] });
      expect(preview).toContain('Which is a cell?');
      expect(pages()).toHaveLength(first.match(/class="sheet"/g)?.length ?? 0);
      for (const p of pages()) expect(p.getAttribute('sandbox')).toBe('');
    });

    it('stays off without the flag', () => {
      features.clear();
      setup();
      expect(screen.queryByRole('list', { name: 'Printed pages' })).toBeNull();
    });
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
    setup({ onSaveBatch, print: print });
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    expect(order).toEqual(['save', 'print']);
  });

  it('never prints when the batch could not be saved', async () => {
    const onSaveBatch = vi.fn().mockRejectedValue(new Error('offline'));
    const { print, onError, onClose } = setup({ onSaveBatch });
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('offline'));
    expect(print).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('prints a quiz that pulls from a bank, each sheet with its own recorded draw', async () => {
    const pool = ['b1', 'b2', 'b3', 'b4', 'b5'].map((id) => mc(id));
    const bankQuiz = quiz({
      questions: [mc('q1')],
      bankSlots: [
        {
          id: 'slot-1',
          bankId: 'bank-1',
          bankTitle: 'Unit bank',
          mode: 'random',
          count: 2,
        },
      ],
    });
    const resolved = resolveQuizAssignment(
      bankQuiz,
      new Map([
        ['bank-1', { id: 'bank-1', title: 'Unit bank', questions: pool }],
      ])
    );
    const { onSaveBatch, print } = setup({ quiz: bankQuiz, resolved });
    expect(screen.queryByText(/will not be on the/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Blank spare sheets/i), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    const batch = onSaveBatch.mock.calls[0][0];
    expect(batch.questionCount).toBe(3);
    expect(batch.versions).toHaveLength(2);
    for (const version of batch.versions ?? []) {
      expect(
        isValidDraw(
          resolved.questions.map((q) => q.id),
          resolved.sessionSlots,
          version.servedQuestionIds
        )
      ).toBe(true);
    }
    expect(Object.values(batch.seatVersions ?? {})).toEqual([0, 1]);
    const job = print.mock.calls[0][0];
    expect(job.versions?.map((v) => v.label)).toEqual([
      'Version 1',
      'Version 2',
    ]);
    expect(job.sheets.map((s) => s.versionIndex)).toEqual([0, 1]);
  });

  it('records each printed seat against its roster', async () => {
    const { onSaveBatch, print } = setup();
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

  it('records the printed choice order and opens each packet with the matching test paper', async () => {
    withSheetImage();
    const { onSaveBatch, print, onClose } = setup({
      quiz: quiz({ paperSheetStimuli: [SHEET_GRAPH] }),
    });
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    const batch = onSaveBatch.mock.calls[0][0];
    expect([...(batch.choiceOrder?.q1 ?? [])].sort()).toEqual([
      'a',
      'd0',
      'd1',
      'd2',
    ]);
    const job = print.mock.calls[0][0];
    const paper = job.testPaper ?? '';
    expect(paper).toContain('Unit 3 Test');
    expect(job.testPaperStyles).toContain('.tp ');
    const lists = [...paper.matchAll(/<ol class="c">(.*?)<\/ol>/g)].map((m) =>
      [...m[1].matchAll(/<span class="text">([^<]*)<\/span>/g)].map((c) => c[1])
    );
    expect(lists).toEqual([batch.choiceOrder?.q1, batch.choiceOrder?.q2]);
    // The window closes the dialog once it has the pictures it borrows.
    expect(onClose).not.toHaveBeenCalled();
    job.onImagesReady?.();
    expect(onClose).toHaveBeenCalledOnce();
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
    // Each question-text row prints only its own bubbles, so there is nothing to leave blank.
    expect(screen.queryByText(/fewer than 5 choices/)).toBeNull();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it("prints a group's supports on pages after the question sheet", async () => {
    const { print } = setup({
      quiz: quiz({ questions: [mc('q1'), mc('q2')] }),
      group: {
        label: 'Group 1',
        students: { r1: ['s1'] },
        supports: [{ title: 'Word bank', body: 'nucleus, ribosome' }],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    const job = print.mock.calls[0][0];
    expect(job.columnsPerPage).toBe('questions');
    expect(job.testPaper).toBeUndefined();
    expect(job.resourcePages?.map((p) => p.title)).toEqual(['Supports']);
    expect(job.resourcePages?.[0].html).toContain('nucleus, ribosome');
  });

  it('prints a section heading above its first question on the sheet', async () => {
    const { print } = setup({
      quiz: quiz({
        questions: [mc('q1'), mc('q2')],
        sections: [{ id: 's1', title: 'Part B heading' }],
        order: [
          { kind: 'question', id: 'q1' },
          { kind: 'section', id: 's1' },
          { kind: 'question', id: 'q2' },
        ],
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    const job = print.mock.calls[0][0];
    expect(job.columnsPerPage).toBe('questions');
    expect(job.testPaper).toBeUndefined();
    expect(Object.keys(job.sectionHeadings ?? {})).toEqual(['q2']);
    const items = job.pageMaps?.flatMap((m) => m.items) ?? [];
    expect(
      items.find((i) => i.questionId === 'q2')?.sectionTopMm
    ).toBeDefined();
    expect(
      items.find((i) => i.questionId === 'q1')?.sectionTopMm
    ).toBeUndefined();
    expect(buildPaperSheetsHtml(job)).toContain('Part B heading');
  });

  it('prints each question beside its bubbles on the tall-row layout', async () => {
    const tenQuestions = quiz({
      questions: Array.from({ length: 10 }, (_, i) => mc(`q${i}`)),
    });
    const { print, onSaveBatch } = setup({ quiz: tenQuestions });
    fireEvent.change(screen.getByLabelText(/Blank spare sheets/i), {
      target: { value: '0' },
    });
    expect(screen.getByText(/2 sheets · 4 pages/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Include question text')).toBeNull();
    expect(screen.queryByText(/answer key/i)).toBeNull();

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
      fireEvent.change(screen.getByLabelText(/Blank spare sheets/i), {
        target: { value: '0' },
      });
      const withText = screen.getByText(/2 sheets · \d+ pages/).textContent;

      fireEvent.click(
        screen.getByRole('button', { name: /Add to the response sheet/ })
      );
      fireEvent.click(screen.getByRole('button', { name: 'From Drive' }));
      await screen.findByText('1 item');
      // The band takes the right half, so the questions move to a test paper and 30 rows fill one column of two pages (D1).
      expect(screen.getByText(/2 sheets · 4 pages/)).toBeInTheDocument();
      expect(withText).not.toMatch(/2 sheets · 4 pages/);
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

    it('prints the questions on a sheet with nothing else on it', async () => {
      const { print, onSaveBatch } = setup();
      fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
      await waitFor(() => expect(print).toHaveBeenCalled());
      expect(onSaveBatch.mock.calls[0][0].sheetLayout).toBe('questions');
      const job = print.mock.calls[0][0];
      expect(job.columnsPerPage).toBe('questions');
      expect(job.sheetStimuli).toBeUndefined();
      expect(job.testPaper).toBeUndefined();
    });

    it('blocks the print, and the batch, on an image it could not fetch', () => {
      sheetImages = { src: {}, failed: [graph], loading: false };
      const { print, onSaveBatch, onError } = setup({
        quiz: quiz({ paperSheetStimuli: [graph] }),
      });
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
      expect(screen.getByRole('button', { name: /^Print$/ })).toBeDisabled();
    });

    it('saves the stimuli onto the quiz before the batch that points at it', async () => {
      const order: string[] = [];
      const onSavePrintSetup = vi.fn(() => {
        order.push('quiz');
        return Promise.resolve(undefined);
      });
      const onSaveBatch = vi.fn(() => {
        order.push('batch');
        return Promise.resolve();
      });
      const { print } = setup({
        quiz: quiz({ paperSheetStimuli: [graph] }),
        onSavePrintSetup,
        onSaveBatch,
      });
      fireEvent.change(screen.getByLabelText('Caption for Unit 3 graph'), {
        target: { value: 'Use for 1-10' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
      await waitFor(() => expect(print).toHaveBeenCalled());
      expect(onSavePrintSetup).toHaveBeenCalledWith({
        stimuli: [{ ...graph, caption: 'Use for 1-10' }],
        boxSizes: {},
        boxStyles: {},
      });
      expect(order).toEqual(['quiz', 'batch']);
    });

    it('does not re-save a quiz whose sheet nobody touched', async () => {
      const onSavePrintSetup = vi.fn();
      const { print } = setup({
        quiz: quiz({ paperSheetStimuli: [graph] }),
        onSavePrintSetup,
      });
      fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
      await waitFor(() => expect(print).toHaveBeenCalled());
      // An unchanged save would publish a new PLC version on every print.
      expect(onSavePrintSetup).not.toHaveBeenCalled();
    });

    it('stays open until the print window has the images, then closes', async () => {
      const { print, onClose } = setup();
      fireEvent.click(
        screen.getByRole('button', { name: /Add to the response sheet/ })
      );
      fireEvent.click(screen.getByRole('button', { name: 'From Drive' }));
      await screen.findByText('1 item');
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
      clickPrint();
      fireEvent.click(
        await screen.findByRole('button', { name: /Print without sharing/ })
      );
      await waitFor(() => expect(print).toHaveBeenCalled());
      expect(drive.makePublic).not.toHaveBeenCalled();
    });

    it('says nothing about an image the PLC can already open', async () => {
      drive.listFilePermissions.mockResolvedValue([
        { id: 'perm-1', type: 'anyone' },
      ]);
      const { print } = setup({ quiz: withGraph(), inPlcGroup: true });
      await waitFor(() => expect(drive.listFilePermissions).toHaveBeenCalled());
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
        screen.getByRole('button', { name: /Add to the response sheet/ })
      );
      fireEvent.change(fileInput(), { target: { files: [pdf()] } });
      return screen.findByText(/Which page goes on the sheet\?/);
    };

    const pickPage = async (page: number) => {
      fireEvent.change(await screen.findByLabelText('Page number'), {
        target: { value: String(page) },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add page' }));
    };

    it('asks which page, rather than printing the whole file', async () => {
      await choosePdf();
      expect(
        screen.getByText(/Unit 3 review\.pdf has 3 pages/)
      ).toBeInTheDocument();
      const page = screen.getByLabelText('Page number');
      expect(page).toHaveAttribute('max', '3');
      fireEvent.change(page, { target: { value: '4' } });
      expect(screen.getByRole('button', { name: 'Add page' })).toBeDisabled();
      // Nothing is on the sheet until a page is picked.
      expect(drive.uploadFile).not.toHaveBeenCalled();
    });

    it('renders the chosen page and uploads it as an ordinary image', async () => {
      await choosePdf();
      await pickPage(2);
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
        screen.getByRole('button', { name: /Add to the response sheet/ })
      );
      fireEvent.change(fileInput(), { target: { files: [pdf()] } });
      await pickPage(1);
      await screen.findByText('1 item');
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
        screen.getByRole('button', { name: /Add to the response sheet/ })
      );
      fireEvent.change(fileInput(), { target: { files: [pdf()] } });
      await pickPage(1);
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
        screen.getByRole('button', { name: /Add to the response sheet/ })
      );
      fireEvent.change(fileInput(), { target: { files: [pdf()] } });
      await pickPage(1);

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      finish();
      await waitFor(() => expect(drive.uploadFile).toHaveBeenCalled());
      expect(onError).not.toHaveBeenCalled();
    });

    it('says Drive is needed before parsing the PDF, not after', async () => {
      driveConnected = false;
      const { onError } = setup({ quiz: quiz() });
      fireEvent.click(
        screen.getByRole('button', { name: /Add to the response sheet/ })
      );
      fireEvent.change(fileInput(), { target: { files: [pdf()] } });
      await waitFor(() =>
        expect(onError).toHaveBeenCalledWith(
          'Connect Google Drive to add an image to the response sheet.'
        )
      );
      // No page picker to work through first.
      expect(screen.queryByLabelText('Page number')).toBeNull();
      expect(renderPdfPage).not.toHaveBeenCalled();
    });

    it('lets the PDF go even if the modal is closed out from under it', async () => {
      const { unmount } = setup({ quiz: quiz() });
      fireEvent.click(
        screen.getByRole('button', { name: /Add to the response sheet/ })
      );
      fireEvent.change(fileInput(), { target: { files: [pdf()] } });
      await screen.findByLabelText('Page number');
      expect(closePdf).not.toHaveBeenCalled();

      // Nothing here clicks Cancel, so only unmount can release the worker.
      unmount();
      expect(closePdf).toHaveBeenCalled();
    });

    it('still turns away a file that is neither an image nor a PDF', async () => {
      const { onError } = setup({ quiz: quiz() });
      fireEvent.click(
        screen.getByRole('button', { name: /Add to the response sheet/ })
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

describe('PaperPrintModal with handwritten answers', () => {
  beforeEach(() => {
    sheetImages = { src: {}, failed: [], loading: false };
    driveConnected = true;
    features.clear();
    features.add('paper-handwritten-responses');
    vi.clearAllMocks();
    drive.listFilePermissions.mockResolvedValue([]);
  });

  const fr = (id: string, over: Partial<QuizQuestion> = {}): QuizQuestion => ({
    id,
    timeLimit: 0,
    text: `Explain ${id}`,
    type: 'free-response',
    correctAnswer: '',
    incorrectAnswers: [],
    ...over,
  });

  const printIt = async (print: ReturnType<typeof setup>['print']) => {
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(print).toHaveBeenCalled());
  };

  it('prints free-response questions as boxes and stores the page maps on the batch', async () => {
    const { onSaveBatch, print } = setup({
      quiz: quiz({ questions: [mc('q1'), fr('w1'), mc('q2')] }),
    });
    expect(screen.getByText('3 from this quiz')).toBeInTheDocument();
    await printIt(print);
    const batch = onSaveBatch.mock.calls[0][0];
    expect(batch.layoutVersion).toBe(2);
    expect(batch.questionCount).toBe(2);
    expect(batch.pagesPerSheet).toBe(batch.pageMaps?.length);
    const job = print.mock.calls[0][0];
    expect(job.pageMaps).toEqual(batch.pageMaps);
    expect(job.writtenTexts).toEqual({ w1: 'Explain w1' });
    const labels = batch.pageMaps?.flatMap((m) =>
      m.items.map((i) => `${i.kind}:${i.label}`)
    );
    expect(labels).toEqual(['mc:1', 'written:2', 'mc:3']);
  });

  it('hides the choice count when the quiz has only written questions', () => {
    setup({ quiz: quiz({ questions: [fr('w1')] }) });
    expect(screen.getByText('1 from this quiz')).toBeInTheDocument();
    expect(screen.queryByText(/Choices per question/i)).not.toBeInTheDocument();
  });

  it('shows the choice count when the quiz has bubble questions', () => {
    setup({ quiz: quiz({ questions: [mc('q1'), fr('w1')] }) });
    expect(screen.getByText(/Choices per question/i)).toBeInTheDocument();
  });

  it('sizes written boxes here, starting from the saved size or the word limit', () => {
    setup({
      quiz: quiz({
        questions: [
          fr('w1', { paperBoxSize: 'L' }),
          fr('w2', { maxWords: 20 }),
        ],
      }),
    });
    expect(screen.getByText('Written answers')).toBeInTheDocument();
    // A quiz saved with the older Large size reads as a custom 12 lines.
    expect(screen.getByLabelText('Question 1 box size')).toHaveValue('custom');
    expect(screen.getByLabelText('Question 1 box size, lines')).toHaveValue(12);
    expect(screen.getByLabelText('Question 2 box size')).toHaveValue('S');
  });

  it('offers a custom line count and prints it', async () => {
    withSheetImage();
    const onSavePrintSetup = vi.fn().mockResolvedValue(undefined);
    const { onSaveBatch, print } = setup({
      quiz: quiz({ questions: [fr('w1')], paperSheetStimuli: [SHEET_GRAPH] }),
      onSavePrintSetup,
    });
    expect(screen.queryByLabelText('Question 1 box size, lines')).toBeNull();
    fireEvent.change(screen.getByLabelText('Question 1 box size'), {
      target: { value: 'custom' },
    });
    fireEvent.change(screen.getByLabelText('Question 1 box size, lines'), {
      target: { value: '15' },
    });
    await printIt(print);
    expect(onSavePrintSetup).toHaveBeenCalledWith({
      stimuli: [SHEET_GRAPH],
      boxSizes: { w1: 15 },
      boxStyles: {},
    });
    const lines = onSaveBatch.mock.calls[0][0].pageMaps?.flatMap((m) =>
      m.items.flatMap((i) => (i.kind === 'written' ? [i.lines] : []))
    );
    expect(lines).toEqual([15]);
  });

  it('prints a page count without asking for lines, behind its flag', async () => {
    features.add('paper-multi-page-answers');
    const onSavePrintSetup = vi.fn().mockResolvedValue(undefined);
    const { onSaveBatch, print } = setup({
      quiz: quiz({ questions: [fr('w1')] }),
      onSavePrintSetup,
    });
    fireEvent.change(screen.getByLabelText('Question 1 box size'), {
      target: { value: 'full' },
    });
    expect(screen.queryByLabelText('Question 1 box size, lines')).toBeNull();
    fireEvent.change(screen.getByLabelText('Question 1 box size, pages'), {
      target: { value: '3' },
    });
    await printIt(print);
    expect(onSavePrintSetup).toHaveBeenCalledWith({
      stimuli: [],
      boxSizes: { w1: 'pages-3' },
      boxStyles: {},
    });
    const boxes = onSaveBatch.mock.calls[0][0].pageMaps?.flatMap((m) =>
      m.items.flatMap((i) =>
        i.kind === 'written'
          ? [`${m.page}:${i.questionId}:${!!i.continued}`]
          : []
      )
    );
    expect(boxes).toEqual(['1:w1:false', '2:w1:true', '3:w1:true']);
  });

  it('offers one full page without a page count when the flag is off', () => {
    setup({ quiz: quiz({ questions: [fr('w1')] }) });
    fireEvent.change(screen.getByLabelText('Question 1 box size'), {
      target: { value: 'full' },
    });
    expect(screen.queryByLabelText('Question 1 box size, pages')).toBeNull();
    expect(screen.queryByLabelText('Question 1 box size, lines')).toBeNull();
  });

  it('prints the picked box size and saves only the sizes that changed', async () => {
    withSheetImage();
    const onSavePrintSetup = vi.fn().mockResolvedValue(undefined);
    const { onSaveBatch, print } = setup({
      quiz: quiz({
        questions: [fr('w1', { paperBoxSize: 'L' }), fr('w2')],
        paperSheetStimuli: [SHEET_GRAPH],
      }),
      onSavePrintSetup,
    });
    fireEvent.change(screen.getByLabelText('Question 2 box size'), {
      target: { value: 'S' },
    });
    await printIt(print);
    expect(onSavePrintSetup).toHaveBeenCalledWith({
      stimuli: [SHEET_GRAPH],
      boxSizes: { w2: 'S' },
      boxStyles: {},
    });
    const lines = onSaveBatch.mock.calls[0][0].pageMaps?.flatMap((m) =>
      m.items.flatMap((i) => (i.kind === 'written' ? [i.lines] : []))
    );
    expect(lines).toEqual([12, 3]);
  });

  it('prints the picked answer style and saves only the styles that changed', async () => {
    const onSavePrintSetup = vi.fn().mockResolvedValue(undefined);
    const { onSaveBatch, print } = setup({
      quiz: quiz({
        questions: [fr('w1', { paperBoxStyle: 'graph' }), fr('w2'), fr('w3')],
      }),
      onSavePrintSetup,
    });
    expect(screen.getByLabelText('Question 1 answer style')).toHaveValue(
      'graph'
    );
    expect(screen.getByLabelText('Question 2 answer style')).toHaveValue(
      'lines'
    );
    fireEvent.change(screen.getByLabelText('Question 2 answer style'), {
      target: { value: 'coordinate' },
    });
    fireEvent.change(screen.getByLabelText('Question 3 answer style'), {
      target: { value: 'lines' },
    });
    await printIt(print);
    expect(onSavePrintSetup).toHaveBeenCalledWith({
      stimuli: [],
      boxSizes: {},
      boxStyles: { w2: { style: 'coordinate' } },
    });
    const styles = onSaveBatch.mock.calls[0][0].pageMaps?.flatMap((m) =>
      m.items.flatMap((i) => (i.kind === 'written' ? [i.style] : []))
    );
    expect(styles).toEqual(['graph', 'coordinate', undefined]);
  });

  it('prints a custom image from the quiz and saves it on the question', async () => {
    sheetImages = { src: { map: 'blob:map' }, failed: [], loading: false };
    const onSavePrintSetup = vi.fn().mockResolvedValue(undefined);
    const { onSaveBatch, print } = setup({
      quiz: quiz({
        questions: [fr('w1')],
        stimuli: [
          {
            id: 'map',
            type: 'image',
            label: 'Blank map',
            url: 'https://example.com/map.png',
          },
        ],
      }),
      onSavePrintSetup,
    });
    fireEvent.change(screen.getByLabelText('Question 1 answer style'), {
      target: { value: 'image' },
    });
    expect(screen.getByLabelText('Question 1 image')).toHaveValue('map');
    await printIt(print);
    const image = {
      id: 'map',
      label: 'Blank map',
      source: 'image',
      url: 'https://example.com/map.png',
    };
    expect(onSavePrintSetup).toHaveBeenCalledWith({
      stimuli: [],
      boxSizes: {},
      boxStyles: { w1: { style: 'image', image } },
    });
    const items = onSaveBatch.mock.calls[0][0].pageMaps?.flatMap((m) =>
      m.items.flatMap((i) => (i.kind === 'written' ? [i.style] : []))
    );
    expect(items).toEqual(['image']);
    expect(print.mock.calls[0][0].writtenImages).toEqual({ w1: 'blob:map' });
  });

  it('does not save the quiz when no box size changed', async () => {
    const onSavePrintSetup = vi.fn();
    const { print } = setup({
      quiz: quiz({ questions: [fr('w1')] }),
      onSavePrintSetup,
    });
    fireEvent.change(screen.getByLabelText('Question 1 box size'), {
      target: { value: 'M' },
    });
    await printIt(print);
    expect(onSavePrintSetup).not.toHaveBeenCalled();
  });

  it('prints a bubble-only quiz without page maps when the questions go on a test paper', async () => {
    withSheetImage();
    const { onSaveBatch, print } = setup({
      quiz: quiz({ paperSheetStimuli: [SHEET_GRAPH] }),
    });
    await printIt(print);
    const batch = onSaveBatch.mock.calls[0][0];
    expect(batch.layoutVersion).toBeUndefined();
    expect(batch.pageMaps).toBeUndefined();
    expect(print.mock.calls[0][0].pageMaps).toBeUndefined();
  });

  it('keeps free-response off the sheet when the flag is off', async () => {
    features.clear();
    const { onSaveBatch, print } = setup({
      quiz: quiz({ questions: [mc('q1'), fr('w1')] }),
    });
    expect(screen.getByText(/1 question will not be on/)).toBeInTheDocument();
    await printIt(print);
    const written = onSaveBatch.mock.calls[0][0].pageMaps?.flatMap((m) =>
      m.items.filter((i) => i.kind === 'written')
    );
    expect(written ?? []).toEqual([]);
  });

  it('lists a recording question as left off the sheet', () => {
    setup({
      quiz: quiz({
        questions: [mc('q1'), fr('w1', { recording: 'required' } as never)],
      }),
    });
    expect(screen.getByText(/1 question will not be on/)).toBeInTheDocument();
  });

  it('prints written questions inside a choose section', () => {
    setup({
      quiz: quiz({
        questions: [mc('q1'), fr('w1'), fr('w2')],
        sections: [{ id: 's1', title: 'Pick one', chooseCount: 1 }],
        order: [
          { kind: 'question', id: 'q1' },
          { kind: 'section', id: 's1' },
          { kind: 'question', id: 'w1' },
          { kind: 'question', id: 'w2' },
        ],
      }),
    });
    expect(
      screen.queryByText(/Written questions can.t be in a choose section/)
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Print$/ })).toBeEnabled();
  });

  it('prints written questions in place on the test paper, numbered like the sheet', async () => {
    withSheetImage();
    const { print } = setup({
      quiz: quiz({
        questions: [mc('q1'), fr('w1'), mc('q2')],
        paperSheetStimuli: [SHEET_GRAPH],
      }),
    });
    await printIt(print);
    const paper = print.mock.calls[0][0].testPaper ?? '';
    expect(
      [...paper.matchAll(/<span class="num">(\d+)\.<\/span>/g)].map((m) => m[1])
    ).toEqual(['1', '2', '3']);
    expect(paper.match(/class="written"/g)).toHaveLength(1);
  });

  it("prints a translated group's test paper words in its language", async () => {
    withSheetImage();
    const { print } = setup({
      quiz: quiz({
        questions: [mc('q1'), fr('w1')],
        paperSheetStimuli: [SHEET_GRAPH],
      }),
      group: {
        label: 'Group 1 · Spanish',
        students: { r1: ['s1'] },
        translation: { language: 'es', questions: {} },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Print$/ }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    const paper = print.mock.calls[0][0].testPaper ?? '';
    expect(paper).toContain('Escribe tu respuesta en tu hoja de respuestas.');
  });

  it('refuses a sheet past the page limit before saving anything', () => {
    const { onSaveBatch } = setup({
      quiz: quiz({
        questions: Array.from({ length: 64 }, (_, i) =>
          fr(`w${i}`, { paperBoxSize: 'full' })
        ),
      }),
    });
    expect(screen.getByText(/needs 64 pages/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Print$/ })).toBeDisabled();
    expect(onSaveBatch).not.toHaveBeenCalled();
  });
});

describe('PaperPrintModal on the Assign on paper stepper', () => {
  beforeEach(() => {
    sheetImages = { src: {}, failed: [], loading: false };
    features.clear();
    vi.clearAllMocks();
  });

  const pickPeriod1 = () => {
    fireEvent.click(screen.getByLabelText(/Period 1/, { selector: 'input' }));
  };

  const assignSetup = (
    assignOver: Partial<
      NonNullable<React.ComponentProps<typeof PaperPrintModal>['assign']>
    > = {},
    over: Partial<React.ComponentProps<typeof PaperPrintModal>> = {}
  ) => {
    const onCreateAssignment = vi.fn().mockResolvedValue(undefined);
    const result = setup({
      assign: {
        plcs: [],
        initialSharing: { plcMode: false, plcId: '' },
        onCreateAssignment,
        ...assignOver,
      },
      ...over,
    });
    return { ...result, onCreateAssignment };
  };

  it('picks classes in the stepper and has no separate sheet list', () => {
    assignSetup();
    expect(screen.queryByText(/Who gets a sheet/i)).toBeNull();
    expect(
      screen.getByRole('button', { name: /Assign and print/ })
    ).toBeInTheDocument();
  });

  it('saves the batch, then makes the paper assignment, then prints', async () => {
    const order: string[] = [];
    const onSaveBatch = vi.fn((_batch: PaperBatch) => {
      order.push('save');
      return Promise.resolve();
    });
    const print = vi.fn(() => {
      order.push('print');
    });
    const onCreateAssignment = vi.fn(() => {
      order.push('assign');
      return Promise.resolve();
    });
    assignSetup({ onCreateAssignment }, { onSaveBatch, print });
    pickPeriod1();
    fireEvent.click(screen.getByRole('button', { name: /Assign and print/ }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    expect(order).toEqual(['save', 'assign', 'print']);
    const batch = onSaveBatch.mock.calls[0][0];
    expect(Object.values(batch.seats)).toEqual([
      { rosterId: 'r1', studentId: 's1' },
      { rosterId: 'r1', studentId: 's2' },
    ]);
    expect(onCreateAssignment).toHaveBeenCalledWith({
      batchId: batch.id,
      rosterIds: ['r1'],
      periodNames: ['Period 1'],
      sharing: null,
    });
  });

  it('makes the paper assignment from the quiz this print just saved', async () => {
    features.add('paper-handwritten-responses');
    const fr = (
      id: string,
      over: Partial<QuizQuestion> = {}
    ): QuizQuestion => ({
      id,
      timeLimit: 0,
      text: `Explain ${id}`,
      type: 'free-response',
      correctAnswer: '',
      incorrectAnswers: [],
      ...over,
    });
    const saved = quiz({ questions: [fr('w1', { paperBoxSize: 'S' })] });
    const onSavePrintSetup = vi.fn().mockResolvedValue(saved);
    const { onCreateAssignment, print } = assignSetup(
      {},
      { quiz: quiz({ questions: [fr('w1')] }), onSavePrintSetup }
    );
    pickPeriod1();
    fireEvent.click(screen.getByText('Response sheets'));
    fireEvent.change(screen.getByLabelText('Question 1 box size'), {
      target: { value: 'custom' },
    });
    fireEvent.change(screen.getByLabelText('Question 1 box size, lines'), {
      target: { value: '15' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Assign and print/ }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    expect(onCreateAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ quiz: saved })
    );
  });

  it('never prints when the paper assignment could not be made', async () => {
    const onCreateAssignment = vi.fn().mockRejectedValue(new Error('offline'));
    const { print, onError } = assignSetup({ onCreateAssignment });
    pickPeriod1();
    fireEvent.click(screen.getByRole('button', { name: /Assign and print/ }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('offline'));
    expect(print).not.toHaveBeenCalled();
  });

  it('retries with the saved stack instead of saving another', async () => {
    const onCreateAssignment = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const { print, onError, onSaveBatch } = assignSetup({
      onCreateAssignment,
    });
    pickPeriod1();
    const submit = screen.getByRole('button', { name: /Assign and print/ });
    fireEvent.click(submit);
    await waitFor(() => expect(onError).toHaveBeenCalledWith('offline'));
    fireEvent.click(submit);
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(onSaveBatch).toHaveBeenCalledTimes(1);
    expect(onCreateAssignment).toHaveBeenCalledTimes(2);
    expect(print.mock.calls[0][0].batchId).toBe(
      onSaveBatch.mock.calls[0][0].id
    );
  });

  it('replans over the saved stack when the picks change before a retry', async () => {
    const onCreateAssignment = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const { print, onError, onSaveBatch } = assignSetup({
      onCreateAssignment,
    });
    pickPeriod1();
    const submit = screen.getByRole('button', { name: /Assign and print/ });
    fireEvent.click(submit);
    await waitFor(() => expect(onError).toHaveBeenCalledWith('offline'));
    fireEvent.click(screen.getByText('Response sheets'));
    fireEvent.change(screen.getByLabelText(/Blank spare sheets/i), {
      target: { value: '5' },
    });
    fireEvent.click(submit);
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(onSaveBatch).toHaveBeenCalledTimes(2);
    const batch = onSaveBatch.mock.calls[1][0];
    expect(batch.spareSeats).toHaveLength(5);
    expect(batch.id).toBe(onSaveBatch.mock.calls[0][0].id);
    expect(onCreateAssignment).toHaveBeenLastCalledWith(
      expect.objectContaining({ batchId: batch.id, rosterIds: ['r1'] })
    );
  });

  it('passes the Sharing choice when the quiz syncs with a PLC', async () => {
    const plc = { id: 'plc-1', name: 'Science PLC' } as Plc;
    const { onCreateAssignment, print } = assignSetup({
      plcs: [plc],
      initialSharing: { plcMode: true, plcId: 'plc-1' },
    });
    expect(screen.getByText('Shared with Science PLC')).toBeInTheDocument();
    pickPeriod1();
    fireEvent.click(screen.getByRole('button', { name: /Assign and print/ }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    expect(onCreateAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ sharing: { plcMode: true, plcId: 'plc-1' } })
    );
  });
});
