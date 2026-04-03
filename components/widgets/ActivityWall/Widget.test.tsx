import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityWallWidget } from './Widget';
import { WidgetData } from '@/types';

type MockGoogleDriveHookResult = {
  isConnected: boolean;
};

const {
  mockAddWidget,
  mockAddToast,
  mockUpdateWidget,
  mockSetDoc,
  mockUpdateDoc,
  mockDeleteDoc,
  mockOnSnapshot,
  mockCollection,
  mockDoc,
  mockUser,
  mockUseGoogleDrive,
  mockRefreshGoogleToken,
  mockArchivePhotoCallable,
  mockHttpsCallable,
  mockGetDownloadURL,
  mockStorageRef,
} = vi.hoisted(() => ({
  mockAddWidget: vi.fn<
    (
      type: string,
      widget: {
        w: number;
        h: number;
        config: {
          url?: string;
          showUrl?: boolean;
        };
      }
    ) => void
  >(),
  mockAddToast: vi.fn(),
  mockUpdateWidget: vi.fn(),
  mockSetDoc: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockDeleteDoc: vi.fn(),
  mockOnSnapshot: vi.fn(),
  mockCollection: vi.fn(),
  mockDoc: vi.fn(),
  mockUser: { uid: 'teacher-1' },
  mockUseGoogleDrive: vi.fn<() => MockGoogleDriveHookResult>(),
  mockRefreshGoogleToken: vi.fn(),
  mockArchivePhotoCallable: vi.fn(),
  mockHttpsCallable: vi.fn(),
  mockGetDownloadURL: vi.fn(),
  mockStorageRef: vi.fn(),
}));

let snapshotDocs: Record<string, unknown>[] = [];

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    addWidget: mockAddWidget,
    addToast: mockAddToast,
    updateWidget: mockUpdateWidget,
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    googleAccessToken: 'google-access-token',
    refreshGoogleToken: mockRefreshGoogleToken,
  }),
}));

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => mockUseGoogleDrive(),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  functions: {},
  storage: {},
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: mockHttpsCallable,
}));

vi.mock('firebase/storage', () => ({
  getDownloadURL: mockGetDownloadURL,
  ref: mockStorageRef,
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  onSnapshot: mockOnSnapshot,
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  deleteDoc: mockDeleteDoc,
  deleteField: vi.fn(() => '__delete__'),
}));

