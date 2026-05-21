import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlcResourcesBody } from '@/components/plc/resources/PlcResourcesBody';
import type { Plc, PlcResource } from '@/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

const mockCreateDoc = vi.fn();

vi.mock('@/hooks/usePlcDocs', () => ({
  usePlcDocs: vi.fn(() => ({
    docs: [],
    loading: false,
    error: null,
    createDoc: mockCreateDoc,
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
  })),
}));

const mockUsePlcResources = vi.fn();
vi.mock('@/hooks/usePlcResources', () => ({
  usePlcResources: (...args: unknown[]): unknown =>
    mockUsePlcResources(...args),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: {
      uid: 'u1',
      displayName: 'Teacher One',
      email: 'u1@school.edu',
    },
  }),
}));

const mockAddToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: mockAddToast }),
}));

const mockWritePlcQuizEntry = vi.fn();
vi.mock('@/hooks/usePlcQuizzes', () => ({
  writePlcQuizEntry: (...args: unknown[]): unknown =>
    mockWritePlcQuizEntry(...args),
}));

const mockWritePlcVideoActivityEntry = vi.fn();
vi.mock('@/hooks/usePlcVideoActivities', () => ({
  writePlcVideoActivityEntry: (...args: unknown[]): unknown =>
    mockWritePlcVideoActivityEntry(...args),
}));

const mockPullSyncedQuizContent = vi.fn();
vi.mock('@/hooks/useSyncedQuizGroups', () => ({
  pullSyncedQuizContent: (...args: unknown[]): unknown =>
    mockPullSyncedQuizContent(...args),
}));

const mockPullSyncedVideoActivityContent = vi.fn();
vi.mock('@/hooks/useSyncedVideoActivityGroups', () => ({
  pullSyncedVideoActivityContent: (...args: unknown[]): unknown =>
    mockPullSyncedVideoActivityContent(...args),
}));

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

vi.mock('@/components/common/ScaledEmptyState', () => ({
  ScaledEmptyState: ({
    title,
    subtitle,
  }: {
    title: string;
    subtitle: string;
  }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      <span>{subtitle}</span>
    </div>
  ),
}));

const PLC: Plc = {
  id: 'plc-test',
  name: 'Test PLC',
  leadUid: 'u1',
  memberUids: ['u1'],
  memberEmails: { u1: 'u1@school.edu' },
  sharedSheetUrl: null,
  createdAt: 0,
  updatedAt: 0,
};

const makeResource = (overrides: Partial<PlcResource> = {}): PlcResource => ({
  id: 'res-1',
  kind: 'doc',
  title: 'Spring Planning Doc',
  description: 'Use for unit planning',
  refId: 'https://docs.google.com/d/spring',
  scope: 'all',
  plcIds: [],
  createdByAdminUid: 'admin-1',
  createdByAdminEmail: 'admin@school.edu',
  createdAt: 1000,
  updatedAt: 2000,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateDoc.mockResolvedValue('new-doc-id');
  mockWritePlcQuizEntry.mockResolvedValue(undefined);
  mockWritePlcVideoActivityEntry.mockResolvedValue(undefined);
  mockPullSyncedQuizContent.mockResolvedValue({
    title: 'Unit Quiz',
    questions: [{}, {}, {}],
    version: 1,
  });
  mockPullSyncedVideoActivityContent.mockResolvedValue({
    title: 'Lesson Video',
    youtubeUrl: 'https://youtu.be/abc',
    questions: [{}, {}],
    version: 1,
  });
});

