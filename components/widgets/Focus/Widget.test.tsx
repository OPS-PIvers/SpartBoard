import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassRoster, FocusConfig, WidgetData } from '@/types';
import type { FocusStudentDoc } from '@/utils/focus/contract';
import {
  SubShareContentContext,
  type SubShareContentValue,
} from '@/context/SubShareContentContextValue';
import type { FocusSessionRow } from './focusWidgetState';
import { FocusFixtureNamesContext } from './fixtureNames';
import { FocusWidget } from './Widget';

const h = vi.hoisted(() => ({
  updateWidget: vi.fn(),
  showConfirm: vi.fn(),
  rosters: [] as unknown[],
  sessions: [] as unknown[],
  students: [] as unknown[],
  openSessionId: null as string | null,
  api: {
    start: vi.fn(),
    extend: vi.fn(),
    release: vi.fn(),
    addSite: vi.fn(),
    end: vi.fn(),
    open: vi.fn(),
  },
}));

vi.mock('@/context/dashboardCanvasStore', () => ({
  useDashboardActions: () => ({ updateWidget: h.updateWidget }),
  useDashboardCanvasSelector: <T,>(
    pick: (s: { rosters: unknown[]; activeDashboard: null }) => T
  ) => pick({ rosters: h.rosters, activeDashboard: null }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 't1' },
    orgId: 'orono',
    savedWidgetPresets: {},
    saveWidgetPreset: vi.fn(),
  }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: h.showConfirm, showPrompt: vi.fn() }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({ byStudentUid: new Map() }),
  formatStudentName: () => '',
}));
vi.mock('./useFocusData', async (importOriginal) => {
  const real = await importOriginal<typeof import('./useFocusData')>();
  return {
    ...real,
    focusApi: h.api,
    useFocusClassSessions: () => ({
      rows: h.sessions,
      loading: false,
      error: false,
    }),
    useFocusSession: () => ({ rows: h.sessions, loading: false, error: false }),
    useFocusStudents: () => ({
      rows: h.students,
      loading: false,
      error: false,
    }),
    useFocusOpen: () => ({
      sessionId: h.openSessionId,
      checking: false,
      recheck: vi.fn(),
    }),
  };
});

const NOW = Date.now();
const ROSTER = {
  id: 'r1',
  name: 'Period 3',
  driveFileId: null,
  studentCount: 2,
  createdAt: 0,
  students: [],
  classlinkClassId: 'c1',
} as ClassRoster;

const SESSION: FocusSessionRow = {
  id: 's1',
  orgId: 'orono',
  classId: 'c1',
  className: 'Period 3',
  teacherUid: 't1',
  teacherName: 'T',
  teacherUids: ['t1'],
  level: 'redirect',
  sites: [{ host: 'desmos.com', path: '' }],
  studentUids: ['u1', 'u2'],
  startedAt: NOW - 60_000,
  endsAt: NOW + 20 * 60_000,
  endedAt: null,
  endReason: null,
};

const student = (patch: Partial<FocusStudentDoc>): FocusStudentDoc => ({
  status: 'on-task',
  awaySince: null,
  awayMs: 0,
  blockedTries: 0,
  lastReportAt: NOW - 5_000,
  protocol: 9,
  liveHost: null,
  otherSessionEndsAt: null,
  ...patch,
});

const widget = (config: FocusConfig = {}): WidgetData =>
  ({
    id: 'w1',
    type: 'focus',
    x: 0,
    y: 0,
    w: 460,
    h: 560,
    z: 1,
    flipped: false,
    config: { rosterId: 'r1', ...config },
  }) as WidgetData;

const NAMES = { u1: 'Ada Lovelace', u2: 'Grace Hopper' };
const renderTeacher = (config?: FocusConfig) =>
  render(
    <FocusFixtureNamesContext.Provider value={NAMES}>
      <FocusWidget widget={widget(config)} />
    </FocusFixtureNamesContext.Provider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.rosters = [ROSTER];
  h.sessions = [];
  h.students = [];
  h.openSessionId = null;
  h.showConfirm.mockResolvedValue(true);
  for (const fn of Object.values(h.api)) fn.mockResolvedValue({});
});

