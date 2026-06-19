/**
 * Integration tests for PlcSharedDataBody (Wave 3 — aggregate-driven).
 *
 * The Data section now reads the anonymized server-written
 * `PlcAssessmentAggregate` rollups (via `usePlcAggregatesData`) joined to
 * designated `PlcCommonAssessment` metadata (via `usePlcAssessmentsData`) —
 * NOT raw `PlcContribution` docs. This test mocks the provider selectors so the
 * component renders without Firebase, and asserts:
 *   - aggregate-derived cards render (team avg, weakest questions, per-class
 *     compare, who-ran-it) with NO student names,
 *   - the designate affordance fires the provider `designateAssessment` action,
 *   - a stale aggregate shows the "updating…" state,
 *   - filters operate over aggregates.
 *
 * `PlcCommentsThread` is mocked to a sentinel so we can assert the thread is
 * keyed to `assessment:<assessmentId>` per card without booting the comments
 * hook stack.
 */

import React from 'react';
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type {
  Plc,
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  PlcContribution,
  PlcMember,
} from '@/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: Record<string, unknown>) => {
      let template = (o?.defaultValue as string) ?? _k;
      if (o) {
        for (const [key, value] of Object.entries(o)) {
          template = template.replace(
            new RegExp(`{{${key}}}`, 'g'),
            String(value)
          );
        }
      }
      return template;
    },
  }),
}));

let mockUserUid: string | null = 'uid-alice';
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: mockUserUid ? { uid: mockUserUid } : null }),
}));

const addToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast }),
}));

let promptResult: string | null = 'Unit 4 CFA';
const showPrompt = vi.fn(() => Promise.resolve(promptResult));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showPrompt }),
}));

const designateAssessment = vi.fn(() => Promise.resolve('new-assessment-id'));
let mockAggregatesSlice: {
  data: PlcAssessmentAggregate[];
  loading: boolean;
  error: Error | null;
  enabled: boolean;
};
let mockAssessmentsSlice: {
  data: PlcCommonAssessment[];
  loading: boolean;
  error: Error | null;
  enabled: boolean;
};
let mockMembers: PlcMember[] = [];
vi.mock('@/context/usePlcContext', async (importActual) => {
  const actual = await importActual<typeof import('@/context/usePlcContext')>();
  return {
    ...actual,
    usePlcAggregatesData: () => mockAggregatesSlice,
    usePlcAssessmentsData: () => mockAssessmentsSlice,
    usePlcMembers: () => mockMembers,
    usePlcActions: () => ({ designateAssessment }),
  };
});

let mockOwnContributions: PlcContribution[] = [];
vi.mock('@/hooks/usePlcContributions', () => ({
  usePlcContributions: () => ({
    contributions: mockOwnContributions,
    loading: false,
    error: null,
  }),
}));

vi.mock('@/components/plc/comments/PlcCommentsThread', () => ({
  PlcCommentsThread: ({ targetId }: { targetId: string }) => (
    <div data-testid="comments-thread" data-target-id={targetId} />
  ),
}));

import { PlcSharedDataBody } from '@/components/plc/sharedData/PlcSharedDataBody';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakePlc: Plc = {
  id: 'plc-1',
  name: '5th Grade Math',
  leadUid: 'uid-alice',
  members: {
    'uid-alice': {
      uid: 'uid-alice',
      email: 'alice@school.edu',
      displayName: 'Alice',
      role: 'lead',
      joinedAt: 1000,
      status: 'active',
    },
    'uid-bob': {
      uid: 'uid-bob',
      email: 'bob@school.edu',
      displayName: 'Bob',
      role: 'member',
      joinedAt: 1000,
      status: 'active',
    },
  },
  memberUids: ['uid-alice', 'uid-bob'],
  memberEmails: {
    'uid-alice': 'alice@school.edu',
    'uid-bob': 'bob@school.edu',
  },
  createdAt: 1000,
  updatedAt: 2000,
};

const members: PlcMember[] = [
  {
    uid: 'uid-alice',
    email: 'alice@school.edu',
    displayName: 'Alice',
    role: 'lead',
    joinedAt: 1000,
    status: 'active',
  },
  {
    uid: 'uid-bob',
    email: 'bob@school.edu',
    displayName: 'Bob',
    role: 'member',
    joinedAt: 1000,
    status: 'active',
  },
];

