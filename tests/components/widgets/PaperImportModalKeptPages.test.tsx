import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';

import {
  PaperImportModal,
  type PaperImportRequestExtra,
} from '@/components/widgets/QuizWidget/components/PaperImportModal';
import type {
  ClassRoster,
  PaperBatch,
  PaperPageMap,
  PaperPendingReview,
  QuizData,
} from '@/types';
import { memoryCropStore, type CropStore } from '@/utils/paperCropStore';
import { paintSyntheticSheet } from '@/tests/testHelpers/paperSheetRaster';
import type { ImportPaperSheetPayload } from '@/utils/paperImportPlan';
import { planPaperPages } from '@/utils/paperPageMap';
import type { RasterizedPage, keptPageBlob } from '@/utils/paperScanRaster';
import { paperBatchTag } from '@/utils/paperSheetMarker';
import type {
  PageRead,
  RasterPage,
  readPaperPage,
} from '@/utils/paperSheetReader';
import { buildPaperStubQuiz } from '@/utils/paperSheetPlan';
import {
  paperCropStoragePath,
  paperPageStoragePath,
} from '@/utils/paperWritten';

vi.mock('@/components/quiz/targets/TargetPicker', () => ({
  TargetPicker: () => null,
}));

const UID = 'teacher-1';
const SWITCH = "Keep a copy of each student's pages";

const stubQuiz = (questionCount: number): QuizData =>
  buildPaperStubQuiz({
    quizId: 'quiz-1',
    title: 'Paper quiz',
    questionCount,
    choiceCount: 4,
    createdAt: 0,
    newQuestionId: (() => {
      let n = 0;
      return () => `s${(n += 1)}`;
    })(),
  });

const quiz = stubQuiz(3);

const studentsOf = (n: number): ClassRoster => ({
  id: 'r1',
  name: 'Period 1',
  driveFileId: 'f',
  studentCount: n,
  createdAt: 0,
  students: Array.from({ length: n }, (_, i) => ({
    id: `s${i + 1}`,
    firstName: `First${i + 1}`,
    lastName: `Last${i + 1}`,
    pin: String(i + 1).padStart(4, '0'),
  })),
});

const roster = studentsOf(2);

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
  createdAt: Date.UTC(2026, 10, 9),
};

const sheet = (
  seat: number,
  choices: number[],
  forBatch: PaperBatch = batch
): RasterPage =>
  paintSyntheticSheet({
    marker: {
      batchTag: paperBatchTag(forBatch.id),
      seat,
      page: 1,
      isKeySheet: seat === forBatch.keySheetSeat,
    },
    questionCount: 3,
    choiceCount: 4,
    marks: choices.map((choice, row) => ({ row, choice })),
    pxPerMm: 4,
    seed: seat,
  });

const KEY = [1, 2, 0];

const rasterizer = (pages: RasterPage[]) =>
  async function* (): AsyncGenerator<RasterizedPage> {
    let n = 0;
    for (const p of pages) {
      n += 1;
      yield { pageNumber: n, page: p, crop: () => 'data:image/png;base64,x' };
      await Promise.resolve();
    }
  };

type ImportFn = React.ComponentProps<typeof PaperImportModal>['onImport'];
type KeepFn = typeof keptPageBlob;

const setup = (
  pages: RasterPage[],
  over: Partial<React.ComponentProps<typeof PaperImportModal>> = {}
) => {
  const onImport = vi
    .fn<ImportFn>()
    .mockImplementation((_b, _a, sheets) =>
      Promise.resolve({ written: sheets.map((s) => s.seat), collisions: [] })
    );
  const onUploadCrop = vi.fn<(path: string, blob: Blob) => Promise<void>>(() =>
    Promise.resolve()
  );
  const kept: Blob[] = [];
  const keepPage = vi.fn<KeepFn>(() => {
    const blob = new Blob([`page-${kept.length}`], { type: 'image/webp' });
    kept.push(blob);
    return Promise.resolve(blob);
  });
  const cropStore = memoryCropStore();
  const savePages = vi.spyOn(cropStore, 'savePages');
  const onError = vi.fn();
  render(
    <PaperImportModal
      quiz={quiz}
      uid={UID}
      batches={[batch]}
      rosters={[roster]}
      assignments={[]}
      onCreateAssignment={() => Promise.resolve('assignment-1')}
      onImport={onImport}
      onUploadCrop={onUploadCrop}
      onSaveQuiz={() => Promise.resolve()}
      onClose={vi.fn()}
      onError={onError}
      rasterize={rasterizer(pages)}
      keepPage={keepPage}
      cropStore={cropStore}
      {...over}
    />
  );
  return { onImport, onUploadCrop, keepPage, kept, savePages, onError };
};

