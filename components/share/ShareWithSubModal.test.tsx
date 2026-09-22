import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
  waitFor,
} from '@testing-library/react';

// Ported from ShareLinkCreatorModal.test.tsx when substitute mode moved into
// this dialog (docs/plans/SUB_SHARE_COLLECTIONS.md §3.2). The sub-email
// regressions guarded there are this component's now: every other "add an
// email" call site in the app lowercases before storing and de-duping, because
// `.includes()` and Firestore array membership are case-sensitive, and the
// de-dupe has to happen inside the functional updater or a double-click
// appends twice.

vi.mock('lucide-react', () => {
  function icon(name: string) {
    const Stub = (props: React.HTMLAttributes<HTMLSpanElement>) =>
      React.createElement('span', { 'data-icon': name, ...props });
    Stub.displayName = name;
    return Stub;
  }
  return new Proxy(
    {},
    {
      get(target: Record<string, unknown>, prop) {
        if (prop === '__esModule') return true;
        if (prop === 'then') return undefined;
        if (typeof prop === 'string' && !(prop in target)) {
          target[prop] = icon(prop);
        }
        return target[prop as string];
      },
    }
  );
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? _key,
  }),
}));

const shareSubstituteCollection = vi.fn((_input: unknown) =>
  Promise.resolve('share-1')
);
const updateSubstituteCollectionShare = vi.fn((_input: unknown) =>
  Promise.resolve()
);
const addToast = vi.fn();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    // The board flows in as the dialog's `target`; this list only matters to
    // the collection path.
    dashboards: [],
    collectionsApi: { collections: [] },
    rosters: [],
    activeRosterId: null,
    addToast,
    shareSubstituteCollection,
    updateSubstituteCollectionShare,
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ selectedBuildings: ['high'], hasOrg: true }),
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [{ id: 'high', name: 'High School' }],
}));

// usePresetSubEmails normalizes (trim + lowercase) at its own source — see
// tests/hooks/usePresetSubEmails.test.ts. This mock returns a canonical value,
// matching the real hook's contract.
const usePresetSubEmailsMock = vi.fn(() => ({
  emails: ['sub@orono.k12.mn.us'] as string[],
  loading: false,
}));
vi.mock('@/hooks/usePresetSubEmails', () => ({
  usePresetSubEmails: () => usePresetSubEmailsMock(),
}));

import { ShareWithSubModal } from '@/components/share/ShareWithSubModal';
import type { Dashboard, SharedCollection } from '@/types';

const board: Dashboard = {
  id: 'dash-1',
  name: 'Period 3',
  background: 'bg-slate-900',
  widgets: [],
  createdAt: 1_700_000_000_000,
};

const openModal = (existingShares: SharedCollection[] = []) =>
  render(
    <ShareWithSubModal
      isOpen
      target={{ kind: 'board', dashboard: board }}
      existingShares={existingShares}
      onClose={vi.fn()}
    />
  );

const otherBoard: Dashboard = {
  id: 'dash-2',
  name: 'Period 5',
  background: 'bg-slate-900',
  widgets: [],
  createdAt: 1_700_000_000_000,
};

const addEmail = (value: string) => {
  fireEvent.change(screen.getByPlaceholderText('name@orono.k12.mn.us'), {
    target: { value },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
};

/** The emails the dialog would write, read off the share call. */
const savedEmails = (): string[] | undefined =>
  (
    shareSubstituteCollection.mock.calls[0]?.[0] as {
      subEmails?: string[];
    }
  )?.subEmails;

describe('ShareWithSubModal — sub emails', () => {
  beforeEach(() => {
    usePresetSubEmailsMock.mockReturnValue({
      emails: ['sub@orono.k12.mn.us'],
      loading: false,
    });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    });
  });

  afterEach(() => {
    usePresetSubEmailsMock.mockReset();
    shareSubstituteCollection.mockClear();
    updateSubstituteCollectionShare.mockClear();
    addToast.mockClear();
    cleanup();
  });

  it('lowercases a typed email and de-dupes it against a differently-cased entry', () => {
    openModal();

    addEmail('Cover@Orono.K12.MN.US');
    addEmail('COVER@ORONO.K12.MN.US');

    // Scoped to `listitem` so the preset chip (also labeled with an email) is
    // never counted here.
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['cover@orono.k12.mn.us']);
  });

  it('does not duplicate an entry when Add is clicked twice before a re-render', () => {
    openModal();

    fireEvent.change(screen.getByPlaceholderText('name@orono.k12.mn.us'), {
      target: { value: 'cover@orono.k12.mn.us' },
    });
    const addButton = screen.getByRole('button', { name: 'Add' });
    // Both clicks in one act() batch React's updates, so the second handler
    // reads the same pre-click state as the first — the double-click race.
    act(() => {
      fireEvent.click(addButton);
      fireEvent.click(addButton);
    });

    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['cover@orono.k12.mn.us']);
  });

  it('rejects an email outside the district domain', () => {
    openModal();

    addEmail('someone@gmail.com');

    expect(screen.getByText('Must end with @orono.k12.mn.us')).toBeTruthy();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('offers no chip for a preset that fails domain validation', () => {
    usePresetSubEmailsMock.mockReturnValue({
      emails: ['not-an-orono-email@gmail.com'],
      loading: false,
    });
    openModal();

    expect(
      screen.queryByRole('button', { name: 'not-an-orono-email@gmail.com' })
    ).toBeNull();
  });

  it("starts with the building's sub accounts ticked and saves them", async () => {
    openModal();

    const chip = screen.getByRole('button', { name: 'sub@orono.k12.mn.us' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => expect(shareSubstituteCollection).toHaveBeenCalled());
    expect(savedEmails()).toEqual(['sub@orono.k12.mn.us']);
  });

  it('un-ticks a preset the teacher does not want', async () => {
    openModal();

    fireEvent.click(
      screen.getByRole('button', { name: 'sub@orono.k12.mn.us' })
    );
    expect(
      screen
        .getByRole('button', { name: 'sub@orono.k12.mn.us' })
        .getAttribute('aria-pressed')
    ).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => expect(shareSubstituteCollection).toHaveBeenCalled());
    expect(savedEmails()).toBeUndefined();
  });
});

