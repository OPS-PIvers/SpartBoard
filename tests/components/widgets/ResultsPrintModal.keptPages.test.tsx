import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizResponse } from '@/types';
import type { ResultsPrintJob } from '@/utils/quizStudentReportPrint';
import type { KeptPageLoader } from '@/utils/paperPageFetch';
import { ResultsPrintModal } from '@/components/widgets/QuizWidget/components/ResultsPrintModal';
import { gradeQuestionForResponse } from '@/utils/quizQuestionStats';
import { applyPreset } from '@/utils/quizResultsPrintPresets';
import {
  SCAN_QUIZ,
  scanBatch,
  scanResponse,
} from '@/tests/utils/fixtures/scanSheetFixture';

let flags: Record<string, boolean> = {};
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: (id: string) => !!flags[id],
    googleAccessToken: null,
    refreshGoogleToken: () => Promise.resolve(null),
  }),
}));
const printQuizResults = vi.fn<(job: ResultsPrintJob) => void>();
vi.mock('@/utils/quizStudentReportPrint', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/quizStudentReportPrint')>()),
  printQuizResults: (job: ResultsPrintJob) => printQuizResults(job),
}));

const saveLayout = (layout: 'sheet' | 'report' | 'both') =>
  localStorage.setItem(
    'spartboard.quizResults.printOptions',
    JSON.stringify({
      preset: null,
      options: { ...applyPreset('graded-copy'), layout },
    })
  );

const NAMES: Record<string, string> = { a: 'Maya Okafor', b: 'Jordan Larson' };

function renderModal(
  responses: QuizResponse[],
  loadKeptPage: KeptPageLoader,
  extra: Partial<React.ComponentProps<typeof ResultsPrintModal>> = {},
  wrapper?: React.ComponentType<{ children: React.ReactNode }>
) {
  const onError = vi.fn();
  const { unmount } = render(
    <ResultsPrintModal
      quiz={SCAN_QUIZ}
      responses={responses}
      initialSelection={null}
      resolveName={(r) => NAMES[r._responseKey ?? ''] ?? 'Student'}
      resolveShownName={(r) => NAMES[r._responseKey ?? ''] ?? 'Student'}
      sortNameFor={(r) => NAMES[r._responseKey ?? ''] ?? 'Student'}
      targetsFor={() => []}
      gradeFn={gradeQuestionForResponse}
      rubricFor={() => undefined}
      periodOrder={['Period 2']}
      sessionLive={false}
      sheetsAvailable
      teacherUid="teacher-1"
      sessionId="session-1"
      loadKeptPage={loadKeptPage}
      loadPaperBatch={() => Promise.resolve(scanBatch())}
      onClose={vi.fn()}
      onError={onError}
      {...extra}
    />,
    { wrapper }
  );
  return {
    unmount,
    onError,
    dialog: screen.getByRole('dialog', { name: 'Print results' }),
  };
}

const blob = () => Promise.resolve(new Blob(['page'], { type: 'image/webp' }));
const both = () => [
  scanResponse({ responseKey: 'a', keptPages: [1, 2] }),
  scanResponse({ responseKey: 'b', keptPages: [1, 2] }),
];

async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function printNow(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Print' }));
  return printQuizResults.mock.calls[0][0];
}

