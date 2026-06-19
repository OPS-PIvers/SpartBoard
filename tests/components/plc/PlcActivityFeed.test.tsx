/**
 * Unit tests for the PLC activity digest (T8).
 *
 * Covers three things the acceptance criteria call out:
 *   1. The pure `splitSinceYouWereHere` correctly partitions a newest-first
 *      activity list into "since you were here" (createdAt > lastSeenAt) and
 *      "earlier", incl. the never-visited (null cursor) case.
 *   2. `describeActivityEvent` renders an i18n'd description for EVERY
 *      PlcActivityType and distinguishes a @mention-of-self comment.
 *   3. `SinceYouWereHereCard` renders the since vs older split, and viewing
 *      PlcHome calls `markSeen()` on mount (so the sidebar badge clears).
 *
 * Mocking strategy mirrors PlcHome.test.tsx: react-i18next returns the English
 * defaultValue (with {{actor}}/{{target}}/{{count}} interpolated), and the PLC
 * store hooks are stubbed so nothing touches Firebase.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Plc, PlcActivityEvent, PlcActivityType } from '@/types';
import { MENTION_ACTIVITY_TARGET_TYPE } from '@/hooks/usePlcComments';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/** Minimal {{var}} interpolation so descriptions read like the real UI. */
function interpolate(template: string, opts?: Record<string, unknown>): string {
  if (!opts) return template;
  return template.replace(/{{\s*(\w+)\s*}}/g, (_m, name: string) => {
    const value = opts[name];
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return `{{${name}}}`;
  });
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _k: string,
      o?: { defaultValue?: string; defaultValue_plural?: string } & Record<
        string,
        unknown
      >
    ) => {
      // Pick the plural defaultValue when count != 1 and one is provided.
      const count = o?.count;
      const tmpl =
        typeof count === 'number' &&
        count !== 1 &&
        typeof o?.defaultValue_plural === 'string'
          ? o.defaultValue_plural
          : (o?.defaultValue ?? _k);
      return interpolate(tmpl, o);
    },
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'uid-self' } }),
}));

// Provider activity slice — overridden per-test via mockReturnValue.
const mockUsePlcActivity = vi.fn<() => PlcActivityEvent[]>(() => []);
vi.mock('@/context/usePlcContext', async (importActual) => {
  const actual = await importActual<typeof import('@/context/usePlcContext')>();
  return {
    ...actual,
    usePlcActivity: () => mockUsePlcActivity(),
    usePlcWhoIsHere: () => [],
    usePlcMembers: () => [],
  };
});

// usePlcUnread is exercised through PlcHome only; stub it so we can assert
// markSeen-on-mount without Firebase.
const mockMarkSeen = vi.fn(() => Promise.resolve());
const mockUsePlcUnread = vi.fn(() => ({
  lastSeenAt: 1000 as number | null,
  unreadCount: 0,
  markSeen: mockMarkSeen,
  loading: false,
}));
vi.mock('@/hooks/usePlcUnread', () => ({
  usePlcUnread: (...args: unknown[]) =>
    mockUsePlcUnread(...(args as Parameters<typeof mockUsePlcUnread>)),
}));

// PlcHome's other cards pull their own data hooks — stub them inert.
vi.mock('@/hooks/usePlcAssignmentIndex', () => ({
  usePlcAssignmentIndex: () => ({ entries: [], loading: false, error: null }),
}));
vi.mock('@/hooks/usePlcContributions', () => ({
  usePlcContributions: () => ({
    contributions: [],
    loading: false,
    error: null,
  }),
}));
vi.mock('@/hooks/usePlcDocs', () => ({
  usePlcDocs: () => ({
    docs: [],
    loading: false,
    error: null,
    createDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    restoreDoc: vi.fn(),
  }),
}));
vi.mock('@/hooks/usePlcQuizzes', () => ({
  usePlcQuizzes: () => ({
    quizzes: [],
    loading: false,
    error: null,
    shareQuizWithPlc: vi.fn(),
    mirrorPlcQuizHeader: vi.fn(),
    unshareQuizFromPlc: vi.fn(),
    restoreQuizInPlc: vi.fn(),
  }),
}));

import type { TFunction } from 'i18next';
import {
  describeActivityEvent,
  isMentionOfSelf,
  splitSinceYouWereHere,
} from '@/components/plc/activity/activityDescriptions';
import { SinceYouWereHereCard } from '@/components/plc/home/cards/SinceYouWereHereCard';
import { PlcHome } from '@/components/plc/home/PlcHome';

