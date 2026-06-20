/**
 * Integration tests for PlcMeetingMode (Wave 3 — the hero surface, PRD §6.2).
 *
 * Meeting Mode reads the anonymized aggregate spine (the same selectors Shared
 * Data uses) and drives the guided Pick → Review → Decide → Act → Save flow. A
 * saved record (the `/plc/:id/meeting/:meetingId` route) renders read-only.
 *
 * The provider selectors + meeting/contribution hooks are mocked so the
 * component renders without Firebase. We assert:
 *   - the live flow opens on Pick with the step rail,
 *   - picking + advancing surfaces the Review card with large-type aggregate
 *     data (team avg, weakest questions) and NO student names,
 *   - the Review data card is commentable (thread keyed to assessment:<id>),
 *   - advancing to Save fires `createMeeting`, and Save fires `saveMeeting`,
 *   - a saved record id renders the read-only record view (no step rail).
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type {
  Plc,
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  PlcContribution,
  PlcMeeting,
  PlcMember,
} from '@/types';

// --- i18n: render the defaultValue with {{interp}} substituted -------------
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
    i18n: { language: 'en' },
  }),
}));

let mockUserUid: string | null = 'uid-alice';
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: mockUserUid ? { uid: mockUserUid } : null,
    googleAccessToken: 'tok',
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

const createMeeting = vi.fn(() => Promise.resolve('meeting-1'));
const updateMeeting = vi.fn(() => Promise.resolve());
const saveMeeting = vi.fn(() => Promise.resolve(['todo-1']));
const designateAssessment = vi.fn(() => Promise.resolve('assessment-1'));

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
let mockWhoIsHere: { uid: string; displayName: string }[] = [];

vi.mock('@/context/usePlcContext', () => ({
  usePlcAggregatesData: () => mockAggregatesSlice,
  usePlcAssessmentsData: () => mockAssessmentsSlice,
  usePlcMembers: () => mockMembers,
  usePlcWhoIsHere: () => mockWhoIsHere,
  usePlcActions: () => ({
    createMeeting,
    updateMeeting,
    saveMeeting,
    designateAssessment,
  }),
}));

let mockMeetings: PlcMeeting[] = [];
vi.mock('@/hooks/usePlcMeetings', () => ({
  usePlcMeetings: () => {
    const meetingsById: Record<string, PlcMeeting> = {};
    for (const m of mockMeetings) meetingsById[m.id] = m;
    return {
      meetings: mockMeetings,
      meetingsById,
      loading: false,
      error: null,
    };
  },
}));

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

const { spaNavigateSpy } = vi.hoisted(() => ({ spaNavigateSpy: vi.fn() }));
vi.mock('@/utils/plcPath', async (importActual) => {
  const actual = await importActual<typeof import('@/utils/plcPath')>();
  return { ...actual, spaNavigate: spaNavigateSpy };
});

import { PlcMeetingMode } from '@/components/plc/meeting/PlcMeetingMode';

// --- Fixtures --------------------------------------------------------------

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

function setDefaults(): void {
  mockUserUid = 'uid-alice';
  mockMembers = members;
  mockWhoIsHere = [{ uid: 'uid-alice', displayName: 'Alice' }];
  mockOwnContributions = [];
  mockMeetings = [];
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

const noop = (): void => undefined;

/** Click the Pick-step toggle for the first assessment card (via its meta line). */
function pickFirstAssessment(): void {
  const button = screen.getByText(/team avg ·/i).closest('button');
  if (!button) throw new Error('Pick-step assessment toggle not found');
  fireEvent.click(button);
}

// --- Tests -----------------------------------------------------------------

