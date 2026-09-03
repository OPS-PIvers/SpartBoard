import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityWallWidget } from './Widget';
import type { ActivityWallLibraryEntry, WidgetData } from '@/types';

const {
  mockAddWidget,
  mockAddToast,
  mockUpdateWidget,
  mockSetDoc,
  mockUpdateDoc,
  mockDeleteDoc,
  mockOnSnapshot,
  mockSaveActivity,
  mockDeleteActivity,
  mockGetCountFromServer,
  mockLibraryEntries,
} = vi.hoisted(() => ({
  mockAddWidget: vi.fn(),
  mockAddToast: vi.fn(),
  mockUpdateWidget: vi.fn(),
  mockSetDoc: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockDeleteDoc: vi.fn(),
  mockOnSnapshot: vi.fn(),
  mockSaveActivity: vi.fn(),
  mockDeleteActivity: vi.fn(),
  mockGetCountFromServer: vi.fn(),
  mockLibraryEntries: { current: [] as ActivityWallLibraryEntry[] },
}));

let snapshotDocs: Record<string, unknown>[] = [];

vi.mock('@/context/dashboardCanvasStore', () => ({
  useDashboardActions: () => ({
    addWidget: mockAddWidget,
    addToast: mockAddToast,
    updateWidget: mockUpdateWidget,
  }),
  useIsActiveBoardReadOnly: () => false,
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    addToast: mockAddToast,
    updateWidget: mockUpdateWidget,
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', email: 't@example.com' },
    featurePermissions: [],
    selectedBuildings: [],
    canAccessFeature: () => true,
  }),
}));

vi.mock('@/hooks/useActivityWallLibrary', () => ({
  useActivityWallLibrary: () => ({
    activities: mockLibraryEntries.current,
    loading: false,
    error: null,
    saveActivity: mockSaveActivity,
    deleteActivity: mockDeleteActivity,
  }),
}));

// The editor modal pulls in ClassLink + backgrounds; the widget only needs to
// know that it mounts, so stub it to a marker.
vi.mock('./editor/WallEditorModal', () => ({
  WallEditorModal: () => <div data-testid="wall-editor" />,
}));

// LayoutRouter lazily imports Leaflet for the map layout; a marker keeps this
// suite focused on the widget's own wiring.
vi.mock('@/components/activityWall/render', () => ({
  LayoutRouter: () => <div data-testid="layout-router" />,
}));

vi.mock('@/utils/googleOAuthRefresh', () => ({
  requestAndExchangeAuthCode: vi.fn().mockResolvedValue({ kind: 'cancelled' }),
}));

vi.mock('@/config/firebase', () => ({ db: {}, functions: {}, storage: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...args: unknown[]) => args.join('/')),
  doc: vi.fn((...args: unknown[]) => ({ __path: args.slice(1).join('/') })),
  onSnapshot: mockOnSnapshot,
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  deleteDoc: mockDeleteDoc,
  deleteField: vi.fn(() => '__delete__'),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  getCountFromServer: mockGetCountFromServer,
  query: vi.fn((ref: unknown) => ref),
  where: vi.fn(),
  writeBatch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn() })),
}));

const makeEntry = (
  overrides: Partial<ActivityWallLibraryEntry> = {}
): ActivityWallLibraryEntry => ({
  id: 'wall-1',
  title: 'Warm Up',
  prompt: 'Share one idea',
  mode: 'text',
  moderationEnabled: true,
  identificationMode: 'anonymous',
  createdAt: 1,
  updatedAt: 2,
  layout: 'wall',
  allowedTypes: { photo: false, link: false, file: false, video: false },
  appearance: { kind: 'gradient', value: 'bg-slate-900' },
  allowGuests: false,
  showNames: false,
  maxPostsPerStudent: 0,
  allowStudentEdit: false,
  allowStudentDelete: false,
  acceptingResponses: true,
  ...overrides,
});

