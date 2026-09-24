// PlcHomeV2 — the four starter tiles, the header cluster, and hero resolution.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { PlcHomeV2 } from '@/components/plc/home/PlcHomeV2';
import type {
  Plc,
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  PlcMeeting,
} from '@/types';
import { zonedTimeToEpoch } from '@/utils/plcHomeTime';
import {
  EMPTY_PLC_HOME_LAYOUT,
  type PlcHomeLayout,
} from '@/components/plc/home/tiles/homeLayout';

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
  useAuth: () => ({ user: { uid: 'uid-a' } }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));

let mockMeetings: PlcMeeting[] = [];
let mockLayout: PlcHomeLayout = EMPTY_PLC_HOME_LAYOUT;
let mockAggregates: PlcAssessmentAggregate[] = [];
let mockAssessments: PlcCommonAssessment[] = [];
const saveHomeLayout = vi.fn(() => Promise.resolve());
const saveHomeSeenCounts = vi.fn(() => Promise.resolve());
vi.mock('@/utils/plcHomeLayoutWrites', () => ({
  saveHomeLayout: (...args: unknown[]) => saveHomeLayout(...(args as [])),
  saveHomeSeenCounts: (...args: unknown[]) =>
    saveHomeSeenCounts(...(args as [])),
}));
const slice = <T,>(data: T) => ({
  data,
  loading: false,
  error: null,
  enabled: true,
});
vi.mock('@/context/usePlcContext', () => ({
  usePlcActivity: () => [],
  usePlcMeetingsData: () => slice(mockMeetings),
  usePlcAggregatesData: () => slice(mockAggregates),
  usePlcAssessmentsData: () => slice(mockAssessments),
  usePlcHomeLayout: () => slice(mockLayout),
  usePlcNotesData: () => slice([]),
  usePlcDocsData: () => slice([]),
  usePlcMembers: () => [
    {
      uid: 'uid-a',
      email: 'ana@school.org',
      displayName: 'Ana Lee',
      role: 'lead',
      status: 'active',
    },
    {
      uid: 'uid-b',
      email: 'bo@school.org',
      displayName: 'Bo Kim',
      role: 'member',
      status: 'active',
    },
  ],
  usePlcWhoIsHere: () => [
    { uid: 'uid-b', displayName: 'Bo Kim', section: 'assessments' },
  ],
  usePlcActions: () => ({ updateNote: vi.fn() }),
}));

const updatePlcMeetingCadence = vi.fn((_plcId: string, _cadence: unknown) =>
  Promise.resolve()
);
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({ updatePlcMeetingCadence }),
}));

vi.mock('@/hooks/usePlcUnread', () => ({
  usePlcUnread: () => ({
    lastSeenAt: null,
    unreadCount: 0,
    loading: false,
    markSeen: vi.fn(() => Promise.resolve()),
  }),
}));
vi.mock('@/hooks/usePlcAssignmentIndex', () => ({
  usePlcAssignmentIndex: () => ({ entries: [], loading: false, error: null }),
}));
vi.mock('@/hooks/useLearningTargets', () => ({
  usePlcLearningTargets: () => ({ list: null, loading: false, error: null }),
}));

const plc = {
  id: 'plc-1',
  name: 'Grade 7 Math',
  members: {},
  leadUid: 'uid-a',
  memberUids: ['uid-a', 'uid-b'],
  memberEmails: {},
  createdAt: 0,
  updatedAt: 0,
} as unknown as Plc;

function meeting(status: PlcMeeting['status']): PlcMeeting {
  return {
    id: `m-${status}`,
    heldAt: 1000,
    facilitatorUid: 'uid-a',
    attendeeUids: [],
    assessmentIds: [],
    decisions: [{ id: 'd1', text: 'Reteach fractions' }],
    actionItems: [],
    status,
    createdBy: 'uid-a',
    updatedAt: 1000,
  };
}