describe('ResultsPrintModal kept pages', () => {
  let n = 0;
  beforeEach(() => {
    printQuizResults.mockReset();
    localStorage.clear();
    flags = { 'paper-kept-pages': true };
    n = 0;
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => `blob:kept-${(n += 1)}`),
        revokeObjectURL: vi.fn(),
      })
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('with the flag off, never loads a page and prints as today', async () => {
    flags = {};
    saveLayout('sheet');
    const load = vi.fn<KeptPageLoader>(blob);
    const { dialog } = renderModal(both(), load);
    await settle();
    expect(load).not.toHaveBeenCalled();
    expect(within(dialog).queryByRole('status')).toBeNull();
    const job = printNow(dialog);
    expect(job.students.every((s) => !('keptPages' in s))).toBe(true);
  });

  it('loads nothing for the report layout', async () => {
    saveLayout('report');
    const load = vi.fn<KeptPageLoader>(blob);
    renderModal(both(), load);
    await settle();
    expect(load).not.toHaveBeenCalled();
  });

  it('loads nothing when no response kept a page', async () => {
    saveLayout('sheet');
    const load = vi.fn<KeptPageLoader>(blob);
    const { dialog } = renderModal(
      [scanResponse({ responseKey: 'a' }), scanResponse({ responseKey: 'b' })],
      load
    );
    await settle();
    expect(load).not.toHaveBeenCalled();
    expect(within(dialog).queryByRole('status')).toBeNull();
  });

  it('shows progress, then prints every kept page on its own student', async () => {
    saveLayout('sheet');
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const load = vi.fn<KeptPageLoader>(async () => {
      await gate;
      return blob();
    });
    const { dialog } = renderModal(both(), load);
    await settle();
    expect(within(dialog).getByRole('status').textContent).toBe(
      'Loading scanned pages: 0 of 4.'
    );
    expect(
      within(dialog).getByRole('button', { name: 'Loading scanned pages…' })
    ).toHaveProperty('disabled', true);
    release();
    await settle();
    expect(load).toHaveBeenCalledTimes(4);
    expect(within(dialog).getByRole('status').textContent).toBe(
      "Prints on each student's scanned page."
    );
    const job = printNow(dialog);
    for (const s of job.students) {
      expect(Object.keys(s.keptPages ?? {})).toEqual(['1', '2']);
      expect(
        Object.values(s.keptPages ?? {}).every((u) =>
          u?.startsWith('blob:kept-')
        )
      ).toBe(true);
    }
  });

  it('says how many students print on a scan when some have none', async () => {
    saveLayout('sheet');
    const { dialog } = renderModal(
      [
        scanResponse({ responseKey: 'a', keptPages: [1, 2] }),
        scanResponse({ responseKey: 'b' }),
      ],
      vi.fn<KeptPageLoader>(blob)
    );
    await settle();
    expect(within(dialog).getByRole('status').textContent).toBe(
      '1 of 2 students have a scanned page. The rest print as a redrawn sheet.'
    );
  });

  it('turns refused or failed pages into a redrawn sheet, with no error', async () => {
    saveLayout('sheet');
    const { dialog, onError } = renderModal(
      both(),
      vi.fn<KeptPageLoader>(() => Promise.resolve(null))
    );
    await settle();
    expect(within(dialog).getByRole('status').textContent).toBe(
      'Scanned pages could not load. Each sheet prints redrawn.'
    );
    const job = printNow(dialog);
    expect(onError).not.toHaveBeenCalled();
    expect(job.students[0].keptPages).toEqual({ 1: null, 2: null });
  });

  it('gives earlier attempts the redrawn sheet only', async () => {
    saveLayout('sheet');
    const [a] = both();
    const earlier = { ...a, completedAttempts: 1 } as QuizResponse;
    const { dialog } = renderModal(
      [{ ...a, completedAttempts: 2 }],
      vi.fn<KeptPageLoader>(blob),
      {
        earlierAttempts: new Map([['a', [earlier]]]),
      }
    );
    await settle();
    fireEvent.click(
      within(dialog).getByRole('switch', { name: 'Every attempt' })
    );
    const job = printNow(dialog);
    expect(job.students).toHaveLength(2);
    const old = job.students.find((s) => s.baseKey === 'a');
    const live = job.students.find((s) => s.key === 'a');
    expect(old && 'keptPages' in old).toBe(false);
    expect(old?.sheet).toBeUndefined();
    expect(Object.keys(live?.keptPages ?? {})).toEqual(['1', '2']);
  });

  it('keeps loaded pages while open under StrictMode and frees them after closing', async () => {
    saveLayout('sheet');
    const timers = vi.spyOn(globalThis, 'setTimeout');
    const revoked = vi.spyOn(URL, 'revokeObjectURL');
    const runGrace = () => {
      for (const [fn, ms] of timers.mock.calls.splice(0)) {
        if (ms === 60_000 && typeof fn === 'function') (fn as () => void)();
      }
    };
    const { unmount } = renderModal(
      both(),
      vi.fn<KeptPageLoader>(blob),
      {},
      React.StrictMode
    );
    await settle();
    runGrace();
    expect(revoked).not.toHaveBeenCalled();
    unmount();
    runGrace();
    expect(revoked).toHaveBeenCalledTimes(4);
    timers.mockRestore();
  });
});
