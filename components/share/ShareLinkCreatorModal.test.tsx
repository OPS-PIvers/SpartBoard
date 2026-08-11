import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from '@testing-library/react';

// Regression guard, same bug class as PresetSubEmailsManager.test.tsx /
// BetaUsersPanel.test.tsx (#2389 / #2375): every other "add an email" call
// site in the app lowercases the trimmed input before storing/deduping it,
// because downstream `.includes()` checks and Firestore array membership are
// case-sensitive. ShareLinkCreatorModal's substitute-mode sub-email picker
// was never updated to match — both the manual `handleAddSubEmail` input and
// the preset-chip click handler dedupe via a case-sensitive
// `subEmails.includes(...)` without lowercasing, so adding
// "Sub@orono.k12.mn.us" and later "sub@orono.k12.mn.us" produces two entries
// for the same real mailbox instead of one.

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

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    shareDashboard: vi.fn(),
    shareSubstituteDashboard: vi.fn(),
    rosters: [],
    activeRosterId: null,
    addToast: vi.fn(),
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: () => true,
    selectedBuildings: ['high'],
    hasOrg: true,
  }),
}));

vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({ plcs: [] }),
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [{ id: 'high', name: 'High School' }],
}));

// Mixed-case on purpose: a legacy Firestore-stored preset with non-lowercase
// casing is exactly the scenario the chip-label-lowercasing regression test
// below needs to distinguish from an always-already-lowercase fixture.
vi.mock('@/hooks/usePresetSubEmails', () => ({
  usePresetSubEmails: () => ({
    emails: ['Sub@Orono.K12.MN.US'],
    loading: false,
  }),
}));

import { ShareLinkCreatorModal } from '@/components/share/ShareLinkCreatorModal';
import type { Dashboard } from '@/types';

const dashboard: Dashboard = {
  id: 'dash-1',
  name: 'Test Dashboard',
  background: 'bg-slate-900',
  widgets: [],
  createdAt: Date.now(),
};

const openSubstituteMode = () => {
  render(
    <ShareLinkCreatorModal dashboard={dashboard} isOpen onClose={vi.fn()} />
  );
  fireEvent.click(
    screen.getByRole('button', { name: /Substitute \(View-Only\)/ })
  );
};

describe('ShareLinkCreatorModal — substitute sub-email case handling', () => {
  afterEach(() => {
    cleanup();
  });

  it('de-dupes a manually-typed email against a differently-cased existing entry', () => {
    openSubstituteMode();

    const input = screen.getByPlaceholderText('name@orono.k12.mn.us');
    fireEvent.change(input, { target: { value: 'Sub@Orono.K12.MN.US' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.change(input, { target: { value: 'SUB@ORONO.K12.MN.US' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    // Exactly one entry in the added-emails list for the mailbox, stored
    // lowercased — not two case-variant duplicates. Scoped to `listitem`
    // so the always-present preset chip (also labeled with the email) is
    // never counted here.
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['sub@orono.k12.mn.us']);
  });

  it('de-dupes a preset-chip click against an already-added differently-cased entry', () => {
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

  // Regression: handleAddSubEmail's dedup check read the outer `subEmails`
  // closure, then called setSubEmails with an unconditional append — two
  // separate operations, not one atomic update. Two Add clicks dispatched
  // before React re-renders (e.g. a double-click) both read the same stale
  // `subEmails` snapshot, both pass the `includes` check, and both enqueue an
  // append — yielding a duplicate entry. Fixed by moving the dedup check
  // inside the setSubEmails functional updater (matches
  // ShareCollectionLinkCreatorModal's already-atomic pattern).
  it('does not duplicate an entry when Add is clicked twice before a re-render (double-click)', () => {
    openSubstituteMode();

    const input = screen.getByPlaceholderText('name@orono.k12.mn.us');
    fireEvent.change(input, { target: { value: 'sub@orono.k12.mn.us' } });
    const addButton = screen.getByRole('button', { name: 'Add' });
    // Both clicks inside one act() batch React's updates together, so the
    // second handleAddSubEmail() call reads the same pre-click `subEmails`
    // state as the first — reproducing the race a real double-click can hit.
    act(() => {
      fireEvent.click(addButton);
      fireEvent.click(addButton);
    });

    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['sub@orono.k12.mn.us']);
  });

  // Regression: preset chips rendered the raw Firestore-stored casing
  // (`{email}`) while the added-emails list always shows the lowercased,
  // normalized form — a legacy uppercase-cased preset looked like a
  // different address than its own entry in the added list once clicked.
  it('renders the preset chip label lowercased, matching the normalized stored value', () => {
    render(
      <ShareLinkCreatorModal dashboard={dashboard} isOpen onClose={vi.fn()} />
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Substitute \(View-Only\)/ })
    );

    expect(
      screen.getByRole('button', { name: 'sub@orono.k12.mn.us' })
    ).toBeInTheDocument();
  });
});
