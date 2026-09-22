import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ShareCollectionLinkCreatorModal } from '@/components/share/ShareCollectionLinkCreatorModal';
import type { Collection, Dashboard } from '@/types';
import type { useDashboard as UseDashboardFn } from '@/context/useDashboard';

// Substitute mode left this modal for ShareWithSubModal
// (docs/plans/SUB_SHARE_COLLECTIONS.md §3.2); what stays here is the copy a
// colleague imports into their own account. The sub-email and building
// coverage this file used to carry lives in
// components/share/ShareWithSubModal.test.tsx.

const useDashboardMock = vi.fn();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => useDashboardMock() as ReturnType<typeof UseDashboardFn>,
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
  addToast: vi.fn(),
};

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  vi.clearAllMocks();
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
});