const baseWidget: WidgetData = {
  id: 'widget-1',
  type: 'activity-wall',
  x: 0,
  y: 0,
  w: 4,
  h: 4,
  z: 1,
  flipped: false,
  config: { activeActivityId: 'wall-1' },
} as WidgetData;

beforeEach(() => {
  vi.clearAllMocks();
  snapshotDocs = [];
  mockLibraryEntries.current = [makeEntry()];
  mockSaveActivity.mockResolvedValue(undefined);
  mockDeleteActivity.mockResolvedValue(undefined);
  mockSetDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockResolvedValue(undefined);
  mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 3 }) });
  mockOnSnapshot.mockImplementation(
    (
      _ref: unknown,
      onNext: (value: {
        docs: { id: string; data: () => Record<string, unknown> }[];
      }) => void
    ) => {
      onNext({
        docs: snapshotDocs.map((entry) => ({
          id: entry.id as string,
          data: () => entry,
        })),
      });
      return vi.fn();
    }
  );
});

const renderWidget = () => render(<ActivityWallWidget widget={baseWidget} />);

describe('ActivityWallWidget', () => {
  it('mirrors the active wall onto the session doc', async () => {
    renderWidget();
    await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
    const call = mockSetDoc.mock.calls[0] as [
      { __path: string },
      Record<string, unknown>,
    ];
    const [ref, payload] = call;
    expect(ref.__path).toBe('activity_wall_sessions/teacher-1_wall-1');
    // Rules only enable the new gates once the session carries `layout`.
    expect(payload).toMatchObject({ layout: 'wall', acceptingResponses: true });
  });

  it('toggling Open/Closed writes both the library entry and the session doc', async () => {
    renderWidget();
    mockSetDoc.mockClear();

    await userEvent.click(await screen.findByRole('button', { name: 'Open' }));

    await waitFor(() =>
      expect(mockSaveActivity).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'wall-1', acceptingResponses: false })
      )
    );
    await waitFor(() =>
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          __path: 'activity_wall_sessions/teacher-1_wall-1',
        }),
        expect.objectContaining({ acceptingResponses: false }),
        { merge: true }
      )
    );
  });

  it('surfaces pending-only posts on the board and approves from the drawer', async () => {
    snapshotDocs = [
      {
        id: 'sub-1',
        content: 'Pending idea',
        submittedAt: 10,
        status: 'pending',
      },
    ];
    renderWidget();

    expect(
      await screen.findByText('1 post waiting for review')
    ).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole('button', { name: /moderate posts/i })
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /approve .*pending idea/i })
    );

    await waitFor(() =>
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          __path: 'activity_wall_sessions/teacher-1_wall-1/submissions/sub-1',
        }),
        { status: 'approved' }
      )
    );
  });

  it('duplicates a wall from the library with a new id and no posts', async () => {
    renderWidget();

    await userEvent.click(
      await screen.findByRole('button', { name: /open wall library/i })
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /more actions/i })
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /duplicate/i })
    );

    await waitFor(() => {
      const copy = mockSaveActivity.mock.calls
        .map((call) => call[0] as ActivityWallLibraryEntry)
        .find((entry) => entry.title.includes('(copy)'));
      expect(copy).toBeDefined();
      expect(copy?.id).not.toBe('wall-1');
    });
  });

  it('prompts to connect Drive when an upload needs consent', async () => {
    snapshotDocs = [
      {
        id: 'sub-2',
        content: 'photo',
        submittedAt: 10,
        status: 'approved',
        type: 'photo',
        archiveStatus: 'failed',
        archiveError: 'needs-consent',
      },
    ];
    renderWidget();

    expect(
      await screen.findByRole('button', { name: /connect google drive/i })
    ).toBeInTheDocument();
  });

  it('shows the empty state and opens the library when no wall is active', async () => {
    mockLibraryEntries.current = [];
    render(
      <ActivityWallWidget
        widget={{ ...baseWidget, config: { activeActivityId: null } }}
      />
    );

    await userEvent.click(
      await screen.findByRole('button', { name: /open library/i })
    );
    expect(await screen.findByText(/no walls yet/i)).toBeInTheDocument();
  });
});
