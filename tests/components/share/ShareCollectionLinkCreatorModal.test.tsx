import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ShareCollectionLinkCreatorModal } from '@/components/share/ShareCollectionLinkCreatorModal';
import type { Collection, Dashboard } from '@/types';
import type { useDashboard as UseDashboardFn } from '@/context/useDashboard';

// Teachers with sub-share-collections hand subs a collection through
// ShareWithSubModal; everyone else keeps the Substitute choice here.

const useDashboardMock = vi.fn();
const hasSubShareFlag = { value: true };

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => useDashboardMock() as ReturnType<typeof UseDashboardFn>,
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [{ id: 'high', name: 'Orono High School' }],
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    hasOrg: true,
    canAccessFeature: (id: string) =>
      id === 'sub-share-collections' ? hasSubShareFlag.value : true,
  }),
}));

vi.mock('@/hooks/usePresetSubEmails', () => ({
  usePresetSubEmails: () => ({ emails: [], loading: false }),
}));

const collection = (): Collection => ({
  id: 'c1',
  name: 'Math',
  parentCollectionId: null,
  order: 0,
  createdAt: 0,
  color: '#ad2122',
});

const board = (id: string): Dashboard => ({
  id,
  name: `Board ${id}`,
  background: 'bg-slate-800',
  widgets: [],
  createdAt: 0,
  collectionId: 'c1',
});

const baseMockReturn = {
  shareCollection: vi.fn(),
  shareSubstituteCollection: vi.fn(),
  addToast: vi.fn(),
  rosters: [],
  activeRosterId: null,
  collectionsApi: { collections: [collection()] },
  dashboards: [board('b1'), board('b2')],
};

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  vi.clearAllMocks();
  hasSubShareFlag.value = true;
  useDashboardMock.mockReturnValue(baseMockReturn);
  // Stub clipboard for the auto-copy path
  writeText.mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});

const clickCreate = async () => {
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: /create link/i }));
  });
  // handleCreate is async; flush the microtask queue
  await act(async () => {
    await Promise.resolve();
  });
};

