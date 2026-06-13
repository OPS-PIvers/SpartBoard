import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteActivityWallControl } from './RemoteActivityWallControl';
import { WidgetData } from '@/types';

const {
  mockUpdateDoc,
  mockDeleteDoc,
  mockOnSnapshot,
  mockCollection,
  mockDoc,
  mockUser,
  mockCanAccessFeature,
} = vi.hoisted(() => ({
  mockUpdateDoc: vi.fn(),
  mockDeleteDoc: vi.fn(),
  mockOnSnapshot: vi.fn(),
  mockCollection: vi.fn(),
  mockDoc: vi.fn(),
  mockUser: { uid: 'teacher-1' },
  mockCanAccessFeature: vi.fn(() => true),
}));

let snapshotDocs: Record<string, unknown>[] = [];

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    canAccessFeature: mockCanAccessFeature,
  }),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  onSnapshot: mockOnSnapshot,
  updateDoc: mockUpdateDoc,
  deleteDoc: mockDeleteDoc,
}));

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
  snapshotDocs = [];
  mockCanAccessFeature.mockReturnValue(true);
  mockCollection.mockReturnValue('submissions-ref');
  // Each doc() call returns a distinct ref keyed by the submission id segment
  // so assertions can verify the right submission was targeted.
  mockDoc.mockImplementation((..._args: unknown[]) => ({
    __ref: _args[_args.length - 1],
  }));
  mockUpdateDoc.mockResolvedValue(undefined);
  mockDeleteDoc.mockResolvedValue(undefined);
  mockOnSnapshot.mockImplementation(
    (
      _ref: unknown,
      callback: (value: {
        docs: { id: string; data: () => Record<string, unknown> }[];
      }) => void
    ) => {
      callback({
        docs: snapshotDocs.map((entry) => ({
          id: entry.id as string,
          data: () => entry,
        })),
      });
      return vi.fn();
    }
  );
});

const renderControl = () =>
  render(
    <RemoteActivityWallControl widget={baseWidget} updateWidget={vi.fn()} />
  );

describe('RemoteActivityWallControl', () => {
  it('renders pending submissions with a count badge', async () => {
    snapshotDocs = [
      {
        id: 'submission-1',
        content: 'Pending idea one',
        submittedAt: 100,
        status: 'pending',
      },
      {
        id: 'submission-2',
        content: 'Pending idea two',
        submittedAt: 200,
        status: 'pending',
      },
      {
        id: 'submission-3',
        content: 'Already approved',
        submittedAt: 300,
        status: 'approved',
      },
    ];

    renderControl();

    expect(await screen.findByText('2 pending')).toBeInTheDocument();
    expect(screen.getByText('Pending idea one')).toBeInTheDocument();
    expect(screen.getByText('Pending idea two')).toBeInTheDocument();
    // Approved submissions are not part of the moderation queue.
    expect(screen.queryByText('Already approved')).not.toBeInTheDocument();
  });

  it('approves a pending submission via updateDoc with status approved', async () => {
    snapshotDocs = [
      {
        id: 'submission-1',
        content: 'Pending idea one',
        submittedAt: 100,
        status: 'pending',
      },
    ];

    renderControl();

    const approveBtn = await screen.findByRole('button', {
      name: /approve submission submission-1/i,
    });
    await userEvent.click(approveBtn);

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        { __ref: 'submission-1' },
        { status: 'approved' }
      );
    });
  });

  it('removes a pending submission via deleteDoc', async () => {
    snapshotDocs = [
      {
        id: 'submission-1',
        content: 'Pending idea one',
        submittedAt: 100,
        status: 'pending',
      },
    ];

    renderControl();

    const removeBtn = await screen.findByRole('button', {
      name: /remove submission submission-1/i,
    });
    await userEvent.click(removeBtn);

    await waitFor(() => {
      expect(mockDeleteDoc).toHaveBeenCalledWith({ __ref: 'submission-1' });
    });
  });

  it('hides the QR affordance when anonymous-join is not permitted', async () => {
    mockCanAccessFeature.mockReturnValue(false);
    snapshotDocs = [];

    renderControl();

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /join qr/i })
      ).not.toBeInTheDocument();
    });
    expect(mockCanAccessFeature).toHaveBeenCalledWith('anonymous-join');
  });

  it('shows the QR affordance when anonymous-join is permitted', async () => {
    mockCanAccessFeature.mockReturnValue(true);
    snapshotDocs = [];

    renderControl();

    expect(
      await screen.findByRole('button', { name: /join qr/i })
    ).toBeInTheDocument();
  });
});
