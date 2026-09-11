// PlcAssessmentList — badges, filters, row actions, archive/restore and the share CTA.

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
const archiveQuiz = vi.fn(() => Promise.resolve());
const restoreQuiz = vi.fn(() => Promise.resolve());
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
  usePlcActions: () => ({ updateAssessment, archiveQuiz, restoreQuiz }),
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

const importQuiz = vi.fn();
const assignQuiz = vi.fn();
const editQuiz = vi.fn();
const openVersionHistory = vi.fn();
const openSharePicker = vi.fn();
let mockInLibraryGroups: string[] = [];
let mockDriveConnected = true;
vi.mock('@/hooks/usePlcQuizActions', () => ({
  usePlcQuizActions: () => ({
    importQuiz,
    reimportQuiz: importQuiz,
    assignQuiz,
    editQuiz,
    openVersionHistory,
    openSharePicker,
    busyRowId: null,
    busy: false,
    isDriveConnected: mockDriveConnected,
    isInLibrary: (groupId: string) => mockInLibraryGroups.includes(groupId),
    modals: <div data-testid="quiz-action-modals" />,
  }),
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

function makeEntry(overrides: Partial<PlcQuizEntry> = {}): PlcQuizEntry {
  return {
    id: 'lib-1',
    title: 'Ratios warm-up',
    questionCount: 6,
    syncGroupId: 'g-lib',
    sharedBy: 'uid-bob',
    sharedByEmail: 'bob@school.edu',
    sharedByName: 'Bob',
    sharedAt: 900,
    updatedAt: 900,
    ...overrides,
  };
}

function setDefaults() {
  mockCanEdit = true;
  promptResult = 'Renamed CFA';
  mockMembers = members;
  mockInLibraryGroups = [];
  mockDriveConnected = true;
  mockLibrary = [
    makeEntry(),
    makeEntry({ id: 'lib-2', syncGroupId: 'g-scored' }),
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
      makeAggregate({
        schemaVersion: 3,
        perTarget: [
          {
            targetId: 'target-fractions',
            kind: 'plc',
            code: 'LT-1',
            label: 'Model fractions',
            questionIds: ['q1'],
            attempted: 20,
            correctPercent: 75,
            lowSample: false,
          },
        ],
      }),
      makeAggregate({
        assessmentId: 'a-running',
        scoredStudentCount: 0,
        studentCount: 12,
        teacherCount: 1,
        schemaVersion: 3,
        perTarget: [
          {
            targetId: 'target-decimals',
            kind: 'plc',
            code: 'LT-2',
            label: 'Model decimals',
            questionIds: ['q1'],
            attempted: 12,
            correctPercent: 60,
            lowSample: false,
          },
        ],
      }),
    ],
    loading: false,
    error: null,
    enabled: true,
  };
  addToast.mockReset();
  updateAssessment.mockClear();
  archiveQuiz.mockClear();
  restoreQuiz.mockClear();
  spaNavigate.mockReset();
  showPrompt.mockClear();
  importQuiz.mockClear();
  assignQuiz.mockClear();
  editQuiz.mockClear();
  openVersionHistory.mockClear();
  openSharePicker.mockClear();
}

function rowByTitle(title: string): HTMLElement {
  const row = screen
    .getAllByTestId('assessment-row')
    .find((r) => r.textContent?.includes(title));
  if (!row) throw new Error(`row ${title} not found`);
  return row;
}

function openKebab(row: HTMLElement) {
  fireEvent.click(
    within(row).getByRole('button', { name: /More actions for/ })
  );
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
    expect(badge('Ratios warm-up')).toBe('notStarted');
    expect(rowByTitle('Fractions CFA')).toHaveTextContent('2 of 3 teachers');
    expect(rowByTitle('Ratios warm-up')).toHaveTextContent('No results yet');
  });

  it('shows the "In your library" badge only for imported sync groups', () => {
    mockInLibraryGroups = ['g-lib'];
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    expect(rowByTitle('Ratios warm-up')).toHaveTextContent('In your library');
    expect(rowByTitle('Decimals quiz')).not.toHaveTextContent(
      'In your library'
    );
  });

  it('filters with the status chips and the search box', () => {
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Scored' }));
    expect(screen.getAllByTestId('assessment-row')).toHaveLength(1);
    expect(screen.getByText('Fractions CFA')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.change(screen.getByLabelText('Search assessments'), {
      target: { value: 'DECIMALS' },
    });
    expect(screen.getAllByTestId('assessment-row')).toHaveLength(1);

    fireEvent.change(screen.getByLabelText('Search assessments'), {
      target: { value: 'zzz' },
    });
    expect(
      screen.getByText('No assessments match this filter.')
    ).toBeInTheDocument();
  });

  it('renders target chips and filters assessments by target', () => {
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    expect(rowByTitle('Fractions CFA')).toHaveTextContent('LT-1');
    expect(rowByTitle('Decimals quiz')).toHaveTextContent('LT-2');
    fireEvent.change(screen.getByLabelText('Filter by target'), {
      target: { value: 'target-decimals' },
    });
    expect(screen.getAllByTestId('assessment-row')).toHaveLength(1);
    expect(screen.getByText('Decimals quiz')).toBeInTheDocument();
  });

  it('shows archived rows only under the Archived chip', () => {
    mockAssessmentsSlice.data = [
      makeAssessment({ id: 'a-old', title: 'Old CFA', status: 'closed' }),
      makeAssessment(),
    ];
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    expect(screen.queryByText('Old CFA')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    expect(screen.getAllByTestId('assessment-row')).toHaveLength(1);
    expect(screen.getByText('Old CFA')).toBeInTheDocument();
  });

  it('shows the archived empty state when nothing is archived', () => {
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    expect(screen.getByText('No archived quizzes.')).toBeInTheDocument();
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

  it('offers the library actions in the kebab of a library-only row', () => {
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    const row = rowByTitle('Ratios warm-up');
    openKebab(row);
    fireEvent.click(
      within(row).getByRole('menuitem', { name: 'Add to my library' })
    );
    expect(importQuiz).toHaveBeenCalledWith(
      expect.objectContaining({ plcQuizId: 'lib-1', syncGroupId: 'g-lib' })
    );

    openKebab(row);
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Edit' }));
    expect(editQuiz).toHaveBeenCalled();

    openKebab(row);
    fireEvent.click(
      within(row).getByRole('menuitem', { name: 'Version history' })
    );
    expect(openVersionHistory).toHaveBeenCalled();

    // No live assessment yet, so there is nothing to rename.
    openKebab(row);
    expect(within(row).queryByRole('menuitem', { name: 'Rename' })).toBeNull();
  });

  it('assigns a row through the quiz actions hook', () => {
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    fireEvent.click(
      within(rowByTitle('Ratios warm-up')).getByRole('button', {
        name: 'Assign to my classes',
      })
    );
    expect(assignQuiz).toHaveBeenCalledWith(
      expect.objectContaining({ plcQuizId: 'lib-1' })
    );
  });

  it('renames through the prompt', async () => {
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    const row = rowByTitle('Fractions CFA');
    openKebab(row);
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Rename' }));
    await vi.waitFor(() =>
      expect(updateAssessment).toHaveBeenCalledWith('a-scored', {
        title: 'Renamed CFA',
      })
    );
  });

  it('archives with both ids and restores an archived row', async () => {
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    const row = rowByTitle('Fractions CFA');
    openKebab(row);
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Archive' }));
    await vi.waitFor(() =>
      expect(archiveQuiz).toHaveBeenCalledWith({
        plcQuizId: 'lib-2',
        assessmentId: 'a-scored',
      })
    );
  });

  it('offers only Restore on an archived row', async () => {
    mockAssessmentsSlice.data = [
      makeAssessment({ id: 'a-old', title: 'Old CFA', status: 'closed' }),
    ];
    mockAggregatesSlice.data = [];
    mockLibrary = [];
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    const row = rowByTitle('Old CFA');
    expect(
      within(row).queryByRole('button', { name: 'Assign to my classes' })
    ).toBeNull();
    openKebab(row);
    expect(within(row).queryByRole('menuitem', { name: 'Archive' })).toBeNull();
    fireEvent.click(within(row).getByRole('menuitem', { name: 'Restore' }));
    await vi.waitFor(() =>
      expect(restoreQuiz).toHaveBeenCalledWith({
        plcQuizId: null,
        assessmentId: 'a-old',
      })
    );
  });

  it('opens the share picker from the primary button', () => {
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share a quiz' }));
    expect(openSharePicker).toHaveBeenCalled();
  });

  it('hides every editor action for viewers', () => {
    mockCanEdit = false;
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    expect(screen.queryByText('Assign to my classes')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /More actions for/ })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Share a quiz' })).toBeNull();
  });

  it('shows the empty state when there are no assessments or shared quizzes', () => {
    mockAssessmentsSlice.data = [];
    mockAggregatesSlice.data = [];
    mockLibrary = [];
    render(<PlcAssessmentList plc={plc} onCloseDashboard={vi.fn()} />);
    expect(screen.getByText('No assessments yet')).toBeInTheDocument();
  });
});
