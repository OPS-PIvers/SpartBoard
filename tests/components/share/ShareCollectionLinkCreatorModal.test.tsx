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

  // A preset chip for an already-added mailbox is rendered `disabled` — real
  // browsers never deliver a click to a disabled button (jsdom's fireEvent
  // does, which would make a fireEvent-based "click" here a vacuous test of
  // an unreachable path). userEvent.click respects `disabled` and no-ops,
  // matching what actually happens in the browser.
  it('renders the preset chip disabled (not clickable) once its normalized value is already added', async () => {
    usePresetSubEmailsMock.mockReturnValue({
      emails: ['sub@orono.k12.mn.us'],
    });
    openSubstituteMode();

    const input = screen.getByPlaceholderText('name@orono.k12.mn.us');
    fireEvent.change(input, { target: { value: 'Sub@Orono.K12.MN.US' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    const chip = screen.getByRole('button', { name: 'sub@orono.k12.mn.us' });
    expect(chip).toBeDisabled();

    await userEvent.click(chip);

    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['sub@orono.k12.mn.us']);
  });

  // Regression (#2432 round-8 review): `disabled={added}` only blocks
  // re-adds of an already-added email — it doesn't gate a preset that fails
  // Orono-domain validation (or, pre-fix, a whitespace-only entry that
  // normalized to ''). Such a chip rendered permanently enabled while the
  // onClick guard silently no-op'd every click, with zero error feedback.
  it('renders the preset chip disabled when the preset value fails domain validation', () => {
    usePresetSubEmailsMock.mockReturnValue({
      emails: ['not-an-orono-email@gmail.com'],
    });
    openSubstituteMode();

    const chip = screen.getByRole('button', {
      name: 'not-an-orono-email@gmail.com',
    });
    expect(chip).toBeDisabled();
  });

  // Regression (#2432 review): the Collection variant of this chip always
  // rendered a Plus icon, even once `added` was true (ShareLinkCreatorModal's
  // chip correctly switches to Check). Functionality wasn't broken — the chip
  // was still disabled — but the icon lied about the chip's state.
  it('switches the preset chip icon from Plus to Check once its value is already added', () => {
    usePresetSubEmailsMock.mockReturnValue({
      emails: ['sub@orono.k12.mn.us'],
    });
    openSubstituteMode();

    const chipBeforeAdd = screen.getByRole('button', {
      name: 'sub@orono.k12.mn.us',
    });
    expect(chipBeforeAdd.querySelector('.lucide-plus')).toBeInTheDocument();
    expect(
      chipBeforeAdd.querySelector('.lucide-check')
    ).not.toBeInTheDocument();

    const input = screen.getByPlaceholderText('name@orono.k12.mn.us');
    fireEvent.change(input, { target: { value: 'Sub@Orono.K12.MN.US' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    const chipAfterAdd = screen.getByRole('button', {
      name: 'sub@orono.k12.mn.us',
    });
    expect(chipAfterAdd.querySelector('.lucide-check')).toBeInTheDocument();
    expect(chipAfterAdd.querySelector('.lucide-plus')).not.toBeInTheDocument();
  });
});
