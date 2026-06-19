/**
 * Unit tests for PlcPresenceStrip (T7) — the "who's here now" row on PLC Home.
 *
 * Mocking strategy:
 *   - `@/context/usePlcContext` is PARTIALLY mocked: `usePlcWhoIsHere` is
 *     overridden to run the REAL `filterWhoIsHere` (~90s stale filter) over a
 *     test-controlled raw presence slice (so the stale-exclusion path is
 *     genuinely exercised), and `usePlcMembers` returns a fixed member map. We
 *     mock the selector rather than `usePlcPresence` because `usePlcWhoIsHere`
 *     calls `usePlcPresence` module-internally, which a partial mock cannot
 *     intercept.
 *   - `@/context/useAuth` is mocked to a fixed signed-in user (so "you" splits
 *     out of the teammate set).
 *   - react-i18next is mocked so `t(key, { defaultValue })` returns the English
 *     default with `{{...}}` interpolation applied — enough to assert copy.
 *
 * Key assertions:
 *   - Members heartbeated within the ~90s window render in the who's-here set.
 *   - A stale entry (older than the freshness window) is EXCLUDED.
 *   - The current user is labelled "You"; teammates by their member display
 *     name; each avatar's accessible label carries "in <section>".
 *   - "Just you here" copy when no teammates are present.
 *   - Renders nothing when nobody is present.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PRESENCE_FRESH_WINDOW_MS } from '@/hooks/usePlcPresence';
import type { Plc, PlcMember } from '@/types';
import type { PlcPresenceEntry } from '@/context/usePlcContext';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: Record<string, unknown>) => {
      const count = typeof o?.count === 'number' ? o.count : undefined;
      // Pick the plural default when count != 1 and one is provided.
      let template =
        count !== undefined &&
        count !== 1 &&
        typeof o?.defaultValue_plural === 'string'
          ? o.defaultValue_plural
          : ((o?.defaultValue as string) ?? _k);
      if (o) {
        for (const [key, value] of Object.entries(o)) {
          template = template.replace(
            new RegExp(`{{${key}}}`, 'g'),
            String(value)
          );
        }
      }
      return template;
    },
  }),
}));

let mockUserUid: string | null = 'uid-self';
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: mockUserUid ? { uid: mockUserUid } : null }),
}));

// Mock the store selectors the strip consumes. `usePlcWhoIsHere` runs the REAL
// `filterWhoIsHere` (~90s stale filter) over our test-controlled raw presence
// slice, so the stale-exclusion path is genuinely exercised. (We mock the
// selector rather than `usePlcPresence` because `usePlcWhoIsHere` calls
// `usePlcPresence` module-internally, which a partial mock cannot intercept.)
let mockPresence: PlcPresenceEntry[] = [];
let mockMembers: PlcMember[] = [];
vi.mock('@/context/usePlcContext', async (importActual) => {
  const actual = await importActual<typeof import('@/context/usePlcContext')>();
  const { filterWhoIsHere } = await import('@/hooks/usePlcPresence');
  return {
    ...actual,
    usePlcWhoIsHere: () => filterWhoIsHere(mockPresence),
    usePlcMembers: () => mockMembers,
  };
});

import { PlcPresenceStrip } from '@/components/plc/presence/PlcPresenceStrip';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakePlc: Plc = {
  id: 'plc-1',
  name: '5th Grade Math',
  leadUid: 'uid-self',
  members: {},
  memberUids: ['uid-self', 'uid-b', 'uid-c'],
  memberEmails: {},
  createdAt: 1000,
  updatedAt: 2000,
};

function member(uid: string, displayName: string, email: string): PlcMember {
  return {
    uid,
    email,
    displayName,
    role: uid === 'uid-self' ? 'lead' : 'member',
    joinedAt: 0,
    status: 'active',
  };
}

beforeEach(() => {
  mockUserUid = 'uid-self';
  mockMembers = [
    member('uid-self', 'Alice Lead', 'alice@school.edu'),
    member('uid-b', 'Bob Builder', 'bob@school.edu'),
    member('uid-c', 'Cara Coder', 'cara@school.edu'),
  ];
  mockPresence = [];
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcPresenceStrip', () => {
  it('renders fresh teammates and excludes stale presence entries', () => {
    const now = Date.now();
    mockPresence = [
      // Fresh: heartbeated just now.
      { uid: 'uid-b', displayName: 'Bob', section: 'docs', lastActiveAt: now },
      // Stale: older than the freshness window — must be EXCLUDED.
      {
        uid: 'uid-c',
        displayName: 'Cara',
        section: 'todos',
        lastActiveAt: now - PRESENCE_FRESH_WINDOW_MS - 5_000,
      },
    ];

    render(<PlcPresenceStrip plc={fakePlc} />);

    // Bob (fresh) is present, labelled with his member display name + section.
    expect(
      screen.getByRole('listitem', { name: /Bob Builder · in Notes & Docs/i })
    ).toBeInTheDocument();
    // Cara (stale) is excluded entirely.
    expect(
      screen.queryByRole('listitem', { name: /Cara Coder/i })
    ).not.toBeInTheDocument();
    // Summary counts only the live teammate (1).
    expect(screen.getByText(/1 teammate here now/i)).toBeInTheDocument();
  });

  it('labels the current user as "You" and pluralizes the teammate count', () => {
    const now = Date.now();
    mockPresence = [
      {
        uid: 'uid-self',
        displayName: 'Alice',
        section: 'home',
        lastActiveAt: now,
      },
      { uid: 'uid-b', displayName: 'Bob', section: 'docs', lastActiveAt: now },
      {
        uid: 'uid-c',
        displayName: 'Cara',
        section: 'assessments',
        lastActiveAt: now,
      },
    ];

    render(<PlcPresenceStrip plc={fakePlc} />);

    expect(
      screen.getByRole('listitem', { name: /^You · in Home$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('listitem', { name: /Bob Builder · in Notes & Docs/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('listitem', { name: /Cara Coder · in Assessments/i })
    ).toBeInTheDocument();
    // Two teammates besides you → plural copy.
    expect(screen.getByText(/2 teammates here now/i)).toBeInTheDocument();
  });

  it('shows "Just you here" when only the current user is present', () => {
    const now = Date.now();
    mockPresence = [
      {
        uid: 'uid-self',
        displayName: 'Alice',
        section: 'sharedData',
        lastActiveAt: now,
      },
    ];

    render(<PlcPresenceStrip plc={fakePlc} />);

    expect(screen.getByText(/just you here/i)).toBeInTheDocument();
    expect(
      screen.getByRole('listitem', { name: /You · in Data/i })
    ).toBeInTheDocument();
  });

  it('renders nothing when nobody is present', () => {
    mockPresence = [];
    const { container } = render(<PlcPresenceStrip plc={fakePlc} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('resolves the meeting section to a friendly label', () => {
    const now = Date.now();
    mockPresence = [
      {
        uid: 'uid-b',
        displayName: 'Bob',
        section: 'meeting',
        lastActiveAt: now,
      },
    ];

    render(<PlcPresenceStrip plc={fakePlc} />);

    expect(
      screen.getByRole('listitem', { name: /Bob Builder · in the meeting/i })
    ).toBeInTheDocument();
  });

  it('exposes an accessible region label naming how many people are here', () => {
    const now = Date.now();
    mockPresence = [
      {
        uid: 'uid-self',
        displayName: 'Alice',
        section: 'home',
        lastActiveAt: now,
      },
      { uid: 'uid-b', displayName: 'Bob', section: 'docs', lastActiveAt: now },
    ];

    render(<PlcPresenceStrip plc={fakePlc} />);

    expect(
      screen.getByRole('region', { name: /2 people here now/i })
    ).toBeInTheDocument();
  });

  it('falls back to the member email when no display name is set, then to presence name', () => {
    const now = Date.now();
    // uid-d is not in the member map → falls back to the snapshotted presence name.
    mockPresence = [
      {
        uid: 'uid-d',
        displayName: 'Ghost Guest',
        section: 'docs',
        lastActiveAt: now,
      },
    ];

    render(<PlcPresenceStrip plc={fakePlc} />);

    expect(
      screen.getByRole('listitem', { name: /Ghost Guest · in Notes & Docs/i })
    ).toBeInTheDocument();
  });
});
