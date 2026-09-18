import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { PaperImportModal } from '@/components/widgets/QuizWidget/components/PaperImportModal';
import type {
  ClassRoster,
  PaperBatch,
  PaperPendingReview,
  QuestionTargetTag,
  QuizData,
} from '@/types';
import { memoryCropStore } from '@/utils/paperCropStore';
import { paintSyntheticSheet } from '@/tests/testHelpers/paperSheetRaster';
import type {
  ImportPaperResponsesResult,
  ImportPaperSheetPayload,
} from '@/utils/paperImportPlan';
import type { RasterizedPage } from '@/utils/paperScanRaster';
import { paperBatchTag } from '@/utils/paperSheetMarker';
import { buildPaperStubQuiz } from '@/utils/paperSheetPlan';

// The real picker reads the standards catalog; a stand-in applies one tag.
const FAKE_TAG: QuestionTargetTag = {
  id: 'tag-1',
  kind: 'personal',
  label: 'Fractions',
};
vi.mock('@/components/quiz/targets/TargetPicker', () => ({
  TargetPicker: ({
    open,
    title,
    onApply,
  }: {
    open: boolean;
    title?: string;
    onApply: (tags: QuestionTargetTag[], mode: 'add' | 'replace') => void;
  }) =>
    open ? (
      <div>
        <p>{title}</p>
        <button type="button" onClick={() => onApply([FAKE_TAG], 'add')}>
          Apply fake tag
        </button>
      </div>
    ) : null,
}));

const stub: QuizData = buildPaperStubQuiz({
  quizId: 'quiz-1',
  title: 'Paper quiz',
  questionCount: 3,
  choiceCount: 4,
  createdAt: 0,
  newQuestionId: (() => {
    let n = 0;
    return () => `s${(n += 1)}`;
  })(),
});

const batch: PaperBatch = {
  id: 'batch-1',
  quizId: 'quiz-1',
  rosterIds: ['r1'],
  questionCount: 3,
  choiceCount: 4,
  seats: {
    1: { rosterId: 'r1', studentId: 's1' },
    2: { rosterId: 'r1', studentId: 's2' },
  },
  spareSeats: [3],
  keySheetSeat: 4,
  pagesPerSheet: 1,
  createdAt: Date.UTC(2026, 8, 18),
};

const roster: ClassRoster = {
  id: 'r1',
  name: 'Period 1',
  driveFileId: 'f',
  studentCount: 2,
  createdAt: 0,
  students: [
    { id: 's1', firstName: 'Sam', lastName: 'Alvarez', pin: '0001' },
    { id: 's2', firstName: 'Jo', lastName: 'Baker', pin: '0002' },
  ],
};

type Marks = { row: number; choice: number; density?: number }[];

const page = (seat: number, marks: Marks): RasterizedPage['page'] =>
  paintSyntheticSheet({
    marker: {
      batchTag: paperBatchTag(batch.id),
      seat,
      page: 1,
      isKeySheet: seat === batch.keySheetSeat,
    },
    questionCount: 3,
    choiceCount: 4,
    marks,
    pxPerMm: 4,
    seed: seat,
  });

const rasterizer = (pages: RasterizedPage['page'][]) =>
  async function* (): AsyncGenerator<RasterizedPage> {
    let n = 0;
    for (const p of pages) {
      n += 1;
      yield { pageNumber: n, page: p, crop: () => 'data:image/png;base64,x' };
      await Promise.resolve();
    }
  };

const setup = (
  pages: RasterizedPage['page'][],
  over: Partial<React.ComponentProps<typeof PaperImportModal>> = {}
) => {
  const onImport = vi
    .fn<
      (
        batchId: string,
        assignmentId: string,
        sheets: ImportPaperSheetPayload[]
      ) => Promise<ImportPaperResponsesResult>
    >()
    .mockImplementation((_b, _a, sheets) =>
      Promise.resolve({ written: sheets.map((s) => s.seat), collisions: [] })
    );
  const onCreateAssignment = vi.fn(() => Promise.resolve('assignment-1'));
  const onSaveQuiz = vi.fn<(q: QuizData) => Promise<void>>(() =>
    Promise.resolve()
  );
  const onClose = vi.fn();
  const onError = vi.fn();
  const onSavePending = vi.fn<
    (batchId: string, review: PaperPendingReview | null) => Promise<void>
  >(() => Promise.resolve());
  render(
    <PaperImportModal
      quiz={stub}
      batches={[batch]}
      rosters={[roster]}
      assignments={[]}
      onCreateAssignment={onCreateAssignment}
      onImport={onImport}
      onSaveQuiz={onSaveQuiz}
      onSavePending={onSavePending}
      onClose={onClose}
      onError={onError}
      rasterize={rasterizer(pages)}
      cropStore={memoryCropStore()}
      {...over}
    />
  );
  return {
    onImport,
    onCreateAssignment,
    onSaveQuiz,
    onSavePending,
    onClose,
    onError,
  };
};

