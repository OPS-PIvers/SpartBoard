import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityWallWidget } from './Widget';
import type { ActivityWallLibraryEntry, WidgetData } from '@/types';
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
import { noSubShareKey } from '@/tests/testHelpers/subShareContent';
import { subShareContextValue } from '@/tests/helpers/subShareContext';

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
  mockGetDoc,
  mockLibraryEntries,
  mockLinkedShareId,
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
  mockGetDoc: vi.fn().mockResolvedValue({ data: () => undefined }),
  mockLibraryEntries: { current: [] as ActivityWallLibraryEntry[] },
  mockLinkedShareId: { current: null as string | null },
}));

const routerProps: { current: Record<string, unknown> | null } = {
  current: null,
};
const lastRouterProps = () => routerProps.current;
let snapshotDocs: Record<string, unknown>[] = [];
let sessionDocData: Record<string, Record<string, unknown>> = {};

vi.mock('@/context/dashboardCanvasStore', () => ({
  useDashboardActions: () => ({
    addWidget: mockAddWidget,
    addToast: mockAddToast,
    updateWidget: mockUpdateWidget,
  }),
  useIsActiveBoardReadOnly: () => false,
  useActiveBoardLinkedShareId: () => mockLinkedShareId.current,
  useGlobalStyle: () => ({ fontFamily: 'sans' }),
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
vi.mock('@/components/activityWall/render', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/components/activityWall/render')
  >()),
  LayoutRouter: (props: Record<string, unknown>) => {
    routerProps.current = props;
    return <div data-testid="layout-router" />;
  },
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: vi.fn().mockResolvedValue(true),
    showPrompt: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('@/utils/googleOAuthRefresh', () => ({
  requestAndExchangeAuthCode: vi.fn().mockResolvedValue({ kind: 'cancelled' }),
}));

vi.mock('@/config/firebase', () => ({ db: {}, functions: {}, storage: {} }));

vi.mock('firebase/firestore', () => ({
  arrayRemove: vi.fn((...ids: unknown[]) => ({ __arrayRemove: ids })),
  collection: vi.fn((...args: unknown[]) => args.join('/')),
  doc: vi.fn((...args: unknown[]) => ({ __path: args.slice(1).join('/') })),
  onSnapshot: mockOnSnapshot,
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  deleteDoc: mockDeleteDoc,
  deleteField: vi.fn(() => '__delete__'),
  getDoc: mockGetDoc,
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
  w: 600,
  h: 400,
  z: 1,
  flipped: false,
  config: { activeActivityId: 'wall-1' },
};

beforeEach(() => {
  vi.clearAllMocks();
  snapshotDocs = [];
  sessionDocData = {};
  mockLibraryEntries.current = [makeEntry()];
  mockLinkedShareId.current = null;
  mockGetDoc.mockResolvedValue({ data: () => undefined });
  mockSaveActivity.mockResolvedValue(undefined);
  mockDeleteActivity.mockResolvedValue(undefined);
  mockSetDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockResolvedValue(undefined);
  mockGetCountFromServer.mockResolvedValue({ data: () => ({ count: 3 }) });
  mockOnSnapshot.mockImplementation(
    (ref: unknown, onNext: (value: unknown) => void) => {
      if (typeof ref === 'string') {
        // Collection ref (submissions listener).
        onNext({
          docs: snapshotDocs.map((entry) => ({
            id: entry.id as string,
            data: () => entry,
          })),
        });
      } else {
        // Doc ref (session-doc share-info listener).
        const path = (ref as { __path: string }).__path;
        onNext({
          exists: () => path in sessionDocData,
          data: () => sessionDocData[path],
        });
      }
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

  it('collapses secondary toolbar actions into a labelled menu when narrow', async () => {
    render(<ActivityWallWidget widget={{ ...baseWidget, w: 300 }} />);

    expect(
      screen.queryByRole('button', { name: /open wall library/i })
    ).toBeNull();

    await userEvent.click(
      await screen.findByRole('button', { name: /more wall actions/i })
    );
    expect(
      await screen.findByRole('menuitem', { name: /open wall library/i })
    ).toBeInTheDocument();
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

  it('toggling Visible/Hidden writes studentsCanSeePosts to the entry and the session doc', async () => {
    renderWidget();
    mockSetDoc.mockClear();

    const pill = await screen.findByRole('button', { name: /hide posts/i });
    expect(pill).toHaveTextContent('Visible');
    expect(pill).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(pill);

    await waitFor(() =>
      expect(mockSaveActivity).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'wall-1', studentsCanSeePosts: false })
      )
    );
    await waitFor(() =>
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          __path: 'activity_wall_sessions/teacher-1_wall-1',
        }),
        expect.objectContaining({ studentsCanSeePosts: false }),
        { merge: true }
      )
    );
  });

  it('seeds engagement flags once from the latest gallery share for a pre-flag wall', async () => {
    sessionDocData['activity_wall_sessions/teacher-1_wall-1'] = {
      latestShareId: 'share-1',
    };
    mockGetDoc.mockResolvedValueOnce({
      data: () => ({
        allowLikes: true,
        allowComments: true,
        allowCommentResponses: false,
      }),
    });
    renderWidget();
    await waitFor(() =>
      expect(mockSaveActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'wall-1',
          allowLikes: true,
          allowComments: true,
          allowCommentResponses: false,
        })
      )
    );
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
  });

  it('never re-seeds a wall that already carries engagement flags', async () => {
    sessionDocData['activity_wall_sessions/teacher-1_wall-1'] = {
      latestShareId: 'share-1',
    };
    mockLibraryEntries.current = [
      makeEntry({
        allowLikes: false,
        allowComments: false,
        allowCommentResponses: false,
      }),
    ];
    renderWidget();
    await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  it('renders the Hidden pill when the wall hides posts', async () => {
    mockLibraryEntries.current = [makeEntry({ studentsCanSeePosts: false })];
    renderWidget();

    const pill = await screen.findByRole('button', { name: /show posts/i });
    expect(pill).toHaveTextContent('Hidden');
    expect(pill).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens the student view for the active wall in a new tab', async () => {
    mockLibraryEntries.current = [
      makeEntry({ id: 'wall-1' }),
      makeEntry({ id: 'wall-2', title: 'Exit Ticket' }),
    ];
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const { rerender } = render(
      <ActivityWallWidget
        widget={{ ...baseWidget, config: { activeActivityId: 'wall-1' } }}
      />
    );
    expect(screen.queryByRole('button', { name: 'Open gallery' })).toBeNull();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Open student view' })
    );
    expect(openSpy).toHaveBeenLastCalledWith(
      expect.stringContaining('teacher-1_wall-1'),
      '_blank',
      'noopener'
    );

    rerender(
      <ActivityWallWidget
        widget={{ ...baseWidget, config: { activeActivityId: 'wall-2' } }}
      />
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Open student view' })
    );
    expect(openSpy).toHaveBeenLastCalledWith(
      expect.stringContaining('teacher-1_wall-2'),
      '_blank',
      'noopener'
    );

    openSpy.mockRestore();
  });

  it('opens the share modal from the Share action', async () => {
    renderWidget();
    await userEvent.click(await screen.findByRole('button', { name: 'Share' }));
    expect(
      await screen.findByRole('tab', { name: 'Student link' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Public gallery' })
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

describe('ActivityWallWidget inside a sub share', () => {
  function InShare({ children }: { children: React.ReactNode }) {
    return (
      <SubShareContentContext.Provider
        value={subShareContextValue({
          shareId: 'share-1',
          version: 0,
          loadKey: noSubShareKey,
          load: () =>
            Promise.resolve({
              entry: makeEntry({ title: 'Exit tickets' }),
              hostUid: 'teacher-1',
            }),
        })}
      >
        {children}
      </SubShareContentContext.Provider>
    );
  }

  const renderShared = (widget: WidgetData = baseWidget) => {
    // Empty: a substitute's own library has none of the teacher's walls, so
    // anything on screen has to have come from the bundle.
    mockLibraryEntries.current = [];
    return render(<ActivityWallWidget widget={widget} />, {
      wrapper: InShare,
    });
  };

  it('shows the teacher’s bundled wall, not the substitute’s own library', async () => {
    renderShared();

    expect(await screen.findByText('Exit tickets')).toBeInTheDocument();
    expect(screen.queryByText('Choose a wall')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wall-library')).not.toBeInTheDocument();
  });

  // The session doc is keyed on the teacher's uid: a substitute can neither
  // read it nor write the mirror, and the posts are not theirs to see.
  it('opens no listener and writes no session mirror', async () => {
    renderShared();
    await screen.findByText('Exit tickets');

    expect(mockOnSnapshot).not.toHaveBeenCalled();
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockSaveActivity).not.toHaveBeenCalled();
  });

  it('offers none of the teacher’s wall controls', async () => {
    renderShared();
    await screen.findByText('Exit tickets');

    for (const name of [
      'Open',
      'Closed',
      'More wall actions',
      'Share',
      'Open wall library',
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(
      screen.queryByRole('button', { name: /Moderate posts/ })
    ).not.toBeInTheDocument();
  });

  it('says so when the wall came along with no posts on it', async () => {
    renderShared();
    await screen.findByText('Exit tickets');

    expect(
      screen.getByText(
        'This wall had no approved posts when your teacher shared it.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByTestId('layout-router')).not.toBeInTheDocument();
  });

  // The posts ride the share's names file, which only the named substitutes
  // can read, and they land on the widget's own config.
  const withPosts = {
    ...baseWidget,
    config: {
      ...baseWidget.config,
      subSharePosts: [
        {
          id: 'p1',
          content: 'Ada was here',
          submittedAt: 7,
          status: 'approved',
          participantLabel: 'Ada',
          type: 'text',
        },
      ],
    },
  } as WidgetData;

  it('draws the posts that came along with the share', async () => {
    routerProps.current = null;
    renderShared(withPosts);
    await screen.findByText('Exit tickets');

    expect(await screen.findByTestId('layout-router')).toBeInTheDocument();
    expect(lastRouterProps()?.submissions).toEqual([
      expect.objectContaining({ id: 'p1', participantLabel: 'Ada' }),
    ]);
  });

  it('hands the wall no way to change a post', async () => {
    routerProps.current = null;
    renderShared(withPosts);
    await screen.findByTestId('layout-router');

    for (const handler of [
      'onApprove',
      'onReject',
      'onDelete',
      'onPin',
      'onMove',
      'onEdit',
      'onAddAt',
    ]) {
      expect(lastRouterProps()?.[handler]).toBeUndefined();
    }
  });

  it('says so when no wall came along with the share', async () => {
    const { findByText } = render(
      <ActivityWallWidget widget={{ ...baseWidget, config: {} }} />,
      { wrapper: InShare }
    );

    expect(await findByText('No wall')).toBeInTheDocument();
    expect(screen.queryByText('Choose a wall')).not.toBeInTheDocument();
  });
});

describe('ActivityWallWidget on a Synced or View-Only board', () => {
  const hostSession = {
    id: 'host-1_wall-1',
    activityId: 'wall-1',
    teacherUid: 'host-1',
    title: 'Host wall',
    prompt: 'Share one idea',
    mode: 'text',
    moderationEnabled: true,
    identificationMode: 'anonymous',
    updatedAt: 5,
    layout: 'wall',
    showNames: false,
    acceptingResponses: true,
  };

  beforeEach(() => {
    mockLinkedShareId.current = 'share-1';
    mockLibraryEntries.current = [];
    mockGetDoc.mockResolvedValue({
      data: () => ({ originalAuthor: 'host-1' }),
    });
  });

  it("shows the host's wall read-only once the host opens it to the board", async () => {
    sessionDocData = {
      'activity_wall_sessions/host-1_wall-1': hostSession,
      'activity_wall_sessions/host-1_wall-1/boardAccess/boards': {
        boardShareIds: ['share-1'],
      },
    };
    snapshotDocs = [
      {
        id: 'p-1',
        content: 'Approved idea',
        submittedAt: 1,
        status: 'approved',
      },
    ];
    routerProps.current = null;
    renderWidget();

    expect(await screen.findByText('Host wall')).toBeInTheDocument();
    await screen.findByTestId('layout-router');
    expect(lastRouterProps()?.submissions).toHaveLength(1);
    for (const handler of ['onApprove', 'onDelete', 'onMove', 'onAddAt']) {
      expect(lastRouterProps()?.[handler]).toBeUndefined();
    }
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
    // The guest never writes a session of their own.
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('keeps the old empty state until the host lists the board', async () => {
    sessionDocData = { 'activity_wall_sessions/host-1_wall-1': hostSession };
    renderWidget();

    expect(await screen.findByText('Choose a wall')).toBeInTheDocument();
    expect(screen.queryByText('Host wall')).toBeNull();
  });

  it('uses the stamped owner without looking up the share', async () => {
    sessionDocData = {
      'activity_wall_sessions/collab-1_wall-1': {
        ...hostSession,
        id: 'collab-1_wall-1',
        teacherUid: 'collab-1',
        title: 'Collaborator wall',
      },
      'activity_wall_sessions/collab-1_wall-1/boardAccess/boards': {
        boardShareIds: ['share-1'],
      },
    };
    render(
      <ActivityWallWidget
        widget={{
          ...baseWidget,
          config: {
            activeActivityId: 'wall-1',
            activeActivityOwnerUid: 'collab-1',
          },
        }}
      />
    );

    expect(await screen.findByText('Collaborator wall')).toBeInTheDocument();
    expect(mockGetDoc).not.toHaveBeenCalledWith(
      expect.objectContaining({ __path: 'shared_boards/share-1' })
    );
  });

  it("lists the board in the owner's private access doc so members can read it", async () => {
    mockLibraryEntries.current = [makeEntry()];
    sessionDocData = {
      'activity_wall_sessions/teacher-1_wall-1/boardAccess/boards': {
        boardShareIds: ['old-share'],
      },
    };
    renderWidget();

    await waitFor(() =>
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          __path: 'activity_wall_sessions/teacher-1_wall-1/boardAccess/boards',
        }),
        { boardShareIds: ['share-1', 'old-share'] },
        { merge: true }
      )
    );
    // The session doc students read only learns that access changed.
    await waitFor(() =>
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          __path: 'activity_wall_sessions/teacher-1_wall-1',
        }),
        { boardAccessAt: expect.any(Number) as number }
      )
    );
    const sessionWrites = mockSetDoc.mock.calls.filter(
      ([ref]) =>
        (ref as { __path: string }).__path ===
        'activity_wall_sessions/teacher-1_wall-1'
    );
    for (const [, payload] of sessionWrites) {
      expect(JSON.stringify(payload)).not.toContain('share-1');
    }
  });

  it('never evicts a live board when the list is full', async () => {
    mockLibraryEntries.current = [makeEntry()];
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({}) });
    sessionDocData = {
      'activity_wall_sessions/teacher-1_wall-1/boardAccess/boards': {
        boardShareIds: ['a', 'b', 'c'],
      },
    };
    renderWidget();
    await screen.findByText('Warm Up');
    await waitFor(() => expect(mockGetDoc).toHaveBeenCalledTimes(3));
    expect(mockSetDoc).not.toHaveBeenCalledWith(
      expect.objectContaining({
        __path: 'activity_wall_sessions/teacher-1_wall-1/boardAccess/boards',
      }),
      expect.anything(),
      expect.anything()
    );
  });

  it('stamps the owner when a wall is opened on the board', async () => {
    mockLinkedShareId.current = null;
    mockLibraryEntries.current = [makeEntry()];
    render(<ActivityWallWidget widget={{ ...baseWidget, config: {} }} />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Open library' })
    );
    await userEvent.click(
      (
        await screen.findAllByRole('button', { name: /open on board|warm up/i })
      )[0]
    );

    await waitFor(() =>
      expect(mockUpdateWidget).toHaveBeenCalledWith('widget-1', {
        config: {
          activeActivityId: 'wall-1',
          activeActivityOwnerUid: 'teacher-1',
        },
      })
    );
  });

  it("doesn't rewrite the list when the board is already on it", async () => {
    mockLibraryEntries.current = [makeEntry()];
    sessionDocData = {
      'activity_wall_sessions/teacher-1_wall-1/boardAccess/boards': {
        boardShareIds: ['other-board', 'share-1'],
      },
    };
    renderWidget();
    await screen.findByText('Warm Up');
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('closes the old wall to the board when the owner switches walls', async () => {
    mockLibraryEntries.current = [
      makeEntry(),
      makeEntry({ id: 'wall-2', title: 'Exit Ticket' }),
    ];
    renderWidget();
    await screen.findByText('Warm Up');
    // Open each wall in turn; only leaving wall-1 should close it to the board.
    for (const index of [0, 1]) {
      await userEvent.click(
        await screen.findByRole('button', { name: 'Open wall library' })
      );
      const buttons = await screen.findAllByRole('button', {
        name: /open on board/i,
      });
      await userEvent.click(buttons[index]);
    }
    await waitFor(() =>
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          __path: 'activity_wall_sessions/teacher-1_wall-1/boardAccess/boards',
        }),
        { boardShareIds: { __arrayRemove: ['share-1'] } }
      )
    );
  });
});