const chooseFile = () => {
  const file = new File([new Uint8Array(4)], 'scan.pdf', {
    type: 'application/pdf',
  });
  fireEvent.change(screen.getByLabelText('Scan file'), {
    target: { files: [file] },
  });
};

const confirmKeyAndImport = async (sheets: number) => {
  await waitFor(() =>
    expect(screen.getByText(/ready to import/)).toBeInTheDocument()
  );
  fireEvent.click(screen.getByLabelText('This key is correct'));
  fireEvent.click(
    screen.getByRole('button', {
      name: new RegExp(`^Import ${sheets} sheets?$`),
    })
  );
};

const STACK = () => [sheet(4, KEY), sheet(1, [1, 3, 0]), sheet(2, [0, 0, 1])];

describe('PaperImportModal kept pages', () => {
  it('flag off: no switch, no page work and the same payload as before', async () => {
    const { onImport, onUploadCrop, keepPage, savePages } = setup(STACK());
    expect(screen.queryByRole('switch', { name: SWITCH })).toBeNull();
    expect(
      screen.getByText(/The file never leaves this computer\./)
    ).toBeInTheDocument();
    chooseFile();
    await confirmKeyAndImport(2);
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    const extra = onImport.mock.calls[0][3];
    expect(extra).toEqual({});
    expect(keepPage).not.toHaveBeenCalled();
    expect(onUploadCrop).not.toHaveBeenCalled();
    expect(savePages).not.toHaveBeenCalled();
  });

  it('switch off: the import behaves exactly as with the flag off', async () => {
    const off = setup(STACK());
    chooseFile();
    await confirmKeyAndImport(2);
    await waitFor(() => expect(off.onImport).toHaveBeenCalledOnce());
    const before = off.onImport.mock.calls[0];
    cleanup();

    const { onImport, onUploadCrop, keepPage } = setup(STACK(), {
      canKeepPages: true,
    });
    const toggle = screen.getByRole('switch', { name: SWITCH });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(
      screen.getByText(/The file never leaves this computer\./)
    ).toBeInTheDocument();
    chooseFile();
    await confirmKeyAndImport(2);
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    expect(onImport.mock.calls[0]).toEqual(before);
    expect(keepPage).not.toHaveBeenCalled();
    expect(onUploadCrop).not.toHaveBeenCalled();
  });

  it('keeps every student page but never the key sheet, and sends them with a scan id', async () => {
    const { onImport, onUploadCrop, keepPage } = setup(STACK(), {
      canKeepPages: true,
    });
    expect(
      screen.getByText(/^Saved to your Google Drive\.$/)
    ).toBeInTheDocument();
    chooseFile();
    await waitFor(() =>
      expect(screen.getByText('2 page copies saved')).toBeInTheDocument()
    );
    // K17: three pages scanned, the key sheet among them; only two are straightened.
    expect(keepPage).toHaveBeenCalledTimes(2);
    const paths = onUploadCrop.mock.calls.map(([p]) => p);
    const scanId = paths[0].split('/')[2];
    expect(scanId).toMatch(/^[A-Za-z0-9-]{1,64}$/);
    expect(paths.sort()).toEqual([
      paperPageStoragePath(UID, scanId, 1, 1),
      paperPageStoragePath(UID, scanId, 2, 1),
    ]);

    await confirmKeyAndImport(2);
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    const extra: PaperImportRequestExtra = onImport.mock.calls[0][3];
    expect(extra).toEqual({
      scanId,
      pages: [
        {
          seat: 1,
          page: 1,
          storagePath: paperPageStoragePath(UID, scanId, 1, 1),
        },
        {
          seat: 2,
          page: 1,
          storagePath: paperPageStoragePath(UID, scanId, 2, 1),
        },
      ],
    });
    expect(screen.queryByText(/did not upload/)).toBeNull();
  });

  it('keeps the later of two scans of one page, as the answers do', async () => {
    const { onUploadCrop, keepPage, kept } = setup(
      [sheet(4, KEY), sheet(1, [1, 3, 0]), sheet(1, [2, 3, 0])],
      { canKeepPages: true }
    );
    chooseFile();
    await waitFor(() =>
      expect(
        screen.getByText(
          /^This sheet was scanned twice\. The latest scan is shown\.$/
        )
      ).toBeInTheDocument()
    );
    await waitFor(() => expect(onUploadCrop).toHaveBeenCalledOnce());
    expect(keepPage).toHaveBeenCalledTimes(2);
    expect(onUploadCrop.mock.calls[0][1]).toBe(kept[1]);
  });

  it('sends the PNG fallback type and imports answers when a page upload fails', async () => {
    const pages = STACK();
    // Seat 1's page fell back to PNG, as a browser without a WebP encoder does.
    const keepPage = vi.fn<KeepFn>((page) =>
      Promise.resolve(
        new Blob(['p'], {
          type: page === pages[1] ? 'image/png' : 'image/webp',
        })
      )
    );
    const { onImport, onUploadCrop } = setup(pages, {
      canKeepPages: true,
      keepPage,
    });
    onUploadCrop.mockImplementation((path) =>
      path.endsWith('/2/1.webp')
        ? Promise.reject(new Error('offline'))
        : Promise.resolve()
    );
    chooseFile();
    await waitFor(() =>
      expect(
        screen.getByText(/^1 page copy did not upload\./)
      ).toBeInTheDocument()
    );
    await confirmKeyAndImport(2);
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    const [, , sheets, extra] = onImport.mock.calls[0];
    expect(sheets.map((s: ImportPaperSheetPayload) => s.seat)).toEqual([1, 2]);
    expect(extra.pages).toEqual([
      {
        seat: 1,
        page: 1,
        storagePath: paperPageStoragePath(UID, extra.scanId ?? '', 1, 1),
        mimeType: 'image/png',
      },
    ]);
    expect(
      await screen.findByText(/Their answers imported/)
    ).toBeInTheDocument();
    expect(screen.getByText(/2 responses imported/)).toBeInTheDocument();
  });

  it('carries only each chunk’s own seats’ pages', async () => {
    const seats = 205;
    const big: PaperBatch = {
      ...batch,
      seats: Object.fromEntries(
        Array.from({ length: seats }, (_, i) => [
          i + 1,
          { rosterId: 'r1', studentId: `s${i + 1}` },
        ])
      ),
      spareSeats: [],
      keySheetSeat: undefined,
      choiceOrder: {},
    };
    const tag = paperBatchTag(big.id);
    const reads = new Map<RasterPage, PageRead>();
    const pages = Array.from({ length: seats }, (_, i) => {
      const p: RasterPage = {
        width: 1,
        height: 1,
        data: new Uint8ClampedArray(4),
      };
      reads.set(p, {
        status: 'ok',
        marker: { batchTag: tag, seat: i + 1, page: 1, isKeySheet: false },
        rotated: false,
        rows: [0, 1, 2].map((r) => ({
          indexOnPage: r,
          choice: 1,
          fills: [0, 0.5, 0, 0],
          crop: { x: 0, y: 0, w: 1, h: 1 },
        })),
        written: [],
        mmToPx: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        registrationResidualMm: 0,
        pxPerMm: 1,
      });
      return p;
    });
    const readPage = vi.fn<typeof readPaperPage>(
      (p) => reads.get(p) ?? { status: 'no-marker' }
    );
    const { onImport } = setup(pages, {
      canKeepPages: true,
      batches: [big],
      rosters: [studentsOf(seats)],
      readPage,
    });
    chooseFile();
    await waitFor(() =>
      expect(screen.getByText(`${seats} page copies saved`)).toBeInTheDocument()
    );
    fireEvent.click(
      screen.getByRole('button', { name: `Import ${seats} sheets` })
    );
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(2));
    let total = 0;
    for (const [, , sheets, extra] of onImport.mock.calls) {
      const own = new Set(sheets.map((s: ImportPaperSheetPayload) => s.seat));
      expect(extra.pages?.length).toBe(own.size);
      expect(extra.pages?.every((p) => own.has(p.seat))).toBe(true);
      expect(extra.scanId).toBeTruthy();
      total += extra.pages?.length ?? 0;
    }
    expect(onImport.mock.calls[0][2]).toHaveLength(200);
    expect(total).toBe(seats);
  });

  it('resumes a closed review with its pages from this browser', async () => {
    const parked: PaperPendingReview = {
      savedAt: Date.UTC(2026, 10, 9),
      assignmentId: '',
      sheets: [
        {
          seat: 1,
          kind: 'student',
          student: { rosterId: 'r1', studentId: 's1' },
          answers: [
            { question: 0, choice: 1 },
            { question: 1, choice: 3 },
            { question: 2, choice: 0 },
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
    };
    const cropStore: CropStore = memoryCropStore();
    const blob = new Blob(['kept'], { type: 'image/webp' });
    await cropStore.savePages('batch-1', {
      scanId: 'scanR',
      pages: [{ seat: 1, page: 1, blob }],
    });
    const { onImport, onUploadCrop } = setup([], {
      canKeepPages: true,
      batches: [{ ...batch, keySheetSeat: undefined, pendingReview: parked }],
      cropStore,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Resume review' }));
    await waitFor(() =>
      expect(screen.getByText('1 page copy saved')).toBeInTheDocument()
    );
    expect(onUploadCrop).toHaveBeenCalledWith(
      paperPageStoragePath(UID, 'scanR', 1, 1),
      blob
    );
    fireEvent.click(screen.getByRole('button', { name: /^Import 1 sheet$/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    expect(onImport.mock.calls[0][3]).toEqual({
      scanId: 'scanR',
      pages: [
        {
          seat: 1,
          page: 1,
          storagePath: paperPageStoragePath(UID, 'scanR', 1, 1),
        },
      ],
    });
  });

  it('on a handwritten batch, pages share the crops’ scan id', async () => {
    const planned = planPaperPages({
      entries: [
        { kind: 'mc', questionId: 's1', label: '1' },
        { kind: 'written', questionId: 's2', label: '2', size: 'M' },
      ],
      grid: 2,
      stems: false,
    });
    if (!planned.ok) throw new Error('plan refused');
    const pageMaps: PaperPageMap[] = planned.pageMaps;
    const v2: PaperBatch = {
      ...batch,
      id: 'batch-2',
      questionCount: 1,
      keySheetSeat: undefined,
      spareSeats: [],
      layoutVersion: 2,
      pageMaps,
    };
    const v2Sheet = (seat: number) =>
      paintSyntheticSheet({
        marker: {
          batchTag: paperBatchTag(v2.id),
          seat,
          page: 1,
          isKeySheet: false,
          readByMap: true,
        },
        questionCount: 0,
        choiceCount: 4,
        pageMap: pageMaps[0],
        marks: [{ row: 0, choice: 1 }],
        writing: [{ questionId: 's2' }],
        pxPerMm: 4,
        seed: seat,
      });
    const { onImport, onUploadCrop } = setup([v2Sheet(1), v2Sheet(2)], {
      canKeepPages: true,
      quiz: {
        ...stubQuiz(2),
        questions: stubQuiz(2).questions.map((q, i) =>
          i === 1
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
      },
      batches: [v2],
      cropWritten: () =>
        Promise.resolve(new Blob(['c'], { type: 'image/webp' })),
    });
    chooseFile();
    await waitFor(() => expect(onUploadCrop).toHaveBeenCalledTimes(4));
    const paths = onUploadCrop.mock.calls.map(([p]) => p);
    const scanId = paths[0].split('/')[2];
    expect(paths).toEqual(
      expect.arrayContaining([
        paperCropStoragePath(UID, scanId, 1, 's2'),
        paperPageStoragePath(UID, scanId, 1, 1),
        paperPageStoragePath(UID, scanId, 2, 1),
      ])
    );
    // Crops queue first: they hold up the import, pages never do.
    expect(
      paths.slice(0, 2).every((p) => p.startsWith('paper_written_crops/'))
    ).toBe(true);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^Import 2 sheets$/ })
      ).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: /^Import 2 sheets$/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    const extra = onImport.mock.calls[0][3];
    expect(extra.layoutVersion).toBe(2);
    expect(extra.scanId).toBe(scanId);
    expect(extra.pages?.map((p) => p.seat)).toEqual([1, 2]);
  });
});