const parkedReview = (): PaperPendingReview => ({
  savedAt: Date.UTC(2026, 8, 17),
  assignmentId: '',
  sheets: [
    {
      seat: 1,
      kind: 'student',
      student: { rosterId: 'r1', studentId: 's1' },
      answers: [
        { question: 0, choice: null, doubt: 'multiple' },
        { question: 1, choice: 3 },
        { question: 2, choice: 0 },
      ],
      pagesSeen: [1],
      missingPages: [],
      isBlank: false,
      flags: ['doubtful-rows'],
    },
  ],
  keySheet: {
    seat: 4,
    kind: 'key',
    student: null,
    answers: [
      { question: 0, choice: 1 },
      { question: 1, choice: 2 },
      { question: 2, choice: 0 },
    ],
    pagesSeen: [1],
    missingPages: [],
    isBlank: false,
    flags: [],
  },
  unreadablePages: [],
  foreignPages: [],
  unknownPages: [],
  key: { s1: 1, s2: 2, s3: 0 },
  keyConfirmed: true,
  spareAssignments: {},
  targets: {},
});

const chooseFile = () => {
  const input = screen.getByLabelText('Scan file');
  const file = new File([new Uint8Array(4)], 'scan.pdf', {
    type: 'application/pdf',
  });
  fireEvent.change(input, { target: { files: [file] } });
};

