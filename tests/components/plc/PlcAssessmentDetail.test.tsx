/**
 * PlcAssessmentDetail renders the pooled view from a fixture aggregate:
 * worst-first question order, "Not scored yet" when nothing is published,
 * the per-teacher table gated by `showPerTeacher`, and the alignment note.
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type {
  Plc,
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  PlcMember,
} from '@/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
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
vi.mock('@/context/usePlcContext', () => ({
  usePlcAggregatesData: () => mockAggregatesSlice,
  usePlcAssessmentsData: () => mockAssessmentsSlice,
  usePlcMembers: () => mockMembers,
}));

const spaNavigate = vi.fn<(path: string) => void>();
vi.mock('@/utils/plcPath', async (importActual) => {
  const actual = await importActual<typeof import('@/utils/plcPath')>();
  return {
    ...actual,
    spaNavigate: (p: string) => {
      spaNavigate(p);
    },
  };
});

vi.mock('@/components/plc/comments/PlcCommentsThread', () => ({
  PlcCommentsThread: ({ targetId }: { targetId: string }) => (
    <div data-testid="comments-thread" data-target-id={targetId} />
  ),
}));

import { PlcAssessmentDetail } from '@/components/plc/assessments/PlcAssessmentDetail';

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
  {
    uid: 'uid-carol',
    email: 'carol@school.edu',
    displayName: 'Carol',
    role: 'member',
    joinedAt: 1000,
    status: 'active',
  },
];

function makePlc(overrides: Partial<Plc> = {}): Plc {
  return {
    id: 'plc-1',
    name: 'English 9',
    leadUid: 'uid-alice',
    members: {},
    memberUids: members.map((m) => m.uid),
    memberEmails: {},
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

function makeAggregate(
  overrides: Partial<PlcAssessmentAggregate> = {}
): PlcAssessmentAggregate {
  return {
    assessmentId: 'a1',
    schemaVersion: 2,
    title: 'Unit 4 CFA',
    kind: 'quiz',
    teacherCount: 2,
    studentCount: 40,
    teamAveragePercent: 72,
    scoredStudentCount: 40,
    sessionCount: 2,
    linkedSessionCount: 2,
    publishedSessionCount: 2,
    perQuestion: [
      {
        questionId: 'q1',
        text: 'Easy question',
        correctPercent: 92,
        points: 1,
        incorrectPercent: 8,
        answered: 40,
        graded: 40,
        correct: 37,
        choiceDistribution: [
          { label: 'St. Paul', count: 37, isCorrect: true },
          { label: 'Duluth', count: 3, isCorrect: false },
        ],
      },
      {
        questionId: 'q2',
        text: 'Hard question',
        correctPercent: 41,
        points: 1,
        incorrectPercent: 59,
        answered: 40,
        graded: 40,
        correct: 16,
        choiceDistribution: [],
      },
      {
        questionId: 'q3',
        text: 'Essay question',
        correctPercent: 0,
        points: 5,
        incorrectPercent: null,
        answered: 38,
        graded: 0,
        correct: 0,
        choiceDistribution: [],
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

const assessment: PlcCommonAssessment = {
  id: 'a1',
  title: 'Unit 4 CFA',
  kind: 'quiz',
  syncGroupId: 'g1',
  status: 'active',
  createdBy: 'uid-alice',
  createdAt: 1000,
  updatedAt: 2000,
};

function setDefaults() {
  mockMembers = members;
  mockAggregatesSlice = {
    data: [makeAggregate()],
    loading: false,
    error: null,
    enabled: true,
  };
  mockAssessmentsSlice = {
    data: [assessment],
    loading: false,
    error: null,
    enabled: true,
  };
  spaNavigate.mockReset();
}

describe('PlcAssessmentDetail', () => {
  beforeEach(setDefaults);

  it('renders the header stats and the questions worst-first', () => {
    render(<PlcAssessmentDetail plc={makePlc()} assessmentId="a1" />);

    expect(screen.getByText('Unit 4 CFA')).toBeInTheDocument();
    expect(screen.getByTestId('team-average')).toHaveTextContent('72%');
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();

    const rows = screen.getAllByTestId('question-row');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Hard question'),
      expect.stringContaining('Easy question'),
      expect.stringContaining('Essay question'),
    ]);
    expect(within(rows[0]).getByText('59% incorrect')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Not scored')).toBeInTheDocument();
  });

  it('toggles the choice distribution for MC questions', () => {
    render(<PlcAssessmentDetail plc={makePlc()} assessmentId="a1" />);
    const easy = screen.getAllByTestId('question-row')[1];
    expect(screen.queryByTestId('choice-distribution')).toBeNull();
    fireEvent.click(within(easy).getByRole('button'));
    const panel = screen.getByTestId('choice-distribution');
    expect(within(panel).getByText('St. Paul')).toBeInTheDocument();
    expect(within(panel).getByText('37 · 93%')).toBeInTheDocument();
    expect(within(panel).getByText('Duluth')).toBeInTheDocument();
  });

  it('shows "Not scored yet" when no session has published scores', () => {
    mockAggregatesSlice.data = [
      makeAggregate({ publishedSessionCount: 0, scoredStudentCount: 0 }),
    ];
    render(<PlcAssessmentDetail plc={makePlc()} assessmentId="a1" />);
    expect(screen.getByTestId('team-average')).toHaveTextContent(
      'Not scored yet'
    );
    expect(screen.queryByText('72%')).toBeNull();
  });

  it('hides the per-teacher table unless showPerTeacher is on', () => {
    const { rerender } = render(
      <PlcAssessmentDetail plc={makePlc()} assessmentId="a1" />
    );
    expect(screen.queryByTestId('per-teacher-table')).toBeNull();
    expect(screen.queryByText('Alice')).toBeNull();

    rerender(
      <PlcAssessmentDetail
        plc={makePlc({ features: { showPerTeacher: true } as Plc['features'] })}
        assessmentId="a1"
      />
    );
    const table = screen.getByTestId('per-teacher-table');
    expect(within(table).getByText('Alice')).toBeInTheDocument();
    expect(within(table).getByText('78%')).toBeInTheDocument();
    expect(within(table).getByText('Bob')).toBeInTheDocument();
  });

  it('surfaces the alignment warning as a note', () => {
    mockAggregatesSlice.data = [
      makeAggregate({ alignmentWarning: 'Matched by position.' }),
    ];
    render(<PlcAssessmentDetail plc={makePlc()} assessmentId="a1" />);
    expect(screen.getByRole('note')).toHaveTextContent('Matched by position.');
  });

  it('keys the comments thread to the assessment id', () => {
    render(<PlcAssessmentDetail plc={makePlc()} assessmentId="a1" />);
    expect(screen.getByTestId('comments-thread')).toHaveAttribute(
      'data-target-id',
      'assessment:a1'
    );
  });

  it('renders a not-found state for an unknown id and links back', () => {
    render(<PlcAssessmentDetail plc={makePlc()} assessmentId="nope" />);
    expect(screen.getByText('Assessment not found')).toBeInTheDocument();
    fireEvent.click(screen.getByText('All assessments'));
    expect(spaNavigate).toHaveBeenCalledWith('/plc/plc-1/assessments');
  });

  it('never renders student names', () => {
    const { container } = render(
      <PlcAssessmentDetail plc={makePlc()} assessmentId="a1" />
    );
    expect(container.textContent).not.toContain('studentDisplayName');
  });
});