describe('ActivityWallWidget', () => {
  const baseWidget: WidgetData = {
    id: 'widget-1',
    type: 'activity-wall',
    x: 0,
    y: 0,
    w: 4,
    h: 4,
    z: 1,
    flipped: false,
    config: {
      activeActivityId: 'activity-1',
      activities: [
        {
          id: 'activity-1',
          title: 'Warm Up',
          prompt: 'Share one idea',
          mode: 'text',
          moderationEnabled: true,
          identificationMode: 'anonymous',
          submissions: [],
          startedAt: Date.now(),
        },
      ],
    },
  } as WidgetData;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGoogleDrive.mockReturnValue({
      isConnected: false,
    });
    snapshotDocs = [];
    mockCollection.mockReturnValue('submissions-ref');
    mockDoc.mockReturnValue('session-doc');
    mockSetDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
    mockRefreshGoogleToken.mockResolvedValue('refreshed-google-access-token');
    mockStorageRef.mockImplementation((_storage, path: string) => ({
      fullPath: path,
    }));
    mockGetDownloadURL.mockResolvedValue(
      'https://firebase.example/teacher-preview.jpg'
    );
    mockArchivePhotoCallable.mockResolvedValue({
      data: {
        archiveStatus: 'archived',
        driveFileId: 'drive-file-1',
        driveUrl: 'https://lh3.googleusercontent.com/d/drive-file-1',
      },
    });
    mockHttpsCallable.mockReturnValue(mockArchivePhotoCallable);
    mockOnSnapshot.mockImplementation(
      (
        _ref,
        callback: (value: {
          docs: { data: () => Record<string, unknown> }[];
        }) => void
      ) => {
        callback({
          docs: snapshotDocs.map((entry) => ({
            data: () => entry,
          })),
        });
        return vi.fn();
      }
    );
  });

  it('keeps pending live submissions off the wall while showing the pending badge', async () => {
    snapshotDocs = [
      {
        id: 'submission-1',
        content: 'Hidden response',
        submittedAt: 123,
        status: 'pending',
      },
    ];

    render(<ActivityWallWidget widget={baseWidget} />);

    await userEvent.click(screen.getByRole('button', { name: 'View' }));

    expect(await screen.findByText('1 pending')).toBeInTheDocument();
    expect(screen.queryByText('hidden')).not.toBeInTheDocument();
    expect(
      screen.getByText(/responses will appear here after participants submit/i)
    ).toBeInTheDocument();
  });

  it('renders approved live submissions in the visible wall content', async () => {
    snapshotDocs = [
      {
        id: 'submission-2',
        content: 'Visible response',
        submittedAt: 456,
        status: 'approved',
      },
    ];

    render(<ActivityWallWidget widget={baseWidget} />);

    await userEvent.click(screen.getByRole('button', { name: 'View' }));

    await waitFor(() => {
      expect(screen.getByText('visible')).toBeInTheDocument();
      expect(screen.queryByText(/pending/i)).not.toBeInTheDocument();
    });
  });

  it('lets photo submissions render using their natural aspect ratio', async () => {
    snapshotDocs = [
      {
        id: 'submission-photo-1',
        content: 'https://example.com/photo.jpg',
        submittedAt: 789,
        status: 'approved',
        participantLabel: 'Student Photo',
      },
    ];

    const photoWidget: WidgetData = {
      ...baseWidget,
      config: {
        activeActivityId: 'activity-photo-1',
        activities: [
          {
            id: 'activity-photo-1',
            title: 'Snapshot',
            prompt: 'Share a photo',
            mode: 'photo',
            moderationEnabled: true,
            identificationMode: 'anonymous',
            submissions: [],
            startedAt: Date.now(),
          },
        ],
      },
    } as WidgetData;

    render(<ActivityWallWidget widget={photoWidget} />);

    await userEvent.click(screen.getByRole('button', { name: 'View' }));

    const image = await screen.findByRole('img', { name: 'Student Photo' });
    Object.defineProperty(image, 'naturalWidth', {
      configurable: true,
      value: 1400,
    });
    Object.defineProperty(image, 'naturalHeight', {
      configurable: true,
      value: 700,
    });
    fireEvent.load(image);

    expect(image).not.toHaveStyle({ aspectRatio: '4/3' });
    expect(image).toHaveClass('block', 'w-full', 'h-auto');
    await waitFor(() => {
      expect(image.closest('div.rounded-lg')).toHaveStyle({
        gridColumn: 'span 1',
      });
    });
  });

  it('resolves Firebase preview URLs for approved photo submissions that only store a storage path', async () => {
    snapshotDocs = [
      {
        id: 'submission-photo-firebase-preview',
        content: '',
        submittedAt: 790,
        status: 'approved',
        participantLabel: 'Firebase Photo',
        storagePath:
          'activity_wall_photos/teacher-1_activity-photo-preview/submission-photo-firebase-preview',
        archiveStatus: 'firebase',
      },
    ];

    const photoWidget: WidgetData = {
      ...baseWidget,
      config: {
        activeActivityId: 'activity-photo-preview',
        activities: [
          {
            id: 'activity-photo-preview',
            title: 'Snapshot',
            prompt: 'Share a photo',
            mode: 'photo',
            moderationEnabled: true,
            identificationMode: 'anonymous',
            submissions: [],
            startedAt: Date.now(),
          },
        ],
      },
    } as WidgetData;

    render(<ActivityWallWidget widget={photoWidget} />);

    await userEvent.click(screen.getByRole('button', { name: 'View' }));

    await waitFor(() => {
      expect(mockStorageRef).toHaveBeenCalledWith(
        {},
        'activity_wall_photos/teacher-1_activity-photo-preview/submission-photo-firebase-preview'
      );
      expect(mockGetDownloadURL).toHaveBeenCalled();
    });

    expect(
      await screen.findByRole('img', { name: 'Firebase Photo' })
    ).toHaveAttribute('src', 'https://firebase.example/teacher-preview.jpg');
    expect(
      screen.queryByLabelText(/drive sync failed/i)
    ).not.toBeInTheDocument();
  });

  it('shows only a small failure badge when Drive sync fails', async () => {
    snapshotDocs = [
      {
        id: 'submission-photo-failed-badge',
        content: 'https://example.com/photo.jpg',
        submittedAt: 791,
        status: 'approved',
        participantLabel: 'Unsynced Photo',
        archiveStatus: 'failed',
        archiveError: 'Drive sync failed.',
      },
    ];

    const photoWidget: WidgetData = {
      ...baseWidget,
      config: {
        activeActivityId: 'activity-photo-failed-badge',
        activities: [
          {
            id: 'activity-photo-failed-badge',
            title: 'Snapshot',
            prompt: 'Share a photo',
            mode: 'photo',
            moderationEnabled: true,
            identificationMode: 'anonymous',
            submissions: [],
            startedAt: Date.now(),
          },
        ],
      },
    } as WidgetData;

    render(<ActivityWallWidget widget={photoWidget} />);

    await userEvent.click(screen.getByRole('button', { name: 'View' }));

    expect(
      await screen.findByRole('img', { name: 'Unsynced Photo' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/drive sync failed/i)).toBeInTheDocument();
    expect(screen.queryByText('Syncing')).not.toBeInTheDocument();
    expect(screen.queryByText('Drive')).not.toBeInTheDocument();
  });

  it('reveals submission actions on tap and can delete a submission', async () => {
    snapshotDocs = [
      {
        id: 'submission-photo-delete',
        content: 'https://example.com/delete-me.jpg',
        submittedAt: 900,
        status: 'approved',
        participantLabel: 'Delete Me',
      },
    ];

    const photoWidget: WidgetData = {
      ...baseWidget,
      config: {
        activeActivityId: 'activity-photo-delete',
        activities: [
          {
            id: 'activity-photo-delete',
            title: 'Snapshot',
            prompt: 'Share a photo',
            mode: 'photo',
            moderationEnabled: true,
            identificationMode: 'anonymous',
            submissions: [],
            startedAt: Date.now(),
          },
        ],
      },
    } as WidgetData;

    render(<ActivityWallWidget widget={photoWidget} />);
    await userEvent.click(screen.getByRole('button', { name: 'View' }));

    await userEvent.click(
      await screen.findByRole('img', { name: 'Delete Me' })
    );
    expect(
      screen.getByRole('button', { name: /open fullscreen preview/i })
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /delete submission/i })
    );

    await waitFor(() => {
      expect(mockDeleteDoc).toHaveBeenCalled();
      expect(mockAddToast).toHaveBeenCalledWith(
        'Submission removed.',
        'success'
      );
    });
  });

  it('archives photos through the callable backend flow instead of browser storage reads', async () => {
    mockUseGoogleDrive.mockReturnValue({
      isConnected: true,
    });

    const originalImage = window.Image;
    class ReadyImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_value: string) {
        this.onload?.();
      }
    }
    // @ts-expect-error test stub only implements the pieces this code uses
    window.Image = ReadyImage;

    try {
      snapshotDocs = [
        {
          id: 'submission-photo-sync',
          content: 'https://firebasestorage.example/photo.jpg',
          submittedAt: 111,
          status: 'approved',
          participantLabel: 'Drive Pending',
          storagePath: 'activity_wall_photos/session/submission-photo-sync',
          archiveStatus: 'firebase',
        },
      ];

      const photoWidget: WidgetData = {
        ...baseWidget,
        config: {
          activeActivityId: 'activity-photo-sync',
          activities: [
            {
              id: 'activity-photo-sync',
              title: 'Snapshot',
              prompt: 'Share a photo',
              mode: 'photo',
              moderationEnabled: false,
              identificationMode: 'anonymous',
              submissions: [],
              startedAt: Date.now(),
            },
          ],
        },
      } as WidgetData;

      render(<ActivityWallWidget widget={photoWidget} />);

      await waitFor(() => {
        expect(mockHttpsCallable).toHaveBeenCalledWith(
          {},
          'archiveActivityWallPhoto'
        );
        expect(mockArchivePhotoCallable).toHaveBeenCalledWith({
          accessToken: 'google-access-token',
          sessionId: 'teacher-1_activity-photo-sync',
          submissionId: 'submission-photo-sync',
          activityId: 'activity-photo-sync',
          status: 'approved',
        });
      });
    } finally {
      window.Image = originalImage;
    }
  });

  it('marks stale syncing submissions as failed instead of leaving them stuck', async () => {
    mockUseGoogleDrive.mockReturnValue({
      isConnected: true,
    });

    snapshotDocs = [
      {
        id: 'submission-photo-stale-sync',
        content: 'https://lh3.googleusercontent.com/d/stuck-file',
        submittedAt: Date.now() - 60000,
        status: 'approved',
        participantLabel: 'Stale Sync',
        storagePath: 'activity_wall_photos/session/submission-photo-stale-sync',
        archiveStatus: 'syncing',
        archiveStartedAt: Date.now() - 45000,
      },
    ];

    const photoWidget: WidgetData = {
      ...baseWidget,
      config: {
        activeActivityId: 'activity-photo-stale-sync',
        activities: [
          {
            id: 'activity-photo-stale-sync',
            title: 'Snapshot',
            prompt: 'Share a photo',
            mode: 'photo',
            moderationEnabled: false,
            identificationMode: 'anonymous',
            submissions: [],
            startedAt: Date.now(),
          },
        ],
      },
    } as WidgetData;

    render(<ActivityWallWidget widget={photoWidget} />);

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        'session-doc',
        expect.objectContaining({
          archiveStatus: 'failed',
          archiveError:
            'Drive sync timed out before completion. Retry after checking Drive connection and Firebase Storage CORS.',
        })
      );
    });
  });

  it('spawns QR widgets with the participant URL hidden by default', async () => {
    render(<ActivityWallWidget widget={baseWidget} />);

    await userEvent.click(screen.getByRole('button', { name: 'View' }));
    await userEvent.click(screen.getByRole('button', { name: 'Pop-out QR' }));

    expect(mockAddWidget).toHaveBeenCalled();
    const [widgetType, widgetConfig] = mockAddWidget.mock.calls.at(-1) ?? [];

    expect(widgetType).toBe('qr');
    expect(widgetConfig).toMatchObject({
      w: 200,
      h: 250,
      config: {
        showUrl: false,
      },
    });
    expect(widgetConfig?.config.url).toContain(
      '/activity-wall/activity-1?data='
    );
  });
});
