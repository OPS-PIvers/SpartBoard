import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { QuizConfig, QuizData, QuizResponse, QuizSession } from '@/types';
import type {
  QuizResultsPrintOptions,
  ResultsPrintJob,
} from '@/utils/quizStudentReportPrint';

let flagOn = true;
let toolsOn = false;
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { widgets: [] },
    updateWidget: vi.fn(),
    addWidget: vi.fn(),
    addToast: vi.fn(),
    rosters: [
      {
        id: 'r1',
        name: 'Period 1',
        students: [
          { id: 's', pin: '1111', firstName: 'Ada', lastName: 'Lovelace' },
        ],
      },
    ],
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessQuizMediaResponse: () => false,
    refreshGoogleToken: () => Promise.resolve(null),
    googleAccessToken: null,
    ensureGoogleScope: vi.fn(),
    user: { uid: 'teacher-1' },
    orgId: null,
    isExternalUser: false,
    canAccessFeature: (id: string) =>
      (flagOn && id === 'quiz-results-print') ||
      (toolsOn && id === 'quiz-results-tools'),
    updateAccountPreferences: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({
    plcs: [],
    clearPlcSharedSheetUrl: vi.fn(),
    setPlcSharedSheetUrl: vi.fn(),
  }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({
    byStudentUid: new Map(),
    byAssignmentPseudonym: new Map(),
  }),
  formatStudentName: () => '',
}));
vi.mock('@/hooks/useClickOutside', () => ({ useClickOutside: vi.fn() }));
vi.mock('@/utils/paperBatchStore', () => ({
  getPaperBatch: vi.fn(() =>
    Promise.resolve({
      id: 'batch-1',
      choiceOrder: { q1: ['Oslo', 'Rome', 'Paris'] },
    })
  ),
}));

const printQuizResults =
  vi.fn<(job: ResultsPrintJob, options: QuizResultsPrintOptions) => void>();
const printStudentReport = vi.fn<(job: unknown) => void>();
vi.mock('@/utils/quizStudentReportPrint', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/quizStudentReportPrint')>();
  return {
    ...actual,
    printQuizResults: (
      job: ResultsPrintJob,
      options: QuizResultsPrintOptions
    ) => printQuizResults(job, options),
    printStudentReport: (job: unknown) => printStudentReport(job),
  };
});

import { QuizResults } from '@/components/widgets/QuizWidget/components/QuizResults';

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Capitals',
  createdAt: 1,
  updatedAt: 1,
  questions: [
    {
      id: 'q1',
      type: 'MC',
      text: 'Capital of France?',
      correctAnswer: 'Paris',
      incorrectAnswers: ['Rome', 'Oslo'],
      timeLimit: 30,
      points: 1,
    },
    {
      id: 'w1',
      type: 'free-response',
      text: 'Explain why.',
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 0,
      points: 2,
    },
  ],
};

const response = (
  pin: string,
  q1: string,
  extra: Partial<QuizResponse> = {}
): QuizResponse =>
  ({
    studentUid: `uid-${pin}`,
    _responseKey: `pin-p1-${pin}`,
    pin,
    classPeriod: 'Period 1',
    status: 'completed',
    submittedAt: 200,
    joinedAt: 1,
    tabSwitchWarnings: 0,
    answers: [
      { questionId: 'q1', answer: q1, answeredAt: 100 },
      { questionId: 'w1', answer: 'Because.', answeredAt: 101 },
    ],
    ...extra,
  }) as unknown as QuizResponse;

const responses = [
  response('1111', 'Rome'),
  response('2222', 'Paris'),
  response('3333', '', { status: 'joined', answers: [], submittedAt: null }),
];

const session = {
  id: 'session-1',
  quizId: 'quiz-1',
  teacherUid: 'teacher-1',
  classIds: [],
  status: 'ended',
} as unknown as QuizSession;

const makeActions = () => ({
  publish: vi.fn().mockResolvedValue({ responsesUpdated: 1, skipped: 0 }),
  hide: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(undefined),
});

