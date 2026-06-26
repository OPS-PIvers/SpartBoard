import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareCollectionLinkCreatorModal } from '@/components/share/ShareCollectionLinkCreatorModal';
import type { Collection, Dashboard } from '@/types';
import type { useDashboard as UseDashboardFn } from '@/context/useDashboard';
import { BUILDINGS } from '@/config/buildings';

const useDashboardMock = vi.fn();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => useDashboardMock() as ReturnType<typeof UseDashboardFn>,
}));

// usePresetSubEmails hits Firestore; stub it so the modal's optional sub-email
// preset chips render without a live backend.
vi.mock('@/hooks/usePresetSubEmails', () => ({
  usePresetSubEmails: () => ({ emails: [] as string[] }),
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
};

beforeEach(() => {
  vi.clearAllMocks();
  useDashboardMock.mockReturnValue(baseMockReturn);
  // Stub clipboard for the auto-copy path
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

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

  it('shows both mode radios with Copy selected by default', () => {
    render(
      <ShareCollectionLinkCreatorModal
        isOpen
        collection={collection()}
        boards={[board('b1'), board('b2')]}
        onClose={vi.fn()}
      />
    );
    const copyRadio = screen.getByRole('radio', { name: /copy/i });
    const subRadio = screen.getByRole('radio', { name: /substitute/i });
    expect(copyRadio).toBeChecked();
    expect(subRadio).not.toBeChecked();
  });

  it('Substitute mode without buildingId shows an error toast and does not call the share action', async () => {
    const addToast = vi.fn();
    const shareSubstituteCollection = vi.fn();
    useDashboardMock.mockReturnValue({
      ...baseMockReturn,
      addToast,
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
    // Switch to substitute mode — fireEvent.click is required for controlled
    // radio inputs in jsdom; userEvent.click does not trigger onChange on them.
    act(() => {
      fireEvent.click(screen.getByRole('radio', { name: /substitute/i }));
    });
    // Click Create link without selecting a building (select stays at empty "")
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /create link/i }));
    });
    // handleCreate is async; flush the microtask queue
    await act(async () => {
      await Promise.resolve();
    });
    expect(addToast).toHaveBeenCalledWith(
      expect.stringMatching(/select a building/i),
      'error'
    );
    expect(shareSubstituteCollection).not.toHaveBeenCalled();
  });

  it('Substitute mode with valid building calls shareSubstituteCollection and shows URL panel', async () => {
    const shareSubstituteCollection = vi.fn().mockResolvedValue('sub-share-id');
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
    // Switch to substitute mode
    act(() => {
      fireEvent.click(screen.getByRole('radio', { name: /substitute/i }));
    });
    // Select a canonical building from the dropdown
    const select = screen.getByRole('combobox');
    act(() => {
      fireEvent.change(select, { target: { value: BUILDINGS[0].id } });
    });
    // Click Create link
    await userEvent.click(screen.getByRole('button', { name: /create link/i }));
    expect(shareSubstituteCollection).toHaveBeenCalledWith(
      expect.objectContaining({ buildingId: BUILDINGS[0].id })
    );
    const urlInput = await screen.findByLabelText(/share collection url/i);
    expect((urlInput as HTMLInputElement).value).toContain(
      '/share-collection/sub-share-id'
    );
  });

  it('Copy mode calls shareCollection and reveals the URL panel', async () => {
    const shareCollection = vi.fn().mockResolvedValue('share-id-123');
    useDashboardMock.mockReturnValue({
      ...baseMockReturn,
      shareCollection,
    });
    render(
      <ShareCollectionLinkCreatorModal
        isOpen
        collection={collection()}
        boards={[board('b1'), board('b2')]}
        onClose={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /create link/i }));
    expect(shareCollection).toHaveBeenCalledWith({
      collection: expect.objectContaining({ id: 'c1' }),
      boards: expect.arrayContaining([
        expect.objectContaining({ id: 'b1' }),
        expect.objectContaining({ id: 'b2' }),
      ]),
    });
    // URL panel appears with the constructed URL
    const urlInput = await screen.findByLabelText(/share collection url/i);
    expect((urlInput as HTMLInputElement).value).toContain(
      '/share-collection/share-id-123'
    );
  });
});