// A passthrough `t` that mirrors the react-i18next mock for the pure-fn tests:
// returns the (plural-aware) defaultValue with {{vars}} interpolated.
function fakeT(key: string, opts?: Record<string, unknown>): string {
  const count = opts?.count;
  const plural = opts?.defaultValue_plural;
  const dflt = opts?.defaultValue;
  const tmpl =
    typeof count === 'number' && count !== 1 && typeof plural === 'string'
      ? plural
      : typeof dflt === 'string'
        ? dflt
        : key;
  return interpolate(tmpl, opts);
}
const t = fakeT as unknown as TFunction;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakePlc: Plc = {
  id: 'plc-1',
  name: 'Test PLC',
  leadUid: 'uid-self',
  members: {},
  memberUids: ['uid-self'],
  memberEmails: { 'uid-self': 'me@school.edu' },
  createdAt: 1000,
  updatedAt: 2000,
};

function ev(
  id: string,
  type: PlcActivityType,
  createdAt: number,
  extra: Partial<PlcActivityEvent> = {}
): PlcActivityEvent {
  return {
    id,
    type,
    actorUid: 'uid-actor',
    actorName: 'Alice',
    createdAt,
    ...extra,
  };
}

const ALL_TYPES: PlcActivityType[] = [
  'member_joined',
  'member_left',
  'role_changed',
  'assessment_created',
  'assessment_shared',
  'assessment_results_ready',
  'meeting_held',
  'note_created',
  'comment_added',
  'item_deleted',
  'item_restored',
];

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePlcActivity.mockReturnValue([]);
  mockUsePlcUnread.mockReturnValue({
    lastSeenAt: 1000,
    unreadCount: 0,
    markSeen: mockMarkSeen,
    loading: false,
  });
});

// ---------------------------------------------------------------------------
// splitSinceYouWereHere
// ---------------------------------------------------------------------------