describe('ShareWithSubModal — an existing share', () => {
  const existing: SharedCollection = {
    shareId: 'share-existing',
    hostUid: 'host-1',
    hostDisplayName: 'Teacher',
    intendedMode: 'substitute',
    collection: { name: 'Period 3' },
    boardIds: [board.id],
    createdAt: 1_700_000_000_000,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    buildingId: 'high',
    subEmails: ['named@orono.k12.mn.us'],
    kind: 'board',
    sourceId: board.id,
  };

  beforeEach(() => {
    usePresetSubEmailsMock.mockReturnValue({
      emails: ['sub@orono.k12.mn.us'],
      loading: false,
    });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    });
  });

  afterEach(() => {
    usePresetSubEmailsMock.mockReset();
    shareSubstituteCollection.mockClear();
    updateSubstituteCollectionShare.mockClear();
    addToast.mockClear();
    cleanup();
  });

  // A second share of the same board would leave the sub choosing between two
  // links, so the dialog updates the live one instead.
  it('updates the live share rather than creating a second one', async () => {
    openModal([existing]);

    expect(screen.getByText(/You already share this with a sub/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Update the share' }));

    await waitFor(() =>
      expect(updateSubstituteCollectionShare).toHaveBeenCalled()
    );
    expect(shareSubstituteCollection).not.toHaveBeenCalled();
    const input = updateSubstituteCollectionShare.mock.calls[0]?.[0] as {
      shareId: string;
      subEmails?: string[];
    };
    expect(input.shareId).toBe('share-existing');
    // The sub the teacher already named stays named.
    expect(input.subEmails).toEqual(['named@orono.k12.mn.us']);
  });

  // Taking every named sub off is an edit like any other; it used to read as
  // "left alone" downstream, so the sub stayed on the share.
  it('sends an empty list when the teacher takes every sub off', async () => {
    openModal([existing]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove email' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update the share' }));

    await waitFor(() =>
      expect(updateSubstituteCollectionShare).toHaveBeenCalled()
    );
    const input = updateSubstituteCollectionShare.mock.calls[0]?.[0] as {
      subEmails?: string[];
    };
    expect(input.subEmails).toEqual([]);
  });

  it('keeps the share on the building it was created for', () => {
    openModal([existing]);

    expect(screen.getByLabelText('Building')).toBeDisabled();
  });
});

