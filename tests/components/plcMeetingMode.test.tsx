/**
 * Happy-path render test for PlcMeetingMode (Wave 3 — the hero surface, PRD §6.2).
 *
 * Drives the guided live flow end to end with mocked provider actions:
 *
 *   Pick   → select the (anonymized aggregate) common assessment
 *   Review → the FERPA-safe aggregate renders (team avg, weakest questions,
 *            per-class, who-ran-it); a "Discuss" jumps to Decide pre-linked
 *   Decide → capture a decision
 *   Act    → capture an action item (which becomes a to-do on save)
 *   Save   → `saveMeeting` is called with the working state; the provider
 *            spawns a to-do; the success ("Meeting saved") view renders.
 *
 * The provider actions (`createMeeting` / `updateMeeting` / `saveMeeting`) are
 * mocked: `createMeeting` returns a stable id, `saveMeeting` resolves after
 * recording its arguments. We assert the call contract — Meeting Mode is the
 * orchestrator; the actual PlcMeeting write + todo spawn live in the provider
 * and are covered by the context/util suites.
 *
 * Firebase is never booted: every hook the component consumes is mocked. The
 * Review aggregate carries only counts + teacher names, never student names, so
 * the same anonymization guarantee Shared Data has holds in Meeting Mode too.
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
  PlcMember,
  PlcMeeting,
} from '@/types';

// ---------------------------------------------------------------------------
// Mocks — translation echoes defaultValue with {{interpolation}} applied.
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: Record<string, unknown>) => {
      let template = (o?.defaultValue as string) ?? _k;
      if (o) {
        for (const [key, value] of Object.entries(o)) {
          if (key === 'defaultValue') continue;
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
    googleAccessToken: null,
  }),
}));

const addToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast }),
}));

const showPrompt = vi.fn(() => Promise.resolve('Unit 4 CFA'));
const showConfirm = vi.fn(() => Promise.resolve(true));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showPrompt, showConfirm }),
}));

// Provider action spies — the contract Meeting Mode must honor.
const createMeeting = vi.fn(() => Promise.resolve('meeting-1'));
const updateMeeting = vi.fn(() => Promise.resolve());
const designateAssessment = vi.fn(() => Promise.resolve('designated-id'));
let savedActionItems: PlcMeeting['actionItems'] = [];
const saveMeeting = vi.fn(
  (
    _id: string,
    input: {
      assessmentIds?: string[];
      decisions?: PlcMeeting['decisions'];
      actionItems?: PlcMeeting['actionItems'];
    }
  ) => {
    // Mirror the provider: action items become spawned to-dos.
    savedActionItems = (input.actionItems ?? []).map((a, i) => ({
      ...a,
      todoId: `todo-${i}`,
    }));
    return Promise.resolve(['todo-0']);
  }
);

let mockAggregates: PlcAssessmentAggregate[] = [];
let mockAssessments: PlcCommonAssessment[] = [];
let mockMembers: PlcMember[] = [];
let mockWhoIsHere: Array<{ uid: string; displayName: string }> = [];

vi.mock('@/context/usePlcContext', async (importActual) => {
  const actual = await importActual<typeof import('@/context/usePlcContext')>();
  return {
    ...actual,
    usePlcAggregatesData: () => ({
      data: mockAggregates,
      loading: false,
      error: null,
      enabled: true,
    }),
    usePlcAssessmentsData: () => ({
      data: mockAssessments,
      loading: false,
      error: null,
      enabled: true,
    }),
    usePlcMembers: () => mockMembers,
    usePlcWhoIsHere: () => mockWhoIsHere,
    usePlcActions: () => ({
      designateAssessment,
      createMeeting,
      updateMeeting,
      saveMeeting,
    }),
  };
});

vi.mock('@/hooks/usePlcMeetings', () => ({
  usePlcMeetings: () => ({
    meetings: [],
    meetingsById: {},
    loading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/usePlcContributions', () => ({
  usePlcContributions: () => ({
    contributions: [],
    loading: false,
    error: null,
  }),
}));

// The comments thread + record view are not under test here.
vi.mock('@/components/plc/comments/PlcCommentsThread', () => ({
  PlcCommentsThread: () => <div data-testid="comments-thread" />,
}));

import { PlcMeetingMode } from '@/components/plc/meeting/PlcMeetingMode';

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

const designatedAssessment: PlcCommonAssessment = {
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

function makeAggregate(): PlcAssessmentAggregate {
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
  };
}

function advance(): void {
  // Click the visible "Next" button in the step footer.
  fireEvent.click(screen.getByRole('button', { name: /^Next$/ }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcMeetingMode — guided happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savedActionItems = [];
    mockAggregates = [makeAggregate()];
    mockAssessments = [designatedAssessment];
    mockMembers = members;
    mockWhoIsHere = [{ uid: 'uid-bob', displayName: 'Bob' }];
  });

  it('renders the Pick step with the common assessment', () => {
    render(<PlcMeetingMode plc={fakePlc} onNavigate={vi.fn()} />);
    expect(
      screen.getByText(/what are we looking at today/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Unit 4 CFA')).toBeInTheDocument();
  });

  it('blocks advancing past Pick until an assessment is selected', () => {
    render(<PlcMeetingMode plc={fakePlc} onNavigate={vi.fn()} />);
    advance();
    expect(addToast).toHaveBeenCalledWith(
      expect.stringMatching(/pick at least one/i),
      'info'
    );
    // Still on Pick.
    expect(
      screen.getByText(/what are we looking at today/i)
    ).toBeInTheDocument();
  });

  it('runs Pick → Review → Decide → Act → Save and calls saveMeeting with the working state, spawning a to-do', async () => {
    const onNavigate = vi.fn();
    render(<PlcMeetingMode plc={fakePlc} onNavigate={onNavigate} />);

    // --- Pick: select the assessment, then advance (materializes the doc) ---
    fireEvent.click(screen.getByRole('button', { name: /Unit 4 CFA/ }));
    advance();
    await waitFor(() => expect(createMeeting).toHaveBeenCalledTimes(1));

    // --- Review: aggregate renders, anonymized (no student names) ---
    expect(
      await screen.findByText(/what does the data say/i)
    ).toBeInTheDocument();
    const reviewCard = screen.getByTestId('meeting-review-card');
    expect(within(reviewCard).getByText('72%')).toBeInTheDocument();
    expect(within(reviewCard).getByText('Hard question')).toBeInTheDocument();
    expect(within(reviewCard).getByText('41%')).toBeInTheDocument();
    // Both teacher names appear; no per-student names exist in the aggregate.
    expect(within(reviewCard).getAllByText('Alice').length).toBeGreaterThan(0);
    expect(within(reviewCard).getAllByText('Bob').length).toBeGreaterThan(0);
    expect(reviewCard.textContent).not.toMatch(/student a|johnny|jane doe/i);

    advance();

    // --- Decide: capture a decision ---
    expect(await screen.findByText(/what did we decide/i)).toBeInTheDocument();
    const decisionInput = screen.getByLabelText(/add a decision/i);
    fireEvent.change(decisionInput, {
      target: { value: 'Reteach question 2 with the area model.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Add decision$/ }));
    expect(
      screen.getByText('Reteach question 2 with the area model.')
    ).toBeInTheDocument();

    advance();

    // --- Act: capture an action item ---
    expect(await screen.findByText(/who.s doing what/i)).toBeInTheDocument();
    const actionInput = screen.getByLabelText(/add an action item/i);
    fireEvent.change(actionInput, {
      target: { value: 'Build a reteach warm-up' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Add action$/ }));
    expect(screen.getByText('Build a reteach warm-up')).toBeInTheDocument();

    advance();

    // --- Save: the summary step renders, then save ---
    expect(await screen.findByText(/ready to save/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Save meeting$/ }));

    await waitFor(() => expect(saveMeeting).toHaveBeenCalledTimes(1));
    const [meetingIdArg, inputArg] = saveMeeting.mock.calls[0];
    expect(meetingIdArg).toBe('meeting-1');
    expect(inputArg.assessmentIds).toEqual(['sync-1']);
    expect(inputArg.decisions).toHaveLength(1);
    expect(inputArg.decisions?.[0].text).toBe(
      'Reteach question 2 with the area model.'
    );
    expect(inputArg.actionItems).toHaveLength(1);
    expect(inputArg.actionItems?.[0].text).toBe('Build a reteach warm-up');

    // The provider spawned a to-do for the action item.
    expect(savedActionItems).toHaveLength(1);
    expect(savedActionItems[0].todoId).toBe('todo-0');

    // The success view renders.
    expect(await screen.findByText(/meeting saved/i)).toBeInTheDocument();
  });

  it('a Review "Discuss this" jumps to Decide pre-linked to the assessment', async () => {
    render(<PlcMeetingMode plc={fakePlc} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Unit 4 CFA/ }));
    advance();
    await waitFor(() => expect(createMeeting).toHaveBeenCalledTimes(1));

    const reviewCard = await screen.findByTestId('meeting-review-card');
    fireEvent.click(
      within(reviewCard).getByRole('button', { name: 'Discuss this' })
    );

    // Lands on Decide with a linked-data-card chip referencing the assessment.
    expect(await screen.findByText(/what did we decide/i)).toBeInTheDocument();
    expect(screen.getByText('Unit 4 CFA')).toBeInTheDocument();
  });
});