describe('splitSinceYouWereHere', () => {
  // newest-first, like the provider feed
  const activity = [
    ev('e3', 'note_created', 3000),
    ev('e2', 'meeting_held', 2000),
    ev('e1', 'member_joined', 1000),
  ];

  it('puts events strictly newer than the cursor in "since"', () => {
    const { since, older } = splitSinceYouWereHere(activity, 1500);
    expect(since.map((e) => e.id)).toEqual(['e3', 'e2']);
    expect(older.map((e) => e.id)).toEqual(['e1']);
  });

  it('treats an event exactly at the cursor as already seen (strict >)', () => {
    const { since, older } = splitSinceYouWereHere(activity, 2000);
    expect(since.map((e) => e.id)).toEqual(['e3']);
    expect(older.map((e) => e.id)).toEqual(['e2', 'e1']);
  });

  it('puts everything in "since" when the cursor is null (never visited)', () => {
    const { since, older } = splitSinceYouWereHere(activity, null);
    expect(since).toHaveLength(3);
    expect(older).toHaveLength(0);
  });

  it('puts everything in "older" when the cursor is past all events', () => {
    const { since, older } = splitSinceYouWereHere(activity, 9999);
    expect(since).toHaveLength(0);
    expect(older).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// describeActivityEvent
// ---------------------------------------------------------------------------

describe('describeActivityEvent', () => {
  it('produces a non-empty, interpolated description for EVERY type', () => {
    for (const type of ALL_TYPES) {
      const desc = describeActivityEvent(
        ev('x', type, 1000, { targetTitle: 'Unit 4 CFA' }),
        t,
        'uid-self'
      );
      expect(desc.length).toBeGreaterThan(0);
      // No un-interpolated placeholders leaked through.
      expect(desc).not.toContain('{{actor}}');
      expect(desc).not.toContain('{{target}}');
      // The actor name is woven into the actor-bearing descriptions.
      if (type !== 'assessment_results_ready') {
        expect(desc).toContain('Alice');
      }
    }
  });

  it('falls back to a translated actor when actorName is blank', () => {
    const desc = describeActivityEvent(
      ev('x', 'member_joined', 1000, { actorName: '   ' }),
      t,
      'uid-self'
    );
    expect(desc).toContain('Someone');
  });

  it('uses the dedicated "mentioned you" copy for a self-mention', () => {
    const mention = ev('m', 'comment_added', 1000, {
      targetType: MENTION_ACTIVITY_TARGET_TYPE,
      targetId: 'uid-self',
      targetTitle: 'thread-123',
    });
    expect(isMentionOfSelf(mention, 'uid-self')).toBe(true);
    const desc = describeActivityEvent(mention, t, 'uid-self');
    expect(desc).toContain('mentioned you');
  });

  it('does NOT treat a mention of someone else as a self-mention', () => {
    const mention = ev('m', 'comment_added', 1000, {
      targetType: MENTION_ACTIVITY_TARGET_TYPE,
      targetId: 'uid-other',
    });
    expect(isMentionOfSelf(mention, 'uid-self')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SinceYouWereHereCard
// ---------------------------------------------------------------------------

describe('SinceYouWereHereCard', () => {
  const activity = [
    ev('new1', 'note_created', 3000, { targetTitle: 'Fresh Note' }),
    ev('old1', 'meeting_held', 1000),
  ];

  it('renders fresh events under the since bucket and old ones under earlier', () => {
    render(
      <SinceYouWereHereCard
        plc={fakePlc}
        activity={activity}
        lastSeenAt={2000}
      />
    );
    // The new event's target renders; the badge shows the new count.
    expect(screen.getByText(/Fresh Note/)).toBeInTheDocument();
    expect(screen.getByText(/1 new/)).toBeInTheDocument();
    // The "Earlier" divider appears because there is at least one older event.
    expect(screen.getByText(/Earlier/i)).toBeInTheDocument();
  });

  it('shows the caught-up state when nothing is newer than the cursor', () => {
    render(
      <SinceYouWereHereCard
        plc={fakePlc}
        activity={activity}
        lastSeenAt={9999}
      />
    );
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
    // No new badge when caught up.
    expect(screen.queryByText(/new$/)).not.toBeInTheDocument();
  });

  it('renders a "Mentioned you" badge for a self-mention event', () => {
    const withMention = [
      ev('m', 'comment_added', 3000, {
        targetType: MENTION_ACTIVITY_TARGET_TYPE,
        targetId: 'uid-self',
      }),
    ];
    render(
      <SinceYouWereHereCard
        plc={fakePlc}
        activity={withMention}
        lastSeenAt={1000}
      />
    );
    // Both the description ("…mentioned you in a comment") and the badge
    // ("Mentioned you") carry the phrase — assert at least one matches.
    expect(screen.getAllByText(/mentioned you/i).length).toBeGreaterThan(0);
  });

  it('hides per-mention events addressed to OTHER members (no per-event spam)', () => {
    // One general comment + a mention addressed to someone else. The foreign
    // mention must NOT render or inflate the "N new" count for this viewer.
    const activity2 = [
      ev('general', 'comment_added', 3000, {
        targetType: 'comment',
        targetId: 'thread-9',
        targetTitle: 'dataCard',
      }),
      ev('foreign', 'comment_added', 3000, {
        targetType: MENTION_ACTIVITY_TARGET_TYPE,
        targetId: 'uid-other',
      }),
    ];
    render(
      <SinceYouWereHereCard
        plc={fakePlc}
        activity={activity2}
        lastSeenAt={1000}
      />
    );
    // Only the single general comment is counted (the foreign mention dropped).
    expect(screen.getByText(/1 new/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// PlcHome — markSeen on mount
// ---------------------------------------------------------------------------

describe('PlcHome since-you-were-here integration', () => {
  it('calls markSeen() on mount so the sidebar badge clears', () => {
    mockUsePlcActivity.mockReturnValue([
      ev('e1', 'note_created', 3000, { targetTitle: 'Note A' }),
    ]);
    render(<PlcHome plc={fakePlc} onNavigate={vi.fn()} />);
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);
  });

  it('passes the provider activity into usePlcUnread (single listener)', () => {
    const feed = [ev('e1', 'meeting_held', 3000)];
    mockUsePlcActivity.mockReturnValue(feed);
    render(<PlcHome plc={fakePlc} onNavigate={vi.fn()} />);
    expect(mockUsePlcUnread).toHaveBeenCalledWith(
      'plc-1',
      expect.objectContaining({ activity: feed })
    );
  });

  it('renders the frozen-cursor since digest from the activity feed', () => {
    // Cursor at 1500 → the 3000 event is "since", the 1000 event is "older".
    mockUsePlcUnread.mockReturnValue({
      lastSeenAt: 1500,
      unreadCount: 1,
      markSeen: mockMarkSeen,
      loading: false,
    });
    mockUsePlcActivity.mockReturnValue([
      ev('new', 'note_created', 3000, { targetTitle: 'Brand New Note' }),
      ev('old', 'member_joined', 1000),
    ]);
    render(<PlcHome plc={fakePlc} onNavigate={vi.fn()} />);
    // The note surfaces in BOTH the since-you-were-here digest and the
    // standalone activity feed PlcHome renders — assert it shows somewhere.
    expect(screen.getAllByText(/Brand New Note/).length).toBeGreaterThan(0);
  });
});