describe('PlcMeetingMode — live guided flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaults();
  });

  it('opens on the Pick step with the step rail', () => {
    render(<PlcMeetingMode plc={fakePlc} meetingId={null} onNavigate={noop} />);
    expect(
      screen.getByRole('navigation', { name: 'Meeting steps' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('What are we looking at today?')
    ).toBeInTheDocument();
  });

  it('blocks advancing past Pick with nothing selected', async () => {
    render(<PlcMeetingMode plc={fakePlc} meetingId={null} onNavigate={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        'Pick at least one assessment to review.',
        'info'
      )
    );
    expect(createMeeting).not.toHaveBeenCalled();
  });

  it('picks an assessment, advances to Review, and renders large-type pooled data with no student names', async () => {
    const { container } = render(
      <PlcMeetingMode plc={fakePlc} meetingId={null} onNavigate={noop} />
    );
    // Select the only assessment card via its meta line (inside the toggle).
    pickFirstAssessment();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(createMeeting).toHaveBeenCalledTimes(1));
    // Review card present with the hero team average + weakest question.
    expect(
      await screen.findByTestId('meeting-review-card')
    ).toBeInTheDocument();
    expect(screen.getAllByText('72%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Hard question').length).toBeGreaterThan(0);
    // Anonymized — no student-level identifiers leak into the DOM.
    expect(container.textContent).not.toMatch(/student name/i);
  });

  it('keeps the Review data card commentable (thread keyed to assessment:<id>)', async () => {
    render(<PlcMeetingMode plc={fakePlc} meetingId={null} onNavigate={noop} />);
    pickFirstAssessment();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const thread = await screen.findByTestId('comments-thread');
    expect(thread).toHaveAttribute('data-target-id', 'assessment:sync-1');
  });

  it('saves the meeting via saveMeeting on the Save step', async () => {
    render(<PlcMeetingMode plc={fakePlc} meetingId={null} onNavigate={noop} />);
    // Pick → Review → Decide → Act → Save. Each transition is async (Pick awaits
    // createMeeting); await the next step's content before clicking Next again.
    pickFirstAssessment();
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // → review
    await screen.findByTestId('meeting-review-card');
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // → decide
    await screen.findByText('What did we decide?');
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // → act
    await screen.findByText('Who’s doing what?');
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // → save
    expect(await screen.findByText('Ready to save?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save meeting' }));
    await waitFor(() => expect(saveMeeting).toHaveBeenCalledTimes(1));
    expect(saveMeeting).toHaveBeenCalledWith(
      'meeting-1',
      expect.objectContaining({ assessmentIds: ['sync-1'] })
    );
  });

  it('shows an empty state when there is no assessment data', () => {
    mockAggregatesSlice = {
      data: [],
      loading: false,
      error: null,
      enabled: true,
    };
    render(<PlcMeetingMode plc={fakePlc} meetingId={null} onNavigate={noop} />);
    expect(screen.getByText('No assessment data yet')).toBeInTheDocument();
  });
});

describe('PlcMeetingMode — saved record (read-only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaults();
  });

  it('renders a saved record read-only with no step rail and an export control', () => {
    mockMeetings = [
      {
        id: 'meeting-1',
        heldAt: 9_000_000,
        facilitatorUid: 'uid-alice',
        attendeeUids: ['uid-alice', 'uid-bob'],
        assessmentIds: ['sync-1'],
        decisions: [{ id: 'd1', text: 'Reteach question 2' }],
        actionItems: [
          {
            id: 'a1',
            text: 'Build a warm-up',
            assigneeUid: 'uid-bob',
            todoId: 't1',
          },
        ],
        status: 'completed',
        createdBy: 'uid-alice',
        updatedAt: 9_000_000,
      },
    ];
    render(
      <PlcMeetingMode plc={fakePlc} meetingId="meeting-1" onNavigate={noop} />
    );
    expect(screen.getByText('Meeting record')).toBeInTheDocument();
    expect(screen.getByText('Reteach question 2')).toBeInTheDocument();
    expect(screen.getByText('Build a warm-up')).toBeInTheDocument();
    // The guided step rail is NOT present in the read-only record view.
    expect(
      screen.queryByRole('navigation', { name: 'Meeting steps' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Export to Sheets' })
    ).toBeInTheDocument();
  });

  it('shows a not-found state for a missing meeting id and links back to live mode', () => {
    mockMeetings = [];
    render(
      <PlcMeetingMode plc={fakePlc} meetingId="missing" onNavigate={noop} />
    );
    expect(screen.getByText('Meeting record not found')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to Meeting Mode' })
    );
    expect(spaNavigateSpy).toHaveBeenCalledWith('/plc/plc-1/meeting');
  });
});
