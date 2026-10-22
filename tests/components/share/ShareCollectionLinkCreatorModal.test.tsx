import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ShareCollectionLinkCreatorModal } from '@/components/share/ShareCollectionLinkCreatorModal';
import type { Collection, Dashboard } from '@/types';
import type { useDashboard as UseDashboardFn } from '@/context/useDashboard';

const useDashboardMock = vi.fn();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => useDashboardMock() as ReturnType<typeof UseDashboardFn>,
}));

const canAccessFeature = vi.fn((_id: string) => false);
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature }),
}));

const viewAs = { active: false };
vi.mock('@/hooks/useViewAsOutward', () => ({
  useViewAsOutward: () => viewAs,
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
  shareLinkedCollection: vi.fn(),
  addToast: vi.fn(),
};

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  vi.clearAllMocks();
  useDashboardMock.mockReturnValue(baseMockReturn);
  canAccessFeature.mockReturnValue(false);
  viewAs.active = false;
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

  it('offers Share with a sub and opens it', () => {
    const onShareWithSub = vi.fn();
    render(
      <ShareCollectionLinkCreatorModal
        isOpen
        collection={collection()}
        boards={[board('b1')]}
        onClose={vi.fn()}
        onShareWithSub={onShareWithSub}
      />
    );
    expect(screen.queryByText('Substitute (view-only)')).toBeNull();
    fireEvent.click(screen.getByText('Share with a sub'));
    expect(onShareWithSub).toHaveBeenCalledTimes(1);
  });

  describe('with collection-sync-sharing on', () => {
    beforeEach(() => {
      canAccessFeature.mockImplementation(
        (id) => id === 'collection-sync-sharing'
      );
    });

    const tree = {
      sections: [{ id: 'c1', name: 'Math' }],
      boardEntries: [{ id: 'b1', name: 'Board b1', sectionId: 'c1', order: 0 }],
    };

    it('offers Synced, View-Only and Make a copy, Synced first', () => {
      render(
        <ShareCollectionLinkCreatorModal
          isOpen
          collection={collection()}
          boards={[board('b1')]}
          tree={tree}
          onClose={vi.fn()}
        />
      );
      expect(
        screen
          .getByRole('button', { name: /^Synced/ })
          .getAttribute('aria-pressed')
      ).toBe('true');
      expect(
        screen.getByText("They see your changes live but can't edit.")
      ).toBeTruthy();
      expect(screen.getByText('Make a copy')).toBeTruthy();
    });

    it('shares Synced as a live link to the collection landing', async () => {
      const shareLinkedCollection = vi.fn().mockResolvedValue('link-1');
      useDashboardMock.mockReturnValue({
        ...baseMockReturn,
        shareLinkedCollection,
      });
      render(
        <ShareCollectionLinkCreatorModal
          isOpen
          collection={collection()}
          boards={[board('b1')]}
          tree={tree}
          onClose={vi.fn()}
        />
      );

      await clickCreate();

      expect(shareLinkedCollection).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'synced', tree })
      );
      expect(baseMockReturn.shareCollection).not.toHaveBeenCalled();
      const url = screen.getByLabelText<HTMLInputElement>(
        'Share collection URL'
      );
      expect(url.value).toContain('/share/collection/link-1');
    });

    it('shares View-Only when picked', async () => {
      const shareLinkedCollection = vi.fn().mockResolvedValue('link-2');
      useDashboardMock.mockReturnValue({
        ...baseMockReturn,
        shareLinkedCollection,
      });
      render(
        <ShareCollectionLinkCreatorModal
          isOpen
          collection={collection()}
          boards={[board('b1')]}
          tree={tree}
          onClose={vi.fn()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /^View-Only/ }));

      await clickCreate();

      expect(shareLinkedCollection).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'view-only' })
      );
    });

    it('keeps Make a copy on the copy share, sub-collections included', async () => {
      const shareCollection = vi.fn().mockResolvedValue('copy-1');
      useDashboardMock.mockReturnValue({ ...baseMockReturn, shareCollection });
      render(
        <ShareCollectionLinkCreatorModal
          isOpen
          collection={collection()}
          boards={[board('b1')]}
          tree={tree}
          onClose={vi.fn()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /^Make a copy/ }));

      await clickCreate();

      expect(shareCollection).toHaveBeenCalledWith(
        expect.objectContaining({ tree })
      );
      expect(
        screen.getByLabelText<HTMLInputElement>('Share collection URL').value
      ).toContain('/share-collection/copy-1');
    });

    it('refuses a live share while a board is already shared live', async () => {
      const shareLinkedCollection = vi.fn();
      const addToast = vi.fn();
      useDashboardMock.mockReturnValue({
        ...baseMockReturn,
        shareLinkedCollection,
        addToast,
      });
      render(
        <ShareCollectionLinkCreatorModal
          isOpen
          collection={collection()}
          boards={[
            { ...board('b1'), linkedShareId: 's', linkedShareRole: 'owner' },
          ]}
          tree={tree}
          onClose={vi.fn()}
        />
      );

      await clickCreate();

      expect(shareLinkedCollection).not.toHaveBeenCalled();
      expect(addToast).toHaveBeenCalledWith(
        expect.stringContaining('Board b1 is already shared live'),
        'error'
      );
    });

    it('only offers a copy for a collection already in a live share', () => {
      render(
        <ShareCollectionLinkCreatorModal
          isOpen
          collection={{
            ...collection(),
            linkedCollectionId: 'link-9',
            linkedCollectionRole: 'collaborator',
          }}
          boards={[board('b1')]}
          onClose={vi.fn()}
        />
      );
      expect(screen.queryByText('Synced')).toBeNull();
      expect(screen.getByText('They get their own copy to edit.')).toBeTruthy();
    });
    it('only offers a copy in a view-as tab', () => {
      viewAs.active = true;
      render(
        <ShareCollectionLinkCreatorModal
          isOpen
          collection={collection()}
          boards={[board('b1')]}
          tree={tree}
          onClose={vi.fn()}
        />
      );
      expect(screen.queryByText('Synced')).toBeNull();
    });

    it('only offers a copy when a parent or sub-collection is shared live', () => {
      render(
        <ShareCollectionLinkCreatorModal
          isOpen
          collection={collection()}
          boards={[board('b1')]}
          tree={tree}
          inLiveShare
          onClose={vi.fn()}
        />
      );
      expect(screen.queryByText('Synced')).toBeNull();
    });

    it('shows the host the live link it already made', () => {
      render(
        <ShareCollectionLinkCreatorModal
          isOpen
          collection={{
            ...collection(),
            linkedCollectionId: 'link-7',
            linkedCollectionRole: 'owner',
          }}
          boards={[board('b1')]}
          tree={tree}
          onClose={vi.fn()}
        />
      );
      expect(
        screen.getByLabelText<HTMLInputElement>('Share collection URL').value
      ).toContain('/share/collection/link-7');
      expect(screen.queryByText('Synced')).toBeNull();
    });
  });
});
