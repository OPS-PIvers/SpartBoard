/**
 * Tests for QuizManager's assign stepper: the Quiz steps, last-used rule
 * prefill, class picks, Manual start and PLC sharing, all checked through
 * the `onAssign` arguments.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import '@/i18n';

import { QuizManager } from '@/components/widgets/QuizWidget/components/QuizManager';
import type {
  ClassRoster,
  QuizConfig,
  QuizMetadata,
  QuizBehaviorSettings,
} from '@/types';
import type { AssignTargetingValue } from '@/utils/studentTargetRef';

// ---------------------------------------------------------------------------
// Heavy hook stubs
// ---------------------------------------------------------------------------

let mockPlcs: { id: string; name: string }[] = [];
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({ plcs: mockPlcs }),
}));

vi.mock('@/hooks/usePlcQuizzes', () => ({
  usePlcQuizzes: () => ({ quizzes: [], loading: false, error: null }),
}));

vi.mock('@/hooks/useFolders', () => ({
  useFolders: () => ({
    folders: [],
    loading: false,
    error: null,
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    moveFolder: vi.fn(),
    deleteFolder: vi.fn(),
    moveItem: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSessionViewCount', () => ({
  useSessionViewCount: () => ({ count: 0 }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', displayName: 'Test Teacher' },
    canSeeShareTracking: vi.fn(() => false),
    canAccessQuizMediaResponse: vi.fn(() => false),
    canAccessFeature: vi.fn(() => false),
  }),
}));

vi.mock('@/hooks/useLastQuizAssignSettings', () => ({
  useLastQuizAssignSettings: (_uid: string, enabled: boolean) => ({
    lastUsed: enabled
      ? {
          sessionMode: 'student',
          sessionOptions: { blockCopyPaste: true, streakBonusEnabled: true },
          attemptLimit: 5,
        }
      : null,
    loaded: true,
    save: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ROSTERS: ClassRoster[] = [
  {
    id: 'r1',
    name: 'Period 1',
    students: [],
    source: 'manual',
  } as unknown as ClassRoster,
  {
    id: 'r2',
    name: 'Period 2',
    source: 'manual',
    defaultOverridesByStudentId: { s1: { timeMultiplier: 2 } },
    students: [
      {
        id: 's1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        pin: '01',
        classLinkSourcedId: 'SID-1',
      },
    ],
  } as unknown as ClassRoster,
];

const BASE_CONFIG: QuizConfig = {
  view: 'manager',
  managerTab: 'library',
  plcMode: false,
  teacherName: '',
} as unknown as QuizConfig;

function makeQuizMeta(overrides: Partial<QuizMetadata> = {}): QuizMetadata {
  return {
    id: 'quiz-1',
    title: 'Chapter 5 Review',
    driveFileId: 'drive-1',
    questionCount: 5,
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

describe('QuizManager assign stepper', () => {
  afterEach(() => {
    mockPlcs = [];
  });

  const openStepper = async (
    onAssign = vi.fn(),
    extra: Partial<React.ComponentProps<typeof QuizManager>> = {}
  ) => {
    render(
      <QuizManager
        quizzes={[makeQuizMeta()]}
        loading={false}
        error={null}
        onNew={vi.fn()}
        onImport={vi.fn()}
        onEdit={vi.fn()}
        onPreview={vi.fn()}
        onAssign={onAssign}
        onResults={vi.fn()}
        onDelete={vi.fn()}
        onShare={vi.fn()}
        rosters={ROSTERS}
        config={BASE_CONFIG}
        managerTab="library"
        {...extra}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: /^assign$/i }));
    return screen.findByRole('dialog', { name: /chapter 5 review/i });
  };

  it('opens straight into the stepper with no destination chooser', async () => {
    await openStepper();
    expect(
      screen.queryByRole('button', { name: /SpartBoard Only/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Continue to Google Classroom/i })
    ).not.toBeInTheDocument();
  });

  const stepTitles = (dialog: HTMLElement) =>
    within(dialog)
      .getAllByRole('button', { expanded: true })
      .concat(within(dialog).getAllByRole('button', { expanded: false }))
      .map((b) => b.textContent ?? '');

  it('shows the Quiz steps and prefills last-used rules', async () => {
    const onAssign = vi.fn();
    const dialog = await openStepper(onAssign);
    const titles = stepTitles(dialog).join('|');
    for (const title of [
      'Classes',
      'When',
      'Attempts and order',
      'Quiz integrity',
      'What students see',
    ])
      expect(titles).toContain(title);
    expect(titles).not.toContain('Sharing');
    expect(
      within(dialog).getByText('5 attempts, Shuffled answers')
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /^assign$/i }));
    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    const call = onAssign.mock.calls[0];
    const behavior = call[1] as QuizBehaviorSettings;
    expect(behavior.sessionMode).toBe('student');
    expect(behavior.attemptLimit).toBe(5);
    // No bell periods: Scheduled, so a due date is set and Manual is off.
    expect(call[4]).toEqual(expect.any(Number));
    expect(call[8]).toEqual({
      classes: { classIds: [], studentsByClass: {} },
      manualStart: false,
    });
  });

  it('defaults to Manual when bell periods exist: no due date, closed classes', async () => {
    const onAssign = vi.fn();
    const dialog = await openStepper(onAssign, {
      periodAccess: {
        bellOptions: [],
        bellWindow: () => null,
        onTagRoster: vi.fn(),
      } as unknown as React.ComponentProps<typeof QuizManager>['periodAccess'],
    });
    expect(
      within(dialog).getByText('Manual. You start and pause each class.')
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /^assign$/i }));
    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    const call = onAssign.mock.calls[0];
    expect(call[4]).toBeNull();
    const targeting = call[5] as AssignTargetingValue;
    expect(targeting.periodPlan).toEqual({ mode: 'assessment' });
    expect(targeting.dueAt).toBeUndefined();
    expect(call[8]).toMatchObject({ manualStart: true });
  });

  it('passes the picked classes through to onAssign', async () => {
    const onAssign = vi.fn();
    const dialog = await openStepper(onAssign);
    fireEvent.click(
      within(dialog).getByRole('button', { name: /no classes/i })
    );
    fireEvent.click(
      within(dialog).getByRole('checkbox', { name: /period 2/i })
    );
    fireEvent.click(within(dialog).getByRole('button', { name: /^assign$/i }));
    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    expect(onAssign.mock.calls[0][3]).toEqual(['r2']);
    expect(onAssign.mock.calls[0][8]).toMatchObject({
      classes: { classIds: ['r2'], studentsByClass: {} },
    });
  });

  it('blocks Assign while sharing is on with several PLCs and none picked', async () => {
    mockPlcs = [
      { id: 'plc-a', name: 'Grade 8 Science PLC' },
      { id: 'plc-b', name: 'Orono MS Science' },
    ];
    const onAssign = vi.fn();
    const dialog = await openStepper(onAssign);
    fireEvent.click(within(dialog).getByRole('button', { name: /sharing/i }));
    fireEvent.click(
      within(dialog).getByRole('switch', { name: /share results with a plc/i })
    );
    const assign = within(dialog).getByRole('button', { name: /^assign$/i });
    expect(assign).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('PLC'), {
      target: { value: 'plc-b' },
    });
    expect(assign).toBeEnabled();
    fireEvent.click(assign);
    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    expect(onAssign.mock.calls[0][2]).toMatchObject({
      plcMode: true,
      plcId: 'plc-b',
    });
  });

  it('offers no Study Resource choice and assigns without a work kind', async () => {
    const onAssign = vi.fn();
    const dialog = await openStepper(onAssign);
    expect(
      within(dialog).queryByRole('radio', { name: /study resource/i })
    ).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /^assign$/i }));
    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    expect(
      (onAssign.mock.calls[0][5] as AssignTargetingValue).workKind
    ).toBeUndefined();
  });
});
