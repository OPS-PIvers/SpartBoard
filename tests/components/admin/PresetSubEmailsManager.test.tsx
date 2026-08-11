import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
} from '@testing-library/react';

// Regression guard, same bug class as BetaUsersPanel.test.tsx ("stores beta
// user emails lowercased, matching the rest of the app"): every other
// admin-side "add an email" call site (BetaUsersPanel, GlobalPermissionsManager,
// BackgroundManager) lowercases the trimmed input before storing/deduping it,
// because Firestore array membership and downstream `.includes()` checks are
// case-sensitive. PresetSubEmailsManager (`/preset_sub_emails/{buildingId}`,
// consumed by ShareLinkCreatorModal's sub-email chip picker) was never
// updated to match — `addEmail()` stores whatever case the admin typed and
// de-dupes via a case-sensitive `draftEmails.includes(trimmed)`, so adding
// "Sub@orono.k12.mn.us" and later "sub@orono.k12.mn.us" produces two
// preset chips for the same real mailbox instead of one.

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

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'admin-1' } }),
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [
    { id: 'high', name: 'High School', gradeLevels: [], gradeLabel: '9-12' },
  ],
}));

vi.mock('@/config/firebase', () => ({ db: { __mock: 'db' } }));

interface Listener {
  next: (snap: unknown) => void;
  error: (err: unknown) => void;
}
let listeners: Listener[];

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  onSnapshot: vi.fn(
    (
      _ref: unknown,
      next: (snap: unknown) => void,
      error: (err: unknown) => void
    ) => {
      listeners.push({ next, error });
      return vi.fn();
    }
  ),
  setDoc: vi.fn().mockResolvedValue(undefined),
}));

import { PresetSubEmailsManager } from '@/components/admin/PresetSubEmailsManager';

const fakeDocSnap = (data: Record<string, unknown> | undefined) => ({
  data: () => data,
});

describe('PresetSubEmailsManager — email case handling', () => {
  beforeEach(() => {
    listeners = [];
  });

  afterEach(() => {
    cleanup();
  });

  it('stores a newly-added preset email lowercased, matching the rest of the app', () => {
    render(<PresetSubEmailsManager />);

    act(() => {
      listeners[listeners.length - 1].next(fakeDocSnap({ emails: [] }));
    });

    const input = screen.getByPlaceholderText('ohssub@orono.k12.mn.us');
    fireEvent.change(input, { target: { value: 'Sub@Orono.K12.MN.US' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(screen.getByText('sub@orono.k12.mn.us')).toBeInTheDocument();
    expect(screen.queryByText('Sub@Orono.K12.MN.US')).not.toBeInTheDocument();
  });

  it('de-dupes an existing preset email against a differently-cased new entry', () => {
    render(<PresetSubEmailsManager />);

    act(() => {
      listeners[listeners.length - 1].next(
        fakeDocSnap({ emails: ['sub@orono.k12.mn.us'] })
      );
    });

    const input = screen.getByPlaceholderText('ohssub@orono.k12.mn.us');
    fireEvent.change(input, { target: { value: 'SUB@ORONO.K12.MN.US' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    // Only one chip for the mailbox, not two case-variant duplicates.
    expect(screen.getAllByText(/sub@orono\.k12\.mn\.us/i)).toHaveLength(1);
  });

  // Regression (#2432 review): a legacy mixed-case Firestore entry used to
  // seed draftEmails as-is (raw, un-normalized). The admin would see the
  // stale casing in the list, and typing the lowercase replacement got
  // silently blocked by addEmail's case-insensitive dedup check — correct
  // dedup, but no visible cue why. Normalizing at snapshot time means the
  // draft always displays (and dedups against) the same canonical value
  // usePresetSubEmails hands to every other consumer.
  it('normalizes a legacy mixed-case Firestore entry when seeding the draft list', () => {
    render(<PresetSubEmailsManager />);

    act(() => {
      listeners[listeners.length - 1].next(
        fakeDocSnap({ emails: ['Sub@Orono.K12.MN.US'] })
      );
    });

    expect(screen.getByText('sub@orono.k12.mn.us')).toBeInTheDocument();
    expect(screen.queryByText('Sub@Orono.K12.MN.US')).not.toBeInTheDocument();
  });

  it('dedups case-variant legacy entries when seeding the draft list', () => {
    render(<PresetSubEmailsManager />);

    act(() => {
      listeners[listeners.length - 1].next(
        fakeDocSnap({
          emails: ['Sub@Orono.K12.MN.US', 'sub@orono.k12.mn.us'],
        })
      );
    });

    expect(screen.getAllByText('sub@orono.k12.mn.us')).toHaveLength(1);
  });

  // Regression (#2432 review): addEmail's dedup check read the outer
  // `draftEmails` closure, then called setDraftEmails with an unconditional
  // append — two separate operations, not one atomic update. Two Add clicks
  // dispatched before React re-renders (e.g. a double-click) both read the
  // same stale `draftEmails` snapshot, both pass the dedup check, and both
  // enqueue an append — yielding a duplicate entry. Fixed by moving the
  // dedup check inside the setDraftEmails functional updater (matches the
  // already-atomic pattern in ShareLinkCreatorModal/
  // ShareCollectionLinkCreatorModal).
  it('does not duplicate an entry when Add is clicked twice before a re-render (double-click)', () => {
    render(<PresetSubEmailsManager />);

    act(() => {
      listeners[listeners.length - 1].next(fakeDocSnap({ emails: [] }));
    });

    const input = screen.getByPlaceholderText('ohssub@orono.k12.mn.us');
    fireEvent.change(input, { target: { value: 'sub@orono.k12.mn.us' } });
    const addButton = screen.getByRole('button', { name: /add/i });
    // Both clicks inside one act() batch React's updates together, so the
    // second addEmail() call reads the same pre-click `draftEmails` state
    // as the first — reproducing the race a real double-click can hit.
    act(() => {
      fireEvent.click(addButton);
      fireEvent.click(addButton);
    });

    expect(screen.getAllByText('sub@orono.k12.mn.us')).toHaveLength(1);
  });

  // Regression (#2432 round-8 review): a whitespace-only Firestore entry
  // ('   ') trims to '', which passed the old dedup filter — the admin
  // draft list showed an invisible, permanently-enabled, inert chip.
  it('drops whitespace-only entries when seeding the draft list', () => {
    render(<PresetSubEmailsManager />);

    act(() => {
      listeners[listeners.length - 1].next(
        fakeDocSnap({ emails: ['   ', 'valid@orono.k12.mn.us'] })
      );
    });

    expect(screen.getByText('1 preset email')).toBeInTheDocument();
    expect(screen.getByText('valid@orono.k12.mn.us')).toBeInTheDocument();
  });
});
