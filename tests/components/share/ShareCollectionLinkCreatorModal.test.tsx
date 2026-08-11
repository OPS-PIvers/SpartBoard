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
const usePresetSubEmailsMock = vi.fn(() => ({ emails: [] as string[] }));
vi.mock('@/hooks/usePresetSubEmails', () => ({
  usePresetSubEmails: () => usePresetSubEmailsMock(),
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
  usePresetSubEmailsMock.mockReturnValue({ emails: [] as string[] });
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

// Regression guard, same bug class as ShareLinkCreatorModal.test.tsx /
// PresetSubEmailsManager.test.tsx / BetaUsersPanel.test.tsx (#2389 / #2375):
// every other "add an email" call site in the app lowercases the trimmed
// input before storing/deduping it, because downstream `.includes()` checks
// and Firestore array membership are case-sensitive. This modal's substitute
// Collection-share sub-email picker was never updated to match — both the
// manual `handleAddSubEmail` input and the preset-chip click handler deduped
// via a case-sensitive `subEmails.includes(...)` without lowercasing, so
// adding "Sub@orono.k12.mn.us" and later "sub@orono.k12.mn.us" produced two
// entries for the same real mailbox instead of one.
describe('ShareCollectionLinkCreatorModal — substitute sub-email case handling', () => {
  const openSubstituteMode = () => {
    render(
      <ShareCollectionLinkCreatorModal
        isOpen
        collection={collection()}
        boards={[board('b1')]}
        onClose={vi.fn()}
      />
    );
    act(() => {
      fireEvent.click(screen.getByRole('radio', { name: /substitute/i }));
    });
  };

  it('de-dupes a manually-typed email against a differently-cased existing entry', () => {
    openSubstituteMode();

    const input = screen.getByPlaceholderText('name@orono.k12.mn.us');
    fireEvent.change(input, { target: { value: 'Sub@Orono.K12.MN.US' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.change(input, { target: { value: 'SUB@ORONO.K12.MN.US' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    // Exactly one entry, stored lowercased — not two case-variant duplicates.
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['sub@orono.k12.mn.us']);
  });

  it('de-dupes a preset-chip click against an already-added differently-cased entry', () => {
    usePresetSubEmailsMock.mockReturnValue({
      emails: ['sub@orono.k12.mn.us'],
    });
    openSubstituteMode();

    const input = screen.getByPlaceholderText('name@orono.k12.mn.us');
    fireEvent.change(input, { target: { value: 'Sub@Orono.K12.MN.US' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    // Preset chip for the lowercase form of the same mailbox.
    fireEvent.click(
      screen.getByRole('button', { name: 'sub@orono.k12.mn.us' })
    );

    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['sub@orono.k12.mn.us']);
  });

  // Regression: the preset chip rendered the raw Firestore-stored casing
  // (`{email}`) while the added-emails list always shows the lowercased,
  // normalized form — a legacy uppercase-cased preset looked like a
  // different address than its own entry in the added list once clicked.
  it('renders the preset chip label lowercased, matching the normalized stored value', () => {
    usePresetSubEmailsMock.mockReturnValue({
      emails: ['Sub@Orono.K12.MN.US'],
    });
    openSubstituteMode();

    expect(
      screen.getByRole('button', { name: 'sub@orono.k12.mn.us' })
    ).toBeInTheDocument();
  });
});