describe('FocusWidget teacher view', () => {
  it('sends a teacher without ClassLink classes to Classes', async () => {
    h.rosters = [{ ...ROSTER, classlinkClassId: undefined }];
    const spy = vi.spyOn(window, 'dispatchEvent');
    renderTeacher();
    await userEvent.click(screen.getByRole('button', { name: 'Open Classes' }));
    const event = spy.mock.calls
      .map(([e]) => e)
      .find((e) => e.type === 'open-sidebar');
    expect((event as CustomEvent).detail).toEqual({ section: 'classes' });
    spy.mockRestore();
  });

  it('waits for a site before Start', () => {
    renderTeacher({ sites: [] });
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    expect(
      screen.getByText('Add at least one site to start.')
    ).toBeInTheDocument();
  });

  it('starts a session for the picked class', async () => {
    renderTeacher({ sites: [{ host: 'desmos.com', path: '' }], minutes: 20 });
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(h.api.start).toHaveBeenCalledWith({
      classId: 'c1',
      className: 'Period 3',
      level: 'redirect',
      minutes: 20,
      sites: [{ host: 'desmos.com', path: '' }],
    });
  });

  it('lists away students first and releases one', async () => {
    h.sessions = [SESSION];
    h.students = [
      { uid: 'u1', doc: student({}) },
      { uid: 'u2', doc: student({ status: 'away', awaySince: NOW - 30_000 }) },
    ];
    renderTeacher();
    expect(
      screen.getByText('1 on task · 1 away · 0 not connected')
    ).toBeInTheDocument();
    const releases = screen.getAllByRole('button', {
      name: /^Release (Ada|Grace)/,
    });
    expect(releases.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Release Grace Hopper',
      'Release Ada Lovelace',
    ]);
    await userEvent.click(releases[1]);
    expect(h.api.release).toHaveBeenCalledWith({
      sessionId: 's1',
      studentUid: 'u1',
    });
    expect(h.showConfirm).not.toHaveBeenCalled();
  });

  it('keeps one roster tab stop and moves with the arrow keys', async () => {
    h.sessions = [SESSION];
    h.students = [
      { uid: 'u1', doc: student({}) },
      { uid: 'u2', doc: student({}) },
    ];
    renderTeacher();
    const [first, second] = screen.getAllByRole('button', {
      name: /^Release (Ada|Grace)/,
    });
    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('tabindex', '-1');
    first.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
  });

  it('asks before ending and does nothing on cancel', async () => {
    h.sessions = [SESSION];
    h.showConfirm.mockResolvedValue(false);
    renderTeacher();
    await userEvent.click(screen.getByRole('button', { name: 'End' }));
    expect(h.showConfirm).toHaveBeenCalled();
    expect(h.api.end).not.toHaveBeenCalled();
  });

  it('shows the server reason when an action fails', async () => {
    h.sessions = [SESSION];
    h.api.extend.mockRejectedValue(
      Object.assign(new Error('That session already ended.'), {
        code: 'functions/failed-precondition',
      })
    );
    renderTeacher();
    await userEvent.click(screen.getByRole('button', { name: '+10 min' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That session already ended.'
    );
  });

  it('hides names when the setting is on', () => {
    h.sessions = [SESSION];
    h.students = [{ uid: 'u1', doc: student({}) }];
    renderTeacher({ hideNames: true });
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
    expect(screen.getByText(/Student names are hidden/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Release class' })).toBeEnabled();
  });
});

describe('FocusWidget sub view', () => {
  const share = { shareId: 'sh1' } as SubShareContentValue;
  const renderSub = () =>
    render(
      <SubShareContentContext.Provider value={share}>
        <FocusWidget
          widget={widget({ classId: 'c1', className: 'Period 3' })}
        />
      </SubShareContentContext.Provider>
    );

  it('says when no session is running', () => {
    renderSub();
    expect(screen.getByText('No focus session running')).toBeInTheDocument();
  });

  it('shows counts without names and ends with the share id', async () => {
    h.openSessionId = 's1';
    h.sessions = [SESSION];
    h.students = [{ uid: 'u1', doc: student({}) }];
    renderSub();
    expect(
      screen.queryByRole('button', { name: '+10 min' })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Student names show only/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'End' }));
    expect(h.api.end).toHaveBeenCalledWith({ sessionId: 's1', shareId: 'sh1' });
  });
});