describe('PaperImportModal', () => {
  it('reads a stack, requires the key to be confirmed, then imports clean sheets', async () => {
    const { onImport, onSaveQuiz, onCreateAssignment } = setup([
      page(4, [
        { row: 0, choice: 1 },
        { row: 1, choice: 2 },
        { row: 2, choice: 0 },
      ]),
      page(1, [
        { row: 0, choice: 1 },
        { row: 1, choice: 3 },
      ]),
      page(2, []),
    ]);
    chooseFile();
    await waitFor(() =>
      expect(screen.getByText(/ready to import/)).toBeInTheDocument()
    );
    expect(screen.getByText(/1 blank sheet unused/)).toBeInTheDocument();

    const importButton = screen.getByRole('button', {
      name: /^Import 1 sheet$/,
    });
    expect(importButton).toBeDisabled();
    expect(screen.getByLabelText('Key for question 2')).toHaveValue('2');
    fireEvent.click(screen.getByLabelText('This key is correct'));
    expect(importButton).toBeEnabled();
    fireEvent.click(importButton);

    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    // Key lands before any response (Q19).
    expect(onSaveQuiz.mock.invocationCallOrder[0]).toBeLessThan(
      onImport.mock.invocationCallOrder[0]
    );
    const keyed = onSaveQuiz.mock.calls[0][0];
    expect(keyed.questions.map((q) => q.correctAnswer)).toEqual([
      'B',
      'C',
      'A',
    ]);
    expect(onCreateAssignment).toHaveBeenCalledOnce();
    const [batchId, assignmentId, sheets] = onImport.mock.calls[0];
    expect(batchId).toBe('batch-1');
    expect(assignmentId).toBe('assignment-1');
    expect(sheets).toEqual([
      {
        seat: 1,
        rosterId: 'r1',
        pin: '0001',
        classPeriod: 'Period 1',
        answers: [
          { questionId: 's1', answer: 'B' },
          { questionId: 's2', answer: 'D' },
          { questionId: 's3', answer: '', unresponded: 'passed' },
        ],
      },
    ]);
    expect(await screen.findByText(/1 response imported/)).toBeInTheDocument();
  });

  it('shows a doubtful row with its crop and lets the teacher settle it', async () => {
    const { onImport } = setup([
      page(4, [
        { row: 0, choice: 0 },
        { row: 1, choice: 0 },
        { row: 2, choice: 0 },
      ]),
      page(1, [
        { row: 0, choice: 1 },
        { row: 0, choice: 2 },
        { row: 1, choice: 3 },
      ]),
    ]);
    chooseFile();
    await waitFor(() =>
      expect(screen.getByText(/row to check/)).toBeInTheDocument()
    );
    expect(screen.getByAltText('Question 1 as scanned')).toBeInTheDocument();
    expect(screen.getByText('More than one bubble')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Question 1: C'));
    expect(screen.queryByText(/row to check/)).toBeNull();
    fireEvent.click(screen.getByLabelText('This key is correct'));
    fireEvent.click(screen.getByRole('button', { name: /^Import 1 sheet$/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    expect(onImport.mock.calls[0][2][0].answers[0]).toEqual({
      questionId: 's1',
      answer: 'C',
    });
  });

  it('imports an unresolved doubt as unclear rather than guessing', async () => {
    const { onImport } = setup([
      page(4, [
        { row: 0, choice: 0 },
        { row: 1, choice: 0 },
        { row: 2, choice: 0 },
      ]),
      page(1, [
        { row: 0, choice: 1 },
        { row: 0, choice: 2 },
      ]),
    ]);
    chooseFile();
    await waitFor(() =>
      expect(screen.getByText(/row to check/)).toBeInTheDocument()
    );
    fireEvent.click(screen.getByLabelText('This key is correct'));
    fireEvent.click(screen.getByRole('button', { name: /^Import 1 sheet$/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    expect(onImport.mock.calls[0][2][0].answers[0]).toEqual({
      questionId: 's1',
      answer: '',
      unresponded: 'paper-unclear',
    });
  });

  it('blocks a paper test whose key sheet is missing from the scan', async () => {
    setup([page(1, [{ row: 0, choice: 1 }])]);
    chooseFile();
    await waitFor(() =>
      expect(screen.getByText(/ready to import/)).toBeInTheDocument()
    );
    expect(
      screen.getByText(/ANSWER KEY sheet was not in this scan/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Import 1 sheet$/ })
    ).toBeDisabled();
  });

  it('lets a bubbled spare be assigned to a student, and skips it otherwise', async () => {
    const { onImport } = setup([
      page(4, [
        { row: 0, choice: 0 },
        { row: 1, choice: 0 },
        { row: 2, choice: 0 },
      ]),
      page(3, [{ row: 0, choice: 3 }]),
    ]);
    chooseFile();
    await waitFor(() =>
      expect(screen.getByText(/1 spare unassigned/)).toBeInTheDocument()
    );
    expect(
      screen.getByRole('button', { name: /^Import 0 sheets$/ })
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Student for seat 3'), {
      target: { value: 'r1/s2' },
    });
    fireEvent.click(screen.getByLabelText('This key is correct'));
    fireEvent.click(screen.getByRole('button', { name: /^Import 1 sheet$/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    expect(onImport.mock.calls[0][2][0]).toMatchObject({
      seat: 3,
      pin: '0002',
    });
  });

  it('reports collisions and replaces only the ticked ones', async () => {
    const onImport = vi
      .fn<
        (
          batchId: string,
          assignmentId: string,
          sheets: ImportPaperSheetPayload[]
        ) => Promise<ImportPaperResponsesResult>
      >()
      .mockResolvedValueOnce({
        written: [],
        collisions: [
          {
            seat: 1,
            responseKey: 'pin-period_1-0001',
            fromOtherBatch: false,
            existingSubmittedAt: Date.UTC(2026, 8, 1),
          },
        ],
      })
      .mockResolvedValueOnce({ written: [1], collisions: [] });
    setup(
      [
        page(4, [
          { row: 0, choice: 0 },
          { row: 1, choice: 0 },
          { row: 2, choice: 0 },
        ]),
        page(1, [{ row: 0, choice: 1 }]),
      ],
      { onImport }
    );
    chooseFile();
    await waitFor(() =>
      expect(screen.getByText(/ready to import/)).toBeInTheDocument()
    );
    fireEvent.click(screen.getByLabelText('This key is correct'));
    fireEvent.click(screen.getByRole('button', { name: /^Import 1 sheet$/ }));
    expect(
      await screen.findByText(/already has a response here/)
    ).toBeInTheDocument();
    expect(screen.getByText(/answered on a device/)).toBeInTheDocument();
    const replace = screen.getByRole('button', { name: 'Replace selected' });
    expect(replace).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Replace seat 1'));
    fireEvent.click(replace);
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(2));
    expect(onImport.mock.calls[1][2]).toEqual([
      expect.objectContaining({ seat: 1, replaceExisting: true }),
    ]);
    expect(await screen.findByText(/1 response imported/)).toBeInTheDocument();
    expect(screen.queryByText(/already has a response/)).toBeNull();
  });

  it('sets aside pages it cannot place', async () => {
    const blank = {
      width: 300,
      height: 400,
      data: new Uint8ClampedArray(300 * 400 * 4).fill(255),
    };
    setup([
      page(4, [
        { row: 0, choice: 0 },
        { row: 1, choice: 0 },
        { row: 2, choice: 0 },
      ]),
      blank,
    ]);
    chooseFile();
    await waitFor(() =>
      expect(screen.getByText(/Pages set aside/)).toBeInTheDocument()
    );
    expect(screen.getByText(/Page 2: could not be read/)).toBeInTheDocument();
  });

  it('explains when nothing has been printed yet', () => {
    setup([], { batches: [] });
    expect(
      screen.getByText(/No answer sheets have been printed/)
    ).toBeInTheDocument();
  });
  it('parks the review on the batch as it changes and clears it after import', async () => {
    const { onImport, onSavePending } = setup([
      page(4, [
        { row: 0, choice: 1 },
        { row: 1, choice: 2 },
        { row: 2, choice: 0 },
      ]),
      page(1, [
        { row: 0, choice: 1 },
        { row: 1, choice: 3 },
      ]),
    ]);
    chooseFile();
    await waitFor(() =>
      expect(screen.getByText(/ready to import/)).toBeInTheDocument()
    );
    await waitFor(() => expect(onSavePending).toHaveBeenCalled());
    const [batchId, parked] = onSavePending.mock.calls[0];
    expect(batchId).toBe('batch-1');
    expect(parked).toMatchObject({
      assignmentId: '',
      keyConfirmed: false,
      key: { s1: 1, s2: 2, s3: 0 },
    });
    expect(parked?.sheets.map((s) => s.seat)).toEqual([1]);
    expect(parked?.keySheet?.seat).toBe(4);

    fireEvent.click(screen.getByLabelText('This key is correct'));
    fireEvent.click(screen.getByRole('button', { name: /^Import 1 sheet$/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    await screen.findByText(/1 response imported/);
    expect(onSavePending).toHaveBeenLastCalledWith('batch-1', null);
  });

  it('resumes a parked review without rescanning, edits intact', async () => {
    const { onImport, onSaveQuiz } = setup([], {
      batches: [{ ...batch, pendingReview: parkedReview() }],
    });
    expect(screen.getByText(/A review from .* is waiting/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume review' }));
    await waitFor(() =>
      expect(screen.getByText(/row to check/)).toBeInTheDocument()
    );
    expect(screen.getByText('More than one bubble')).toBeInTheDocument();
    expect(screen.queryByAltText('Question 1 as scanned')).toBeNull();
    expect(screen.getByLabelText('This key is correct')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Question 1: B'));
    fireEvent.click(screen.getByRole('button', { name: /^Import 1 sheet$/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    expect(onImport.mock.calls[0][2][0].answers).toEqual([
      { questionId: 's1', answer: 'B' },
      { questionId: 's2', answer: 'D' },
      { questionId: 's3', answer: 'A' },
    ]);
    expect(onSaveQuiz).toHaveBeenCalledOnce();
  });

  it('discards a parked review on request', () => {
    const { onSavePending } = setup([], {
      batches: [{ ...batch, pendingReview: parkedReview() }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Discard it' }));
    expect(screen.queryByText(/is waiting/)).toBeNull();
    expect(onSavePending).toHaveBeenCalledWith('batch-1', null);
  });

  it('hides a parked review whose rows no longer fit the batch', () => {
    setup([], {
      batches: [{ ...batch, questionCount: 2, pendingReview: parkedReview() }],
    });
    expect(screen.queryByText(/is waiting/)).toBeNull();
  });

  it('reads a scan picked from Google Drive like a chosen file', async () => {
    const onPickFromDrive = vi.fn(() =>
      Promise.resolve(
        new File([new Uint8Array(4)], 'scan.pdf', { type: 'application/pdf' })
      )
    );
    setup(
      [page(4, [{ row: 0, choice: 1 }]), page(1, [{ row: 0, choice: 1 }])],
      { onPickFromDrive }
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Pick the scan from Google Drive/ })
    );
    await waitFor(() =>
      expect(screen.getByText(/ready to import/)).toBeInTheDocument()
    );
    expect(onPickFromDrive).toHaveBeenCalledOnce();
  });

  it('tags questions during review and saves the tags with the key', async () => {
    const { onImport, onSaveQuiz } = setup([
      page(4, [
        { row: 0, choice: 1 },
        { row: 1, choice: 2 },
        { row: 2, choice: 0 },
      ]),
      page(1, [{ row: 0, choice: 1 }]),
    ]);
    chooseFile();
    await waitFor(() =>
      expect(screen.getByText(/ready to import/)).toBeInTheDocument()
    );
    fireEvent.click(screen.getByLabelText('Tag question 2'));
    expect(screen.getByText('Question 2 targets')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply fake tag' }));
    expect(screen.getByText('Fractions')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('This key is correct'));
    fireEvent.click(screen.getByRole('button', { name: /^Import 1 sheet$/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    const saved = onSaveQuiz.mock.calls[0][0];
    expect(saved.questions[1].targets).toEqual([FAKE_TAG]);
    expect(saved.questions[0].targets).toBeUndefined();
    expect(saved.questions[1].correctAnswer).toBe('C');
  });
});