describe('PlcResourcesBody', () => {
  it('shows empty state when there are no resources', () => {
    mockUsePlcResources.mockReturnValue({
      resources: [],
      loading: false,
      error: null,
    });
    render(<PlcResourcesBody plc={PLC} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('shows a loading indicator while loading', () => {
    mockUsePlcResources.mockReturnValue({
      resources: [],
      loading: true,
      error: null,
    });
    render(<PlcResourcesBody plc={PLC} />);
    expect(screen.getByText(/loading resources/i)).toBeInTheDocument();
  });

  it('shows an error message when loading fails', () => {
    mockUsePlcResources.mockReturnValue({
      resources: [],
      loading: false,
      error: new Error('permission denied'),
    });
    render(<PlcResourcesBody plc={PLC} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/failed to load/i);
  });

  it('renders resources grouped by kind', () => {
    mockUsePlcResources.mockReturnValue({
      resources: [
        makeResource({ id: 'r1', kind: 'doc', title: 'A Doc' }),
        makeResource({ id: 'r2', kind: 'quiz', title: 'A Quiz' }),
      ],
      loading: false,
      error: null,
    });
    render(<PlcResourcesBody plc={PLC} />);
    expect(screen.getByText('A Doc')).toBeInTheDocument();
    expect(screen.getByText('A Quiz')).toBeInTheDocument();
    // Both group headings present
    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.getByText('Quizzes')).toBeInTheDocument();
  });

  it('calls createDoc with title and url when Use is clicked on a doc resource', async () => {
    mockUsePlcResources.mockReturnValue({
      resources: [makeResource()],
      loading: false,
      error: null,
    });
    render(<PlcResourcesBody plc={PLC} />);

    const useButton = screen.getByRole('button', {
      name: /use spring planning doc/i,
    });
    fireEvent.click(useButton);

    await waitFor(() => {
      expect(mockCreateDoc).toHaveBeenCalledTimes(1);
    });
    expect(mockCreateDoc).toHaveBeenCalledWith({
      title: 'Spring Planning Doc',
      url: 'https://docs.google.com/d/spring',
    });
  });

  it('shows "Added" state after successful createDoc', async () => {
    mockUsePlcResources.mockReturnValue({
      resources: [makeResource()],
      loading: false,
      error: null,
    });
    render(<PlcResourcesBody plc={PLC} />);

    fireEvent.click(
      screen.getByRole('button', { name: /use spring planning doc/i })
    );

    await waitFor(() => {
      expect(screen.getByText('Added')).toBeInTheDocument();
    });
  });

  it('one-click imports a quiz into the PLC library (pull canonical → writePlcQuizEntry)', async () => {
    mockUsePlcResources.mockReturnValue({
      resources: [
        makeResource({
          id: 'q1',
          kind: 'quiz',
          title: 'Unit Quiz',
          refId: 'sync-group-1',
        }),
      ],
      loading: false,
      error: null,
    });
    render(<PlcResourcesBody plc={PLC} />);

    fireEvent.click(screen.getByRole('button', { name: /use unit quiz/i }));

    await waitFor(() => {
      expect(mockWritePlcQuizEntry).toHaveBeenCalledTimes(1);
    });
    expect(mockPullSyncedQuizContent).toHaveBeenCalledWith('sync-group-1');
    expect(mockWritePlcQuizEntry).toHaveBeenCalledWith(
      'plc-test',
      'u1',
      expect.objectContaining({
        syncGroupId: 'sync-group-1',
        title: 'Unit Quiz',
        questionCount: 3,
      })
    );
    expect(mockCreateDoc).not.toHaveBeenCalled();
  });

  it('one-click imports a video activity into the PLC library', async () => {
    mockUsePlcResources.mockReturnValue({
      resources: [
        makeResource({
          id: 'v1',
          kind: 'video-activity',
          title: 'Lesson Video',
          refId: 'va-group-1',
        }),
      ],
      loading: false,
      error: null,
    });
    render(<PlcResourcesBody plc={PLC} />);

    fireEvent.click(screen.getByRole('button', { name: /use lesson video/i }));

    await waitFor(() => {
      expect(mockWritePlcVideoActivityEntry).toHaveBeenCalledTimes(1);
    });
    expect(mockPullSyncedVideoActivityContent).toHaveBeenCalledWith(
      'va-group-1'
    );
    expect(mockWritePlcVideoActivityEntry).toHaveBeenCalledWith(
      'plc-test',
      'u1',
      expect.objectContaining({
        syncGroupId: 'va-group-1',
        title: 'Lesson Video',
        youtubeUrl: 'https://youtu.be/abc',
        questionCount: 2,
      })
    );
  });

  it('deep-links to the Assignments section for an assignment resource', () => {
    mockUsePlcResources.mockReturnValue({
      resources: [
        makeResource({ id: 'a1', kind: 'assignment', title: 'Unit Test' }),
      ],
      loading: false,
      error: null,
    });
    const onNavigate = vi.fn();
    render(<PlcResourcesBody plc={PLC} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: /open unit test/i }));

    expect(onNavigate).toHaveBeenCalledWith('assignments');
    expect(mockWritePlcQuizEntry).not.toHaveBeenCalled();
  });

  it('deep-links to the Shared Boards section for a board resource', () => {
    mockUsePlcResources.mockReturnValue({
      resources: [
        makeResource({ id: 'b1', kind: 'board', title: 'Morning Board' }),
      ],
      loading: false,
      error: null,
    });
    const onNavigate = vi.fn();
    render(<PlcResourcesBody plc={PLC} onNavigate={onNavigate} />);

    fireEvent.click(
      screen.getByRole('button', { name: /open morning board/i })
    );

    expect(onNavigate).toHaveBeenCalledWith('sharedBoards');
  });

  it('calls usePlcResources with the plcId', () => {
    mockUsePlcResources.mockReturnValue({
      resources: [],
      loading: false,
      error: null,
    });
    render(<PlcResourcesBody plc={PLC} />);
    expect(mockUsePlcResources).toHaveBeenCalledWith({ plcId: 'plc-test' });
  });
});
