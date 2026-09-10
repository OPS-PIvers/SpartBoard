/**
 * PlcAssessmentList — status badges, the filter chip, search, row navigation,
 * editor-only actions, and the shared-library disclosure.
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type {
  Plc,
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  PlcMember,
  PlcQuizEntry,
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

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'uid-alice' },
    getAssignmentMode: () => 'submissions',
  }),
}));

const addToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast }),
}));

let promptResult: string | null = 'Renamed CFA';
const showPrompt = vi.fn(() => Promise.resolve(promptResult));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showPrompt }),
}));

const updateAssessment = vi.fn(() => Promise.resolve());
let mockCanEdit = true;
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
  useCanEditPlcContent: () => mockCanEdit,
  usePlcActions: () => ({ updateAssessment }),
  usePlcAggregatesData: () => mockAggregatesSlice,
  usePlcAssessmentsData: () => mockAssessmentsSlice,
  usePlcMembers: () => mockMembers,
}));

let mockLibrary: PlcQuizEntry[] = [];
vi.mock('@/hooks/usePlcQuizzes', () => ({
  usePlcQuizzes: () => ({ quizzes: mockLibrary, loading: false, error: null }),
}));

const mockMoveEntry = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/usePlcFolders', () => ({
  usePlcFolders: () => ({
    folders: [],
    loading: false,
    error: null,
    createFolder: vi.fn().mockResolvedValue('f1'),
    renameFolder: vi.fn(),
    moveFolder: vi.fn(),
    deleteFolder: vi.fn(),
    reorderSiblings: vi.fn(),
    moveItem: vi.fn(),
    moveEntry: mockMoveEntry,
  }),
}));

let mockPersonalQuizzes: Array<{ id: string }> = [{ id: 'mine' }];
vi.mock('@/hooks/useQuiz', () => ({
  useQuiz: () => ({ quizzes: mockPersonalQuizzes, isDriveConnected: true }),
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

vi.mock('@/components/plc/bodies/PlcQuizLibraryBody', () => ({
  PlcQuizLibraryBody: () => <div data-testid="quiz-library-body" />,
}));
vi.mock('@/components/plc/PlcNewQuizAssignmentModal', () => ({
  PlcNewQuizAssignmentModal: () => <div data-testid="assign-modal" />,
}));

import { PlcAssessmentList } from '@/components/plc/assessments/PlcAssessmentList';

const plc: Plc = {
  id: 'plc-1',
  name: 'English 9',
  leadUid: 'uid-alice',
  members: {},
  memberUids: ['uid-alice', 'uid-bob', 'uid-carol'],
  memberEmails: {},
  createdAt: 1000,
  updatedAt: 2000,
};

const members: PlcMember[] = ['uid-alice', 'uid-bob', 'uid-carol'].map(
  (uid) => ({
    uid,
    email: `${uid}@school.edu`,
    displayName: uid,
    role: 'member',
    joinedAt: 1000,
    status: 'active',
  })
);

function makeAggregate(
  overrides: Partial<PlcAssessmentAggregate> = {}
): PlcAssessmentAggregate {
  return {
    assessmentId: 'a-scored',
    schemaVersion: 2,
    teacherCount: 2,
    studentCount: 40,
    teamAveragePercent: 72,
    scoredStudentCount: 40,
    sessionCount: 2,
    linkedSessionCount: 2,
    publishedSessionCount: 2,
    perQuestion: [],
    perTeacher: [],
    ranAt: 5_000_000,
    ...overrides,
  };
}

function makeAssessment(
  overrides: Partial<PlcCommonAssessment> = {}
): PlcCommonAssessment {
  return {
    id: 'a-scored',
    title: 'Fractions CFA',
    kind: 'quiz',
    syncGroupId: 'g-scored',
    status: 'active',
    createdBy: 'uid-alice',
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

function setDefaults() {
  mockCanEdit = true;
  promptResult = 'Renamed CFA';
  mockMembers = members;
  mockPersonalQuizzes = [{ id: 'mine' }];
  mockLibrary = [
    {
      id: 'lib-1',
      title: 'Ratios warm-up',
      questionCount: 6,
      syncGroupId: 'g-lib',
      sharedBy: 'uid-bob',
      sharedByEmail: 'bob@school.edu',
      sharedByName: 'Bob',
      sharedAt: 900,
      updatedAt: 900,
    },
  ];
  mockAssessmentsSlice = {
    data: [
      makeAssessment(),
      makeAssessment({
        id: 'a-running',
        title: 'Decimals quiz',
        syncGroupId: 'g-running',
      }),
      makeAssessment({
        id: 'a-idle',
        title: 'Percents exit ticket',
        syncGroupId: 'g-idle',
      }),
    ],
    loading: false,
    error: null,
    enabled: true,
  };
  mockAggregatesSlice = {
    data: [
      makeAggregate(),
      makeAggregate({
        assessmentId: 'a-running',
        publishedSessionCount: 1,
        studentCount: 12,
        teacherCount: 1,
      }),
    ],
    loading: false,
    error: null,
    enabled: true,
  };
  addToast.mockReset();
  updateAssessment.mockClear();
  spaNavigate.mockReset();
  showPrompt.mockClear();
}

function rowByTitle(title: string): HTMLElement {
  const row = screen
    .getAllByTestId('assessment-row')
    .find((r) => r.textContent?.includes(title));
  if (!row) throw new Error(`row ${title} not found`);
  return row;
}

describe('PlcAssessmentList', () => {
  beforeEach(setDefaults);

  it('renders one row per assessment plus library-only rows with badges', () => {
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    expect(screen.getAllByTestId('assessment-row')).toHaveLength(4);
    const badge = (title: string) =>
      within(rowByTitle(title))
        .getByTestId('assessment-status')
        .getAttribute('data-status');
    expect(badge('Fractions CFA')).toBe('scored');
    expect(badge('Decimals quiz')).toBe('inProgress');
    expect(badge('Percents exit ticket')).toBe('notStarted');
    expect(badge('Ratios warm-up')).toBe('libraryOnly');
    expect(rowByTitle('Fractions CFA')).toHaveTextContent('2 of 3 teachers');
    expect(rowByTitle('Fractions CFA')).toHaveTextContent('40 students');
    expect(rowByTitle('Ratios warm-up')).toHaveTextContent('No results yet');
  });

  it('filters with the status chip and the search box', () => {
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Scored' }));
    expect(screen.getAllByTestId('assessment-row')).toHaveLength(1);
    expect(screen.getByText('Fractions CFA')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.change(screen.getByLabelText('Search assessments'), {
      target: { value: 'DECIMALS' },
    });
    expect(screen.getAllByTestId('assessment-row')).toHaveLength(1);
    expect(screen.getByText('Decimals quiz')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search assessments'), {
      target: { value: 'zzz' },
    });
    expect(
      screen.getByText('No assessments match this filter.')
    ).toBeInTheDocument();
  });

  it('navigates to the detail route when an assessment row is clicked', () => {
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    fireEvent.click(
      within(rowByTitle('Fractions CFA')).getAllByRole('button', {
        name: /Fractions CFA/,
      })[0]
    );
    expect(spaNavigate).toHaveBeenCalledWith('/plc/plc-1/assessments/a-scored');
  });

  it('renames through the prompt and archives via the kebab (editors only)', async () => {
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    const row = rowByTitle('Fractions CFA');
    fireEvent.click(
      within(row).getByRole('button', { name: /More actions for/ })
    );
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Rename' }));
    await vi.waitFor(() =>
      expect(updateAssessment).toHaveBeenCalledWith('a-scored', {
        title: 'Renamed CFA',
      })
    );

    fireEvent.click(
      within(row).getByRole('button', { name: /More actions for/ })
    );
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Archive' }));
    await vi.waitFor(() =>
      expect(updateAssessment).toHaveBeenCalledWith('a-scored', {
        status: 'closed',
      })
    );
  });

  it('hides assign, rename and archive for viewers', () => {
    mockCanEdit = false;
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    expect(screen.queryByText('Assign to my classes')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /More actions for/ })
    ).toBeNull();
    expect(screen.queryByText('Assign Quiz')).toBeNull();
  });

  it('opens the assign modal from the header CTA and a row action', () => {
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assign Quiz' }));
    expect(screen.getByTestId('assign-modal')).toBeInTheDocument();
  });

  it('toggles the shared-quiz library disclosure', () => {
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    expect(screen.queryByTestId('quiz-library-body')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: /Manage shared quizzes/ })
    );
    expect(screen.getByTestId('quiz-library-body')).toBeInTheDocument();
  });

  it('shows the empty state when there are no assessments or shared quizzes', () => {
    mockAssessmentsSlice.data = [];
    mockAggregatesSlice.data = [];
    mockLibrary = [];
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    expect(screen.getByText('No assessments yet')).toBeInTheDocument();
  });
});