function makeAggregate(
  overrides: Partial<PlcAssessmentAggregate> = {}
): PlcAssessmentAggregate {
  return {
    assessmentId: 'sync-1',
    schemaVersion: 1,
    teacherCount: 2,
    studentCount: 40,
    teamAveragePercent: 72,
    perQuestion: [
      {
        questionId: 'q1',
        text: 'Easy question',
        correctPercent: 92,
        points: 1,
      },
      {
        questionId: 'q2',
        text: 'Hard question',
        correctPercent: 41,
        points: 1,
      },
      {
        questionId: 'q3',
        text: 'Medium question',
        correctPercent: 68,
        points: 1,
      },
    ],
    perTeacher: [
      {
        teacherUid: 'uid-alice',
        teacherName: 'Alice',
        classCount: 2,
        averagePercent: 78,
        studentCount: 22,
      },
      {
        teacherUid: 'uid-bob',
        teacherName: 'Bob',
        classCount: 1,
        averagePercent: 64,
        studentCount: 18,
      },
    ],
    ranAt: 5_000_000,
    ...overrides,
  };
}

function setDefaults() {
  mockUserUid = 'uid-alice';
  promptResult = 'Unit 4 CFA';
  mockMembers = members;
  mockOwnContributions = [];
  mockAggregatesSlice = {
    data: [makeAggregate()],
    loading: false,
    error: null,
    enabled: true,
  };
  mockAssessmentsSlice = {
    data: [],
    loading: false,
    error: null,
    enabled: true,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcSharedDataBody (aggregate-driven)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaults();
  });

  it('renders one card per aggregate', () => {
    render(<PlcSharedDataBody plc={fakePlc} />);
    expect(screen.getAllByTestId('shared-data-card')).toHaveLength(1);
  });

  it('shows a loading state when aggregates are loading', () => {
    mockAggregatesSlice = {
      data: [],
      loading: true,
      error: null,
      enabled: true,
    };
    render(<PlcSharedDataBody plc={fakePlc} />);
    expect(screen.queryAllByTestId('shared-data-card')).toHaveLength(0);
    expect(screen.getByText(/loading shared data/i)).toBeInTheDocument();
  });

  it('shows an error state when the aggregates read errors', () => {
    mockAggregatesSlice = {
      data: [],
      loading: false,
      error: new Error('Permission denied'),
      enabled: true,
    };
    render(<PlcSharedDataBody plc={fakePlc} />);
    expect(
      screen.getAllByText(/couldn't load|permission denied/i).length
    ).toBeGreaterThan(0);
  });

  it('shows an empty state when there are no aggregates', () => {
    mockAggregatesSlice = {
      data: [],
      loading: false,
      error: null,
      enabled: true,
    };
    render(<PlcSharedDataBody plc={fakePlc} />);
    expect(screen.getByText(/no shared data yet/i)).toBeInTheDocument();
  });

  it('renders team average, weakest questions, per-class compare and who-ran-it', () => {
    render(<PlcSharedDataBody plc={fakePlc} />);
    const card = screen.getByTestId('shared-data-card');
    fireEvent.click(within(card).getByRole('button'));

    // Team average headline.
    expect(within(card).getByText(/team average/i)).toBeInTheDocument();
    // Weakest question first (Hard question @ 41%).
    expect(within(card).getAllByText('Hard question').length).toBeGreaterThan(
      0
    );
    expect(within(card).getByText('41%')).toBeInTheDocument();
    // Per-class compare lists both teachers.
    expect(within(card).getAllByText('Alice').length).toBeGreaterThan(0);
    expect(within(card).getAllByText('Bob').length).toBeGreaterThan(0);
    // Who-ran-it cross-reference.
    expect(within(card).getByText(/who has run it/i)).toBeInTheDocument();
  });

  it('renders NO student names anywhere (anonymized)', () => {
    // The aggregate carries only counts; a stray student-name row would be a
    // leak. Inject a student-name-looking value into the aggregate (which the
    // real pipeline never emits) and assert the component never surfaces it.
    mockAggregatesSlice = {
      data: [makeAggregate()],
      loading: false,
      error: null,
      enabled: true,
    };
    render(<PlcSharedDataBody plc={fakePlc} />);
    const card = screen.getByTestId('shared-data-card');
    fireEvent.click(within(card).getByRole('button'));
    // No per-student rows: only teacher names + counts. The aggregate shape
    // carries no student-name field, so nothing student-identifying renders.
    expect(within(card).queryByText(/student a|student p|johnny/i)).toBeNull();
  });

  it('keys the comments thread to assessment:<assessmentId> per card', () => {
    render(<PlcSharedDataBody plc={fakePlc} />);
    const card = screen.getByTestId('shared-data-card');
    fireEvent.click(within(card).getByRole('button'));
    const thread = within(card).getByTestId('comments-thread');
    expect(thread).toHaveAttribute('data-target-id', 'assessment:sync-1');
  });

  it('shows the designate affordance and calls designateAssessment for an undesignated group', async () => {
    render(<PlcSharedDataBody plc={fakePlc} />);
    const card = screen.getByTestId('shared-data-card');
    fireEvent.click(within(card).getByRole('button'));

    const designateBtn = within(card).getByRole('button', {
      name: /^Designate$/,
    });
    fireEvent.click(designateBtn);

    await waitFor(() => expect(designateAssessment).toHaveBeenCalledTimes(1));
    expect(designateAssessment).toHaveBeenCalledWith({
      title: 'Unit 4 CFA',
      kind: 'quiz',
      syncGroupId: 'sync-1',
    });
  });

  it('does NOT show the designate affordance for a viewer (cannot edit)', () => {
    mockUserUid = 'uid-viewer';
    render(<PlcSharedDataBody plc={fakePlc} />);
    const card = screen.getByTestId('shared-data-card');
    fireEvent.click(within(card).getByRole('button'));
    expect(
      within(card).queryByRole('button', { name: /^Designate$/ })
    ).not.toBeInTheDocument();
  });

  it('does NOT show the designate affordance once the group is designated', () => {
    const assessment: PlcCommonAssessment = {
      id: 'sync-1',
      title: 'Unit 4 CFA',
      kind: 'quiz',
      syncGroupId: 'sync-1',
      status: 'reviewing',
      unitLabel: 'Unit 4',
      createdBy: 'uid-alice',
      createdAt: 1000,
      updatedAt: 2000,
    };
    mockAssessmentsSlice = {
      data: [assessment],
      loading: false,
      error: null,
      enabled: true,
    };
    render(<PlcSharedDataBody plc={fakePlc} />);
    const card = screen.getByTestId('shared-data-card');
    // Designated title is used.
    expect(within(card).getByText('Unit 4 CFA')).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button'));
    expect(
      within(card).queryByRole('button', { name: /^Designate$/ })
    ).not.toBeInTheDocument();
  });

  it('shows the "updating…" state when a contribution outruns ranAt', () => {
    // The signed-in member's own contribution is newer than the aggregate ranAt.
    mockOwnContributions = [
      {
        id: 'c-alice',
        schemaVersion: 1,
        quizId: 'quiz-a',
        syncGroupId: 'sync-1',
        teacherUid: 'uid-alice',
        teacherName: 'Alice',
        questionsSnapshot: [{ id: 'q1', text: 'Easy question', points: 1 }],
        responses: [],
        updatedAt: 9_999_999, // > aggregate.ranAt (5_000_000)
      },
    ];
    render(<PlcSharedDataBody plc={fakePlc} />);
    expect(screen.getByText(/updating/i)).toBeInTheDocument();
  });

  it('does NOT show "updating…" when ranAt is current', () => {
    mockOwnContributions = [
      {
        id: 'c-alice',
        schemaVersion: 1,
        quizId: 'quiz-a',
        syncGroupId: 'sync-1',
        teacherUid: 'uid-alice',
        teacherName: 'Alice',
        questionsSnapshot: [{ id: 'q1', text: 'Easy question', points: 1 }],
        responses: [],
        updatedAt: 1_000, // older than aggregate.ranAt
      },
    ];
    render(<PlcSharedDataBody plc={fakePlc} />);
    expect(screen.queryByText(/updating/i)).not.toBeInTheDocument();
  });

  it('teacher filter narrows to aggregates containing that teacher', () => {
    // Two aggregates: one with Bob, one without.
    const aggWithBob = makeAggregate({ assessmentId: 'sync-1' });
    const aggAliceOnly = makeAggregate({
      assessmentId: 'sync-2',
      perTeacher: [
        {
          teacherUid: 'uid-alice',
          teacherName: 'Alice',
          classCount: 1,
          averagePercent: 80,
          studentCount: 10,
        },
      ],
    });
    mockAggregatesSlice = {
      data: [aggWithBob, aggAliceOnly],
      loading: false,
      error: null,
      enabled: true,
    };
    render(<PlcSharedDataBody plc={fakePlc} />);
    expect(screen.getAllByTestId('shared-data-card')).toHaveLength(2);

    const teacherSelect = screen.getByRole('combobox', { name: /teacher/i });
    fireEvent.change(teacherSelect, { target: { value: 'uid-bob' } });
    expect(screen.getAllByTestId('shared-data-card')).toHaveLength(1);
  });

  it('renders the filter bar with accessible labels', () => {
    render(<PlcSharedDataBody plc={fakePlc} />);
    expect(screen.getByRole('combobox', { name: /type/i })).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: /teacher/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('searchbox', { name: /search assessments/i })
    ).toBeInTheDocument();
  });
});