describe('ShareCollectionLinkCreatorModal', () => {
  it('renders nothing when !isOpen', () => {
    const { container } = render(
      <ShareCollectionLinkCreatorModal
        isOpen={false}
        collection={collection()}
        boards={[board('b1')]}
        onClose={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when collection is null', () => {
    const { container } = render(
      <ShareCollectionLinkCreatorModal
        isOpen
        collection={null}
        boards={[]}
        onClose={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('says how many boards the recipient will get', () => {
    render(
      <ShareCollectionLinkCreatorModal
        isOpen
        collection={collection()}
        boards={[board('b1'), board('b2')]}
        onClose={vi.fn()}
      />
    );
    expect(
      screen.getByText(/Sharing 2 board\(s\) from this Collection/)
    ).toBeTruthy();
  });

  it('creates the share, shows the import link and copies it', async () => {
    const shareCollection = vi.fn().mockResolvedValue('coll-share-id');
    useDashboardMock.mockReturnValue({ ...baseMockReturn, shareCollection });
    render(
      <ShareCollectionLinkCreatorModal
        isOpen
        collection={collection()}
        boards={[board('b1')]}
        onClose={vi.fn()}
      />
    );

    await clickCreate();

    expect(shareCollection).toHaveBeenCalledWith({
      collection: expect.objectContaining({ id: 'c1' }),
      boards: [expect.objectContaining({ id: 'b1' })],
    });
    const url = screen.getByLabelText<HTMLInputElement>('Share collection URL');
    expect(url.value).toContain('/share-collection/coll-share-id');
    expect(writeText).toHaveBeenCalledWith(url.value);
  });

  // A partial commit ("3 of 5 boards committed") is the one failure the host
  // has to see in full, so the modal surfaces the thrown message verbatim.
  it('surfaces a failed share verbatim and stays on the form', async () => {
    const shareCollection = vi
      .fn()
      .mockRejectedValue(new Error('3 of 5 boards committed'));
    const addToast = vi.fn();
    useDashboardMock.mockReturnValue({
      ...baseMockReturn,
      shareCollection,
      addToast,
    });
    render(
      <ShareCollectionLinkCreatorModal
        isOpen
        collection={collection()}
        boards={[board('b1')]}
        onClose={vi.fn()}
      />
    );

    await clickCreate();

    expect(addToast).toHaveBeenCalledWith('3 of 5 boards committed', 'error');
    expect(screen.queryByLabelText('Share collection URL')).toBeNull();
    // The button is usable again rather than stuck on "Creating…".
    expect(
      screen.getByRole('button', { name: /create link/i })
    ).not.toBeDisabled();
  });

  it('offers no Substitute choice to a teacher with the new sub dialog', () => {
    render(
      <ShareCollectionLinkCreatorModal
        isOpen
        collection={collection()}
        boards={[board('b1')]}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText('Substitute (view-only)')).toBeNull();
  });

  it('hands the collection to a sub for a teacher without the new sub dialog', async () => {
    hasSubShareFlag.value = false;
    const shareSubstituteCollection = vi.fn().mockResolvedValue('sub-id');
    useDashboardMock.mockReturnValue({
      ...baseMockReturn,
      shareSubstituteCollection,
    });
    render(
      <ShareCollectionLinkCreatorModal
        isOpen
        collection={collection()}
        boards={[board('b1'), board('b2')]}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Substitute (view-only)'));
    fireEvent.change(screen.getByLabelText('Building'), {
      target: { value: 'high' },
    });
    await clickCreate();

    expect(shareSubstituteCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'collection',
        sourceId: 'c1',
        buildingId: 'high',
        boards: [
          expect.objectContaining({ id: 'b1' }),
          expect.objectContaining({ id: 'b2' }),
        ],
        boardEntries: expect.any(Array) as unknown[],
        sections: expect.any(Array) as unknown[],
      })
    );
    const url = screen.getByLabelText<HTMLInputElement>('Share collection URL');
    expect(url.value).toContain('/subs/s/sub-id');
  });

  it('names the widgets whose content did not reach the sub', async () => {
    hasSubShareFlag.value = false;
    const shareSubstituteCollection = vi.fn(
      (input: {
        onBundle?: (b: {
          failures: { kind: string; itemId: string; label: string }[];
        }) => void;
      }) => {
        input.onBundle?.({
          failures: [
            { kind: 'drawing', itemId: 'w1', label: 'Drawing on Board b1' },
          ],
        });
        return Promise.resolve('sub-id');
      }
    );
    useDashboardMock.mockReturnValue({
      ...baseMockReturn,
      shareSubstituteCollection,
    });
    render(
      <ShareCollectionLinkCreatorModal
        isOpen
        collection={collection()}
        boards={[board('b1')]}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Substitute (view-only)'));
    fireEvent.change(screen.getByLabelText('Building'), {
      target: { value: 'high' },
    });
    await clickCreate();

    expect(
      screen.getByText('Some widget content did not come along')
    ).toBeTruthy();
    expect(screen.getByText('Drawing on Board b1')).toBeTruthy();
  });

  it('counts the boards in nested collections a sub share carries', () => {
    hasSubShareFlag.value = false;
    useDashboardMock.mockReturnValue({
      ...baseMockReturn,
      collectionsApi: {
        collections: [
          collection(),
          {
            ...collection(),
            id: 'c2',
            name: 'Day 2',
            parentCollectionId: 'c1',
          },
        ],
      },
      dashboards: [board('b1'), { ...board('b3'), collectionId: 'c2' }],
    });
    render(
      <ShareCollectionLinkCreatorModal
        isOpen
        collection={collection()}
        boards={[board('b1')]}
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByText(/Sharing 1 board\(s\) from this Collection/)
    ).toBeTruthy();
    fireEvent.click(screen.getByText('Substitute (view-only)'));
    expect(
      screen.getByText(/Sharing 2 board\(s\) from this Collection/)
    ).toBeTruthy();
  });
});