const renderResults = (
  extra: Partial<React.ComponentProps<typeof QuizResults>> = {},
  list = responses
) =>
  render(
    <QuizResults
      quiz={quiz}
      responses={list}
      config={
        { view: 'results', periodNames: ['Period 1'] } as unknown as QuizConfig
      }
      onBack={vi.fn()}
      session={session}
      tabWarningsEnabled
      {...extra}
    />
  );

const dialog = () => screen.getByRole('dialog', { name: 'Print results' });
const ticked = () =>
  within(dialog())
    .getAllByRole('checkbox')
    .filter((c) => (c as HTMLInputElement).checked)
    .map((c) => c.closest('label')?.textContent);

describe('QuizResults — results print', () => {
  beforeEach(() => {
    flagOn = true;
    toolsOn = false;
    printQuizResults.mockReset();
    printStudentReport.mockReset();
    localStorage.clear();
  });

  it('opens from the header with every listed student ticked, joined ones included', () => {
    renderResults();
    fireEvent.click(screen.getByRole('button', { name: 'Print results' }));
    expect(ticked()).toEqual([
      'Ada LovelacePeriod 1',
      'PIN 2222Period 1',
      'PIN 3333Period 1Not started',
    ]);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Print' }));
    const [job, options] = printQuizResults.mock.calls[0];
    expect(job.students.map((s) => s.name)).toEqual([
      'Ada Lovelace',
      null,
      null,
    ]);
    expect(options.keyMode).toBe('off');
  });

  it('is hidden for PLC teammates and when the flag is off', () => {
    const { unmount } = renderResults({ plcView: true });
    expect(screen.queryByRole('button', { name: 'Print results' })).toBeNull();
    unmount();
    flagOn = false;
    renderResults();
    expect(screen.queryByRole('button', { name: 'Print results' })).toBeNull();
  });

  it('preselects the bulk bar selection', () => {
    renderResults({ studentResultsActions: makeActions() });
    fireEvent.click(screen.getByRole('button', { name: /^students/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select PIN 2222' }));
    fireEvent.click(screen.getByRole('button', { name: 'Print selected' }));
    expect(ticked()).toEqual(['PIN 2222Period 1']);
  });

  it('opens from a student panel with just that student, and drops the old checkbox', () => {
    renderResults();
    fireEvent.click(screen.getByRole('button', { name: /^students/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Ada Lovelace$/ }));
    expect(
      screen.queryByRole('checkbox', { name: 'Include correct answers' })
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Print report' }));
    expect(ticked()).toEqual(['Ada LovelacePeriod 1']);
    expect(printStudentReport).not.toHaveBeenCalled();
  });

  it('warns about ungraded work, a key while students are unfinished, and missing names', () => {
    renderResults();
    fireEvent.click(screen.getByRole('button', { name: 'Print results' }));
    const d = within(dialog());
    expect(
      d.getByText(/2 students have ungraded written answers/)
    ).toBeInTheDocument();
    expect(d.getByText(/2 students have no roster name/)).toBeInTheDocument();
    expect(d.queryByText(/printed keys may circulate/)).toBeNull();
    fireEvent.click(d.getByRole('radio', { name: 'Missed only' }));
    expect(
      d.getByText("1 student hasn't finished, so printed keys may circulate.")
    ).toBeInTheDocument();
  });

  it('previews the on-screen name while names are hidden but prints the real one', () => {
    renderResults();
    fireEvent.click(screen.getByRole('button', { name: 'Hide student names' }));
    fireEvent.click(screen.getByRole('button', { name: 'Print results' }));
    const preview = within(dialog()).getByTitle('Print preview');
    const srcDoc = preview.getAttribute('srcdoc') ?? '';
    expect(srcDoc).toContain('Student 1');
    expect(srcDoc).not.toContain('Lovelace');
    expect(within(dialog()).queryByText(/Lovelace/)).toBeNull();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Print' }));
    expect(printQuizResults.mock.calls[0][0].students[0].name).toBe(
      'Ada Lovelace'
    );
  });

  it('prints paper students with their batch letters once the batch loads', async () => {
    renderResults({}, [
      response('1111', 'Rome', { paperBatchId: 'batch-1', paperSeat: 1 }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Print results' }));
    const print = within(dialog()).getByRole('button', {
      name: /Print|Loading/,
    });
    await waitFor(() => expect(print).toHaveTextContent('Print'));
    fireEvent.click(print);
    const student = printQuizResults.mock.calls[0][0].students[0];
    expect(student.lettered).toBe(true);
    expect(student.drilldown.lines[0].options?.map((o) => o.text)).toEqual([
      'Oslo',
      'Rome',
      'Paris',
    ]);
  });

  it('leads with Full report or Missed only when the results tools are on', () => {
    flagOn = false;
    toolsOn = true;
    renderResults();
    fireEvent.click(screen.getByRole('button', { name: 'Print results' }));
    const report = within(dialog()).getByRole('radiogroup', { name: 'Report' });
    expect(
      within(report).getByRole('radio', { name: /Full report/ })
    ).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(report).getByRole('radio', { name: /Missed only/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Print' }));
    expect(printQuizResults.mock.calls[0][1]).toMatchObject({
      questionScope: 'missed',
      keyMode: 'all',
      showWrittenFeedback: true,
    });
  });

  it('drops a saved missed-only scope when the results tools are off', () => {
    localStorage.setItem(
      'spartboard.quizResults.printOptions',
      JSON.stringify({
        preset: 'missed-only',
        options: { keyMode: 'all', questionScope: 'missed' },
      })
    );
    renderResults();
    fireEvent.click(screen.getByRole('button', { name: 'Print results' }));
    expect(
      within(dialog()).queryByRole('radiogroup', { name: 'Report' })
    ).toBeNull();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Print' }));
    expect(printQuizResults.mock.calls[0][1].questionScope).toBeUndefined();
  });

  it('remembers the last preset on this browser', () => {
    const { unmount } = renderResults();
    fireEvent.click(screen.getByRole('button', { name: 'Print results' }));
    fireEvent.click(
      within(dialog()).getByRole('radio', { name: 'Graded copy' })
    );
    unmount();
    renderResults();
    fireEvent.click(screen.getByRole('button', { name: 'Print results' }));
    expect(
      within(dialog()).getByRole('radio', { name: 'Graded copy' })
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('offers the sheet layouts only with paper sheets on, and counts who falls back', async () => {
    const list = [
      response('1111', 'Rome', { paperBatchId: 'batch-1', paperSeat: 1 }),
      response('2222', 'Paris'),
    ];
    const { unmount } = renderResults({}, list);
    fireEvent.click(screen.getByRole('button', { name: 'Print results' }));
    expect(
      within(dialog()).queryByRole('radiogroup', { name: 'Layout' })
    ).toBeNull();
    expect(
      within(dialog()).queryByRole('radio', { name: 'Bubble sheet' })
    ).toBeNull();
    unmount();

    renderResults({ paperSheetsEnabled: true }, list);
    fireEvent.click(screen.getByRole('button', { name: 'Print results' }));
    const d = within(dialog());
    fireEvent.click(
      within(d.getByRole('radiogroup', { name: 'Preset' })).getByRole('radio', {
        name: 'Bubble sheet',
      })
    );
    // No "sheet record missing" while the batch is still loading.
    expect(d.queryByText(/sheet record missing/i)).toBeNull();
    expect(
      d.getByText('1 student took this online and will get the report.')
    ).toBeInTheDocument();
    const print = d.getByRole('button', { name: /Print|Loading/ });
    await waitFor(() => expect(print).toHaveTextContent('Print'));
    fireEvent.click(print);
    const [job, options] = printQuizResults.mock.calls[0];
    expect(options.layout).toBe('sheet');
    expect(job.students.find((s) => s.pin === '1111')?.sheet).toMatchObject({
      seat: 1,
      filled: [1],
    });
    expect(job.students.find((s) => s.pin === '2222')?.sheet).toBeUndefined();
  });
});