describe('ShareWithSubModal — opening it again', () => {
  beforeEach(() => {
    usePresetSubEmailsMock.mockReturnValue({
      emails: ['sub@orono.k12.mn.us'],
      loading: false,
    });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    });
  });

  afterEach(() => {
    usePresetSubEmailsMock.mockReset();
    shareSubstituteCollection.mockClear();
    updateSubstituteCollectionShare.mockClear();
    addToast.mockClear();
    cleanup();
  });

  // The Boards screen keeps one dialog around, so the second board must not
  // open on the first board's "here is the link" screen.
  it('shows the form again when it opens on another board', async () => {
    const view = render(
      <ShareWithSubModal
        isOpen
        target={{ kind: 'board', dashboard: board }}
        existingShares={[]}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Sub share link')).toBeTruthy()
    );

    view.rerender(
      <ShareWithSubModal
        isOpen
        target={{ kind: 'board', dashboard: otherBoard }}
        existingShares={[]}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByLabelText('Sub share link')).toBeNull();
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy();
  });

  // "same end time unless you change it" has to be true: the field starts on
  // the share's real expiry, not 48 hours from whenever the dialog mounted.
  it('starts on the end time the live share already has', () => {
    const expiresAt = Date.UTC(2026, 9, 9, 15, 30);
    render(
      <ShareWithSubModal
        isOpen
        target={{ kind: 'board', dashboard: board }}
        existingShares={[
          {
            shareId: 'share-existing',
            hostUid: 'host-1',
            hostDisplayName: 'Teacher',
            intendedMode: 'substitute',
            collection: { name: 'Period 3' },
            boardIds: [board.id],
            createdAt: 1_700_000_000_000,
            expiresAt,
            buildingId: 'high',
            kind: 'board',
            sourceId: board.id,
          },
        ]}
        onClose={vi.fn()}
      />
    );

    const field = screen.getByLabelText<HTMLInputElement>('Ends');
    const local = new Date(expiresAt);
    const pad = (n: number) => String(n).padStart(2, '0');
    expect(field.value).toBe(
      `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(
        local.getDate()
      )}T${pad(local.getHours())}:${pad(local.getMinutes())}`
    );
  });

  // The presets arrive from Firestore a beat after the first render.
  it('ticks the building presets when they arrive after the first render', async () => {
    usePresetSubEmailsMock.mockReturnValue({ emails: [], loading: true });
    const view = render(
      <ShareWithSubModal
        isOpen
        target={{ kind: 'board', dashboard: board }}
        existingShares={[]}
        onClose={vi.fn()}
      />
    );

    usePresetSubEmailsMock.mockReturnValue({
      emails: ['sub@orono.k12.mn.us'],
      loading: false,
    });
    view.rerender(
      <ShareWithSubModal
        isOpen
        target={{ kind: 'board', dashboard: board }}
        existingShares={[]}
        onClose={vi.fn()}
      />
    );

    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'sub@orono.k12.mn.us' })
          .getAttribute('aria-pressed')
      ).toBe('true')
    );
  });
});

describe('ShareWithSubModal — how long it runs', () => {
  beforeEach(() => {
    usePresetSubEmailsMock.mockReturnValue({ emails: [], loading: false });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    });
  });

  afterEach(() => {
    usePresetSubEmailsMock.mockReset();
    shareSubstituteCollection.mockClear();
    addToast.mockClear();
    cleanup();
  });

  it('writes nothing when the end time is past the 14-day cap', async () => {
    openModal();

    const far = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    fireEvent.change(screen.getByLabelText('Ends'), {
      target: {
        value:
          `${far.getFullYear()}-${pad(far.getMonth() + 1)}-${pad(far.getDate())}` +
          `T${pad(far.getHours())}:${pad(far.getMinutes())}`,
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        'A sub share can run for at most 14 days.',
        'error'
      )
    );
    expect(shareSubstituteCollection).not.toHaveBeenCalled();
  });

  it('writes nothing when the end time is already past', async () => {
    openModal();

    fireEvent.change(screen.getByLabelText('Ends'), {
      target: { value: '2020-01-01T08:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        'Pick an end time in the future.',
        'error'
      )
    );
    expect(shareSubstituteCollection).not.toHaveBeenCalled();
  });
});

// A widget whose content could not be collected reaches the sub empty, so the
// teacher has to be told at share time — that is the whole point of bundling.
describe('ShareWithSubModal — what could not be collected', () => {
  beforeEach(() => {
    shareSubstituteCollection.mockClear();
    addToast.mockClear();
    usePresetSubEmailsMock.mockReturnValue({
      emails: ['sub@orono.k12.mn.us'],
      loading: false,
    });
    cleanup();
  });

  const share = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(shareSubstituteCollection).toHaveBeenCalled());
  };

  it('names the widgets whose content stayed behind', async () => {
    shareSubstituteCollection.mockImplementation((input: unknown) => {
      (
        input as {
          onBundle?: (b: {
            items: unknown[];
            failures: { label: string }[];
          }) => void;
        }
      ).onBundle?.({
        items: [],
        failures: [{ label: 'Drawing on Period 3' }],
      });
      return Promise.resolve('share-1');
    });

    openModal();
    await share();

    expect(
      screen.getByText('Some widget content did not come along')
    ).toBeTruthy();
    expect(screen.getByText('Drawing on Period 3')).toBeTruthy();
  });

  it('says nothing when everything came along', async () => {
    shareSubstituteCollection.mockImplementation((input: unknown) => {
      (
        input as {
          onBundle?: (b: { items: unknown[]; failures: unknown[] }) => void;
        }
      ).onBundle?.({ items: [{ id: 'drawing_w1' }], failures: [] });
      return Promise.resolve('share-1');
    });

    openModal();
    await share();

    expect(screen.queryByText(/did not come along/)).toBeNull();
  });
});