describe('PlcHomeV2', () => {
  beforeEach(() => {
    mockMeetings = [];
    mockLayout = EMPTY_PLC_HOME_LAYOUT;
    mockAggregates = [];
    mockAssessments = [];
    saveHomeLayout.mockClear();
    saveHomeSeenCounts.mockClear();
  });

  it('renders the header and the four starter tiles with no hero', () => {
    render(<PlcHomeV2 plc={plc} onNavigate={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Grade 7 Math' })).toBeTruthy();
    for (const name of [
      'Results',
      'Meeting',
      'Action items and activity',
      'Docs and notes',
    ]) {
      expect(screen.getByRole('region', { name })).toBeTruthy();
    }
    expect(document.querySelector('[data-hero="true"]')).toBeNull();
    expect(screen.queryByText('Your collaborative space')).toBeNull();
  });

  it('marks online members in the avatar cluster and opens Members', () => {
    const onNavigate = vi.fn();
    render(<PlcHomeV2 plc={plc} onNavigate={onNavigate} />);
    expect(screen.getByTitle('Bo Kim, online in Assessments')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: '2 members, 1 online. Open Members' })
    );
    expect(onNavigate).toHaveBeenCalledWith('members');
  });

  it('makes the Meeting tile the hero while a meeting is in progress', () => {
    mockMeetings = [meeting('in-progress')];
    render(<PlcHomeV2 plc={plc} onNavigate={vi.fn()} />);
    const hero = document.querySelector('[data-hero="true"]');
    expect(hero?.getAttribute('aria-label')).toBe('Meeting');
    expect(screen.getByText('Meeting in progress')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Resume Meeting/ })).toBeTruthy();
  });

  it('deep-links from a tile into its section', () => {
    const onNavigate = vi.fn();
    render(<PlcHomeV2 plc={plc} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Assessments' }));
    expect(onNavigate).toHaveBeenCalledWith('assessments');
  });

  it('persists a spotlight and renders the saved spotlight as the hero', () => {
    const { unmount } = render(<PlcHomeV2 plc={plc} onNavigate={vi.fn()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Spotlight Docs and notes' })
    );
    expect(saveHomeLayout).toHaveBeenCalledWith(
      'uid-a',
      'plc-1',
      expect.objectContaining({ heroTileId: 'starter-docs' })
    );
    unmount();

    mockLayout = {
      exists: true,
      tiles: [
        { id: 't1', kind: 'results' },
        { id: 't2', kind: 'docs' },
      ],
      heroTileId: 't2',
      seenCounts: {},
    };
    render(<PlcHomeV2 plc={plc} onNavigate={vi.fn()} />);
    const hero = document.querySelector('[data-hero="true"]');
    expect(hero?.getAttribute('aria-label')).toBe('Docs and notes');
    expect(screen.queryByRole('region', { name: 'Meeting' })).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Unspotlight Docs and notes' })
    );
    expect(saveHomeLayout).toHaveBeenLastCalledWith(
      'uid-a',
      'plc-1',
      expect.objectContaining({ heroTileId: null })
    );
  });

  it('removes a tile in Customize and saves the new order on Done', () => {
    render(<PlcHomeV2 plc={plc} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Meeting' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(saveHomeLayout).toHaveBeenCalledWith('uid-a', 'plc-1', {
      tiles: [
        { id: 'starter-results', kind: 'results' },
        { id: 'starter-actionsActivity', kind: 'actionsActivity' },
        { id: 'starter-docs', kind: 'docs' },
      ],
      heroTileId: null,
    });
  });

  it('offers removed tiles back from Add tile', () => {
    mockLayout = { ...EMPTY_PLC_HOME_LAYOUT, exists: true, tiles: [] };
    render(<PlcHomeV2 plc={plc} onNavigate={vi.fn()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Customize to add tiles' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add tile' }));
    fireEvent.click(screen.getByRole('button', { name: /^Meeting/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(saveHomeLayout).toHaveBeenCalledWith(
      'uid-a',
      'plc-1',
      expect.objectContaining({
        tiles: [expect.objectContaining({ kind: 'meeting' })],
      })
    );
  });

  it('offers per-teacher averages only when the PLC shows per-teacher results', () => {
    mockLayout = { ...EMPTY_PLC_HOME_LAYOUT, exists: true, tiles: [] };
    const { unmount } = render(<PlcHomeV2 plc={plc} onNavigate={vi.fn()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Customize to add tiles' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add tile' }));
    expect(
      screen.getByRole('button', { name: /^Participation/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Per-teacher averages/ })
    ).toBeNull();
    unmount();

    const shown = {
      ...plc,
      features: { showPerTeacher: true },
    } as unknown as Plc;
    render(<PlcHomeV2 plc={shown} onNavigate={vi.fn()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Customize to add tiles' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add tile' }));
    expect(
      screen.getByRole('button', { name: /^Per-teacher averages/ })
    ).toBeInTheDocument();
  });

  it('keeps a hidden per-teacher tile saved and saves its chosen assessment', () => {
    mockLayout = {
      ...EMPTY_PLC_HOME_LAYOUT,
      exists: true,
      tiles: [
        { id: 't1', kind: 'participation' },
        { id: 't2', kind: 'perTeacher' },
      ],
    };
    const { unmount } = render(<PlcHomeV2 plc={plc} onNavigate={vi.fn()} />);
    expect(
      screen.queryByRole('region', { name: 'Per-teacher averages' })
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(saveHomeLayout).toHaveBeenLastCalledWith(
      'uid-a',
      'plc-1',
      expect.objectContaining({
        tiles: [
          { id: 't1', kind: 'participation' },
          { id: 't2', kind: 'perTeacher' },
        ],
      })
    );
    unmount();

    mockAssessments = [
      {
        id: 'as-1',
        title: 'Unit 1',
        kind: 'quiz',
        syncGroupId: 'g1',
        opensAt: Date.now(),
        status: 'active',
        createdBy: 'uid-a',
        createdAt: 0,
        updatedAt: 0,
      },
    ];
    mockAggregates = [
      {
        assessmentId: 'as-1',
        schemaVersion: 3,
        teacherCount: 1,
        studentCount: 20,
        teamAveragePercent: 70,
        perQuestion: [],
        perTeacher: [
          {
            teacherUid: 'uid-b',
            teacherName: 'Bo Kim',
            classCount: 1,
            averagePercent: 70,
            studentCount: 20,
          },
        ],
        ranAt: 1,
      },
    ];
    const shown = {
      ...plc,
      features: { showPerTeacher: true },
    } as unknown as Plc;
    render(<PlcHomeV2 plc={shown} onNavigate={vi.fn()} />);
    expect(screen.getByText('Bo Kim')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose assessment' }));
    fireEvent.click(screen.getByRole('option', { name: 'Unit 1' }));
    expect(saveHomeLayout).toHaveBeenLastCalledWith(
      'uid-a',
      'plc-1',
      expect.objectContaining({
        tiles: [
          { id: 't1', kind: 'participation' },
          { id: 't2', kind: 'perTeacher', options: { assessmentId: 'as-1' } },
        ],
      })
    );
  });

  it('spotlights Results when scored counts rose since the last visit, and records them', () => {
    mockAssessments = [
      {
        id: 'a1',
        title: 'Unit 1 CFA',
        kind: 'quiz',
        syncGroupId: 'g1',
        status: 'active',
        createdBy: 'uid-a',
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    mockAggregates = [
      {
        assessmentId: 'a1',
        schemaVersion: 3,
        teacherCount: 1,
        studentCount: 30,
        scoredStudentCount: 30,
        teamAveragePercent: 70,
        perQuestion: [],
        perTeacher: [],
        ranAt: 1,
      },
    ];
    mockLayout = {
      exists: true,
      tiles: null,
      heroTileId: null,
      seenCounts: { a1: 12 },
    };
    render(<PlcHomeV2 plc={plc} onNavigate={vi.fn()} />);
    const hero = document.querySelector('[data-hero="true"]');
    expect(hero?.getAttribute('aria-label')).toBe('Results');
    expect(saveHomeSeenCounts).toHaveBeenCalledWith(
      'uid-a',
      'plc-1',
      { a1: 30 },
      null
    );
  });
});

describe('PlcHomeV2 meeting cadence', () => {
  const cadencePlc = {
    ...plc,
    meetingCadence: {
      frequency: 'weekly',
      weekday: 4,
      time: '15:15',
      anchorDate: '2026-09-03',
    },
  } as unknown as Plc;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(zonedTimeToEpoch(2026, 9, 24, 10));
    mockMeetings = [];
    mockLayout = EMPTY_PLC_HOME_LAYOUT;
    mockAggregates = [];
    mockAssessments = [];
    updatePlcMeetingCadence.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('makes Meeting the hero on meeting day and shows the next occurrence', () => {
    render(<PlcHomeV2 plc={cadencePlc} onNavigate={vi.fn()} />);
    const hero = document.querySelector('[data-hero="true"]');
    expect(hero?.getAttribute('aria-label')).toBe('Meeting');
    expect(screen.getByText(/Next: .*Sep 24.* · today/)).toBeInTheDocument();
  });

  it('drops the meeting-day hero once today has a completed meeting', () => {
    mockMeetings = [
      { ...meeting('completed'), heldAt: zonedTimeToEpoch(2026, 9, 24, 8) },
    ];
    render(<PlcHomeV2 plc={cadencePlc} onNavigate={vi.fn()} />);
    expect(document.querySelector('[data-hero="true"]')).toBeNull();
  });

  it('lets the lead skip just the next meeting', () => {
    render(<PlcHomeV2 plc={cadencePlc} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(updatePlcMeetingCadence).toHaveBeenCalledWith(
      'plc-1',
      expect.objectContaining({
        overrides: { '2026-09-24': { skipped: true } },
      })
    );
  });

  it('hides Move and Skip from members', () => {
    const memberView = { ...cadencePlc, leadUid: 'uid-b' } as Plc;
    render(<PlcHomeV2 plc={memberView} onNavigate={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
  });
});
