import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { PaperImportModal } from '@/components/widgets/QuizWidget/components/PaperImportModal';
import type {
  ClassRoster,
  PaperBatch,
  PaperPageMap,
  PaperPendingReview,
  QuizData,
} from '@/types';
import { memoryCropStore, type CropStore } from '@/utils/paperCropStore';
import {
  paintSyntheticSheet,
  type SyntheticWriting,
} from '@/tests/testHelpers/paperSheetRaster';
import type { ImportPaperSheetPayload } from '@/utils/paperImportPlan';
import { planPaperPages } from '@/utils/paperPageMap';
import type { RasterizedPage } from '@/utils/paperScanRaster';
import { paperBatchTag } from '@/utils/paperSheetMarker';
import { buildPaperStubQuiz } from '@/utils/paperSheetPlan';
import { paperCropStoragePath } from '@/utils/paperWritten';

vi.mock('@/components/quiz/targets/TargetPicker', () => ({
  TargetPicker: () => null,
}));

const base = buildPaperStubQuiz({
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

// Question 3 is written: the stub builder's Written toggle (D17) makes it free response.
const quiz: QuizData = {
  ...base,
  questions: base.questions.map((q, i) =>
    i === 2
      ? {
          id: q.id,
          type: 'free-response' as const,
          text: q.text,
          timeLimit: q.timeLimit,
          points: 1,
          correctAnswer: '',
          incorrectAnswers: [],
          paperBoxSize: 'M' as const,
        }
      : q
  ),
};

const planned = planPaperPages({
  entries: [
    { kind: 'mc', questionId: 's1', label: '1' },
    { kind: 'mc', questionId: 's2', label: '2' },
    { kind: 'written', questionId: 's3', label: '3', size: 'M' },
  ],
  grid: 2,
  stems: false,
});
if (!planned.ok) throw new Error('plan refused');
const pageMaps: PaperPageMap[] = planned.pageMaps;

const batch: PaperBatch = {
  id: 'batch-2',
  quizId: 'quiz-1',
  rosterIds: ['r1'],
  questionCount: 2,
  choiceCount: 4,
  seats: {
    1: { rosterId: 'r1', studentId: 's1' },
    2: { rosterId: 'r1', studentId: 's2' },
  },
  spareSeats: [],
  pagesPerSheet: 1,
  layoutVersion: 2,
  pageMaps,
  createdAt: Date.UTC(2026, 8, 25),
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

const sheet = (seat: number, writing: SyntheticWriting[]) =>
  paintSyntheticSheet({
    marker: {
      batchTag: paperBatchTag(batch.id),
      seat,
      page: 1,
      isKeySheet: false,
      readByMap: true,
    },
    questionCount: 0,
    choiceCount: 4,
    pageMap: pageMaps[0],
    marks: [
      { row: 0, choice: 1 },
      { row: 1, choice: 2 },
    ],
    writing,
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

const webp = () => new Blob(['crop'], { type: 'image/webp' });

type ImportFn = React.ComponentProps<typeof PaperImportModal>['onImport'];

const setup = (
  over: Partial<React.ComponentProps<typeof PaperImportModal>> = {}
) => {
  const onImport = vi.fn<ImportFn>().mockImplementation((_b, _a, sheets) =>
    Promise.resolve({
      written: sheets.map((s) => s.seat),
      collisions: [],
      keptWritten: [],
      jobsCreated: 1,
      pagesQueued: 1,
      pagesOverQuota: 0,
    })
  );
  const onUploadCrop = vi.fn<(path: string, blob: Blob) => Promise<void>>(() =>
    Promise.resolve()
  );
  const onSavePending = vi.fn<
    (batchId: string, review: PaperPendingReview | null) => Promise<void>
  >(() => Promise.resolve());
  const onError = vi.fn();
  const cropWritten = vi.fn(() => Promise.resolve(webp()));
  render(
    <PaperImportModal
      quiz={quiz}
      uid="teacher-1"
      batches={[batch]}
      rosters={[roster]}
      assignments={[]}
      onCreateAssignment={() => Promise.resolve('assignment-1')}
      onImport={onImport}
      onUploadCrop={onUploadCrop}
      checkQuota={() => Promise.resolve({ disabled: false, remaining: 300 })}
      onSaveQuiz={() => Promise.resolve()}
      onSavePending={onSavePending}
      onClose={vi.fn()}
      onError={onError}
      rasterize={rasterizer([sheet(1, [{ questionId: 's3' }]), sheet(2, [])])}
      cropWritten={cropWritten}
      cropStore={memoryCropStore()}
      {...over}
    />
  );
  return { onImport, onUploadCrop, onSavePending, onError, cropWritten };
};

const chooseFile = () => {
  const file = new File([new Uint8Array(4)], 'scan.pdf', {
    type: 'application/pdf',
  });
  fireEvent.change(screen.getByLabelText('Scan file'), {
    target: { files: [file] },
  });
};

const reviewReady = () =>
  waitFor(() =>
    expect(screen.getByLabelText('Written answers')).toBeInTheDocument()
  );

const remoteParked = (): PaperPendingReview => ({
  savedAt: Date.UTC(2026, 8, 25),
  assignmentId: '',
  sheets: [
    {
      seat: 1,
      kind: 'student',
      student: { rosterId: 'r1', studentId: 's1' },
      answers: [
        { question: 0, choice: 1 },
        { question: 1, choice: 2 },
      ],
      pagesSeen: [1],
      missingPages: [],
      isBlank: false,
      flags: [],
    },
  ],
  keySheet: null,
  unreadablePages: [],
  foreignPages: [],
  unknownPages: [],
  key: {},
  keyConfirmed: false,
  spareAssignments: {},
  targets: {},
  written: {
    scanId: 'scanB',
    boxes: [
      {
        seat: 1,
        questionId: 's3',
        page: 1,
        state: 'ink',
        uploaded: true,
      },
    ],
  },
});

describe('PaperImportModal with handwritten answers', () => {
  it('uploads every crop during review, marks blanks and sends them with the import', async () => {
    const { onImport, onUploadCrop, cropWritten } = setup();
    chooseFile();
    await reviewReady();

    // Blank boxes are cropped and uploaded too (D22).
    expect(cropWritten).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(onUploadCrop).toHaveBeenCalledTimes(2));
    const paths = onUploadCrop.mock.calls.map(([p]) => p);
    const scanId = paths[0].split('/')[2];
    expect(paths.sort()).toEqual(
      [
        paperCropStoragePath('teacher-1', scanId, 1, 's3'),
        paperCropStoragePath('teacher-1', scanId, 2, 's3'),
      ].sort()
    );
    expect(onImport).not.toHaveBeenCalled();

    expect(screen.getAllByText('Blank')).toHaveLength(1);
    expect(
      screen.getAllByAltText('Handwritten answer, question 3')
    ).toHaveLength(2);
    expect(screen.getByText('1 page to transcribe')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('Uploaded')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: /^Import 2 sheets$/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    const [, , sheets, extra] = onImport.mock.calls[0];
    expect(extra).toEqual({ layoutVersion: 2, scanId });
    const bySeat = new Map(
      sheets.map((s: ImportPaperSheetPayload) => [s.seat, s])
    );
    expect(bySeat.get(1)?.written).toEqual([
      {
        questionId: 's3',
        page: 1,
        state: 'ink',
        storagePath: paperCropStoragePath('teacher-1', scanId, 1, 's3'),
        mimeType: 'image/webp',
      },
    ]);
    expect(bySeat.get(2)?.written?.[0].state).toBe('blank');
    await waitFor(() =>
      expect(
        screen.getByText(/1 page of handwriting queued/)
      ).toBeInTheDocument()
    );
  });

  it('warns before import when pages go over the daily limit', async () => {
    setup({
      checkQuota: () => Promise.resolve({ disabled: false, remaining: 0 }),
    });
    chooseFile();
    await reviewReady();
    await waitFor(() =>
      expect(
        screen.getByText(
          "1 page over today's transcription limit will be transcribed later."
        )
      ).toBeInTheDocument()
    );
  });

  it('holds the import until a failed upload is retried', async () => {
    let fail = true;
    const onUploadCrop = vi.fn(() =>
      fail ? Promise.reject(new Error('offline')) : Promise.resolve()
    );
    const { onImport } = setup({ onUploadCrop });
    chooseFile();
    await reviewReady();
    await waitFor(() =>
      expect(screen.getByText(/2 crops failed to upload/)).toBeInTheDocument()
    );
    const importButton = screen.getByRole('button', {
      name: /^Import 2 sheets$/,
    });
    expect(importButton).toBeDisabled();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(importButton).toBeEnabled());
    fireEvent.click(importButton);
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
  });

  it('lists written answers the rescan kept', async () => {
    const onImport = vi.fn<ImportFn>(() =>
      Promise.resolve({
        written: [1, 2],
        collisions: [],
        keptWritten: [{ seat: 1, questionId: 's3' }],
        jobsCreated: 0,
        pagesQueued: 0,
        pagesOverQuota: 0,
      })
    );
    setup({ onImport });
    chooseFile();
    await reviewReady();
    await waitFor(() =>
      expect(screen.getByText('Uploaded')).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /^Import 2 sheets$/ }));
    await waitFor(() =>
      expect(screen.getByText('1 written answer kept')).toBeInTheDocument()
    );
    expect(
      screen.getByText('Alvarez, Sam · Period 1 · question 3')
    ).toBeInTheDocument();
  });

  it('parks written states and upload flags on the batch', async () => {
    const { onSavePending } = setup();
    chooseFile();
    await reviewReady();
    await waitFor(() =>
      expect(onSavePending).toHaveBeenCalledWith(
        'batch-2',
        expect.objectContaining({
          written: expect.objectContaining({
            boxes: expect.arrayContaining([
              expect.objectContaining({
                seat: 1,
                questionId: 's3',
                state: 'ink',
                uploaded: true,
                mimeType: 'image/webp',
              }),
            ]),
          }),
        })
      )
    );
  });

  it('resumes a parked review with its crops and upload state', async () => {
    const store: CropStore = memoryCropStore();
    await store.saveWritten('batch-2', {
      scanId: 'scanA',
      crops: [
        { seat: 1, questionId: 's3', page: 1, state: 'ink', blob: webp() },
        { seat: 2, questionId: 's3', page: 1, state: 'blank', blob: webp() },
      ],
    });
    const parked: PaperPendingReview = {
      savedAt: Date.UTC(2026, 8, 25),
      assignmentId: '',
      sheets: [1, 2].map((seat) => ({
        seat,
        kind: 'student' as const,
        student: { rosterId: 'r1', studentId: `s${seat}` },
        answers: [
          { question: 0, choice: 1 },
          { question: 1, choice: 2 },
        ],
        pagesSeen: [1],
        missingPages: [],
        isBlank: false,
        flags: [],
      })),
      keySheet: null,
      unreadablePages: [],
      foreignPages: [],
      unknownPages: [],
      key: {},
      keyConfirmed: false,
      spareAssignments: {},
      targets: {},
      written: {
        scanId: 'scanA',
        boxes: [
          {
            seat: 1,
            questionId: 's3',
            page: 1,
            state: 'ink',
            uploaded: true,
            mimeType: 'image/webp',
          },
          {
            seat: 2,
            questionId: 's3',
            page: 1,
            state: 'blank',
            uploaded: false,
            mimeType: 'image/webp',
          },
        ],
      },
    };
    const { onUploadCrop, onImport } = setup({
      batches: [{ ...batch, pendingReview: parked }],
      cropStore: store,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Resume review' }));
    await reviewReady();
    expect(
      screen.getAllByAltText('Handwritten answer, question 3')
    ).toHaveLength(2);
    await waitFor(() => expect(onUploadCrop).toHaveBeenCalledOnce());
    expect(onUploadCrop.mock.calls[0][0]).toBe(
      paperCropStoragePath('teacher-1', 'scanA', 2, 's3')
    );
    await waitFor(() =>
      expect(screen.getByText('Uploaded')).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: /^Import 2 sheets$/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    expect(onImport.mock.calls[0][3]).toEqual({
      layoutVersion: 2,
      scanId: 'scanA',
    });
  });

  it('drops a slow remote crop once a new scan owns the review', async () => {
    let release!: (url: string) => void;
    const loadRemoteCrop = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          release = resolve;
        })
    );
    setup({
      batches: [{ ...batch, pendingReview: remoteParked() }],
      loadRemoteCrop,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Resume review' }));
    await reviewReady();
    await waitFor(() => expect(loadRemoteCrop).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    chooseFile();
    await waitFor(() =>
      expect(
        screen.getAllByAltText('Handwritten answer, question 3')
      ).toHaveLength(2)
    );
    release('https://crop/stale');
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    for (const img of screen.getAllByAltText(
      'Handwritten answer, question 3'
    )) {
      expect(img).not.toHaveAttribute('src', 'https://crop/stale');
    }
  });

  it('shows crops another device uploaded through the remote loader', async () => {
    const parked = remoteParked();
    const loadRemoteCrop = vi.fn(() => Promise.resolve('https://crop/1'));
    setup({
      batches: [{ ...batch, pendingReview: parked }],
      loadRemoteCrop,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Resume review' }));
    await reviewReady();
    await waitFor(() =>
      expect(
        screen.getByAltText('Handwritten answer, question 3')
      ).toHaveAttribute('src', 'https://crop/1')
    );
    expect(loadRemoteCrop).toHaveBeenCalledWith(
      paperCropStoragePath('teacher-1', 'scanB', 1, 's3')
    );
    expect(screen.getByText('Uploaded')).toBeInTheDocument();
  });
});
