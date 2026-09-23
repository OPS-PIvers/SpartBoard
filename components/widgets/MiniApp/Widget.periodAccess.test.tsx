// Per-period Mini-app assigns: with the flag on and more than one class checked, the session
// gets one period per class and no shared window; one class or the flag off stays legacy.
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiniAppWidget } from './Widget';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useSavedWidgets } from '@/context/useSavedWidgets';
import { useMiniAppSessionTeacher } from '@/hooks/useMiniAppSession';
import { useMiniAppAssignments } from '@/hooks/useMiniAppAssignments';
import { useFolders } from '@/hooks/useFolders';
import { useMiniAppSync } from './hooks/useMiniAppSync';
import type { ClassRoster, MiniAppItem, WidgetData } from '@/types';

const periodCtx: { current: unknown } = { current: undefined };
vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));
vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/context/useSavedWidgets', () => ({ useSavedWidgets: vi.fn() }));
vi.mock('@/hooks/useMiniAppSession', () => ({
  useMiniAppSessionTeacher: vi.fn(),
}));
vi.mock('@/hooks/useMiniAppAssignments', () => ({
  useMiniAppAssignments: vi.fn(),
}));
vi.mock('@/hooks/useFolders', () => ({ useFolders: vi.fn() }));
vi.mock('./hooks/useMiniAppSync', () => ({ useMiniAppSync: vi.fn() }));
vi.mock('@/hooks/useTeacherBellPeriods', () => ({
  useAssignPeriodAccess: () => periodCtx.current,
}));

const activeApp: MiniAppItem = {
  id: 'app-1',
  title: 'Fractions Practice',
  html: '<html>app</html>',
  createdAt: 1,
};
const roster = (id: string, name: string, classlinkClassId: string) =>
  ({
    id,
    name,
    driveFileId: null,
    studentCount: 0,
    createdAt: 1,
    classlinkClassId,
    students: [],
  }) as unknown as ClassRoster;
const ROSTERS = [
  roster('r1', 'Period 1', 'cl-1'),
  roster('r3', 'Period 3', 'cl-3'),
];

const createSession = vi.fn();
const createAssignment = vi.fn();

function setup(rosterIds: string[]) {
  vi.mocked(useDashboard).mockReturnValue({
    updateWidget: vi.fn(),
    addToast: vi.fn(),
    rosters: ROSTERS,
    updateRoster: vi.fn(),
    addWidget: vi.fn(),
    selectedWidgetId: 'widget-1',
    isActiveBoardReadOnly: false,
  } as unknown as ReturnType<typeof useDashboard>);
  vi.mocked(useAuth).mockReturnValue({
    user: { uid: 'teacher-1' },
    getAssignmentMode: () => 'submissions',
  } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(useSavedWidgets).mockReturnValue({
    saveSavedWidget: vi.fn(),
  } as unknown as ReturnType<typeof useSavedWidgets>);
  vi.mocked(useMiniAppSessionTeacher).mockReturnValue({
    createSession,
    sessions: [],
    sessionsLoading: false,
    subscribeToAppSessions: vi.fn(),
    unsubscribeFromAppSessions: vi.fn(),
    renameSession: vi.fn(),
    endSession: vi.fn(),
  } as unknown as ReturnType<typeof useMiniAppSessionTeacher>);
  vi.mocked(useMiniAppAssignments).mockReturnValue({
    assignments: [],
    loading: false,
    error: null,
    createAssignment,
  } as unknown as ReturnType<typeof useMiniAppAssignments>);
  vi.mocked(useFolders).mockReturnValue({
    folders: [],
    moveItem: vi.fn(),
  } as unknown as ReturnType<typeof useFolders>);
  vi.mocked(useMiniAppSync).mockReturnValue({
    library: [],
    globalLibrary: [],
  } as unknown as ReturnType<typeof useMiniAppSync>);
  const widget = {
    id: 'widget-1',
    type: 'miniApp',
    config: { activeApp, lastRosterIdsByAppId: { 'app-1': rosterIds } },
  } as unknown as WidgetData;
  render(
    <div data-widget-id="widget-1">
      <MiniAppWidget widget={widget} />
    </div>
  );
  fireEvent.click(screen.getByTitle('Assign (copy student link)'));
  fireEvent.click(
    screen.getByRole('button', { name: /create assignment link/i })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  periodCtx.current = undefined;
  createSession.mockResolvedValue('session-1');
  createAssignment.mockResolvedValue('assignment-1');
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn(() => Promise.resolve()) },
  });
});

const ctx = () => ({
  bellOptions: [],
  bellWindow: () => null,
  onTagRoster: vi.fn(),
});

describe('MiniAppWidget assign — per-period access', () => {
  it('gives each checked class its own period and mirrors it on the assignment', async () => {
    periodCtx.current = ctx();
    setup(['r1', 'r3']);
    await waitFor(() => expect(createSession).toHaveBeenCalledOnce());
    const options = createSession.mock.calls[0][3] as {
      openAt: number | null;
      assignmentId: string;
      periodGate: {
        accessMode: string;
        periodAccess: Record<string, { label: string }>;
      };
    };
    expect(options.periodGate.accessMode).toBe('assignment');
    expect(Object.keys(options.periodGate.periodAccess).sort()).toEqual([
      'cl-1',
      'cl-3',
    ]);
    expect(options.openAt).toBeNull();
    await waitFor(() => expect(createAssignment).toHaveBeenCalledOnce());
    const input = createAssignment.mock.calls[0][0] as Record<string, unknown>;
    expect(input.periodGate).toEqual(options.periodGate);
    expect(input.id).toBe(options.assignmentId);
  });

  it('keeps a single class on the legacy session', async () => {
    periodCtx.current = ctx();
    setup(['r1']);
    await waitFor(() => expect(createSession).toHaveBeenCalledOnce());
    expect(createSession.mock.calls[0][3]).not.toHaveProperty('periodGate');
  });

  it('keeps several classes on the legacy session while the flag is off', async () => {
    setup(['r1', 'r3']);
    await waitFor(() => expect(createSession).toHaveBeenCalledOnce());
    expect(createSession.mock.calls[0][3]).not.toHaveProperty('periodGate');
    expect(createAssignment.mock.calls[0][0]).not.toHaveProperty('periodGate');
  });
});
