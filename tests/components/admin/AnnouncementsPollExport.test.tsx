import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Regression guard: the poll-results CSV export filename must use the
// admin's LOCAL today, not toISOString()'s UTC date (same bug class already
// fixed in CalendarConfigurationModal.tsx, DraggableWindow.tsx and
// AnnotationOverlay.tsx). TZ is pinned to UTC (tests/setTz.ts), so we spy on
// the local-time Date.prototype getters to simulate an admin whose local
// date is a day ahead of the UTC date.

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: true }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'col'),
  onSnapshot: vi.fn(() => vi.fn()),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
}));

import { PollResponsesPanel } from '@/components/admin/Announcements/Widget';
import type { Announcement, PollConfig } from '@/types';

function buildAnnouncement(config: PollConfig): Announcement {
  return {
    id: 'ann-1',
    name: 'Lunch Choice',
    widgetType: 'poll',
    widgetConfig: config as unknown as Record<string, unknown>,
    widgetSize: { w: 400, h: 300 },
    maximized: false,
    activationType: 'manual',
    isActive: true,
    activatedAt: null,
    dismissalType: 'manual',
    targetBuildings: [],
    targetUsers: [],
  } as unknown as Announcement;
}

describe('PollResponsesPanel — CSV export filename timezone', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('REGRESSION: exported CSV filename uses the local date, not the UTC date', () => {
    // UTC+12 admin at local midnight 2026-06-15 (= 2026-06-14T12:00:00Z).
    // Old code: toISOString() -> "2026-06-14T12:00:00.000Z" -> "2026-06-14".
    // Fixed code: local getters -> "2026-06-15".
    vi.setSystemTime(new Date('2026-06-14T12:00:00.000Z'));
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(5);
    vi.spyOn(Date.prototype, 'getDate').mockReturnValue(15);

    vi.stubGlobal('URL', {
      ...global.URL,
      createObjectURL: vi.fn(() => 'blob:test-url'),
      revokeObjectURL: vi.fn(),
    });

    const anchors: HTMLAnchorElement[] = [];
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreateElement(tag);
      if (tag === 'a') anchors.push(el as HTMLAnchorElement);
      return el;
    });

    const announcement = buildAnnouncement({
      question: 'Lunch?',
      options: [{ id: 'opt-1', label: 'Pizza', votes: 0 }],
    });

    render(
      <PollResponsesPanel
        announcement={announcement}
        onClose={() => undefined}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));

    expect(anchors.length).toBeGreaterThan(0);
    // BUG: toISOString-based code names the file after today's UTC date
    // ("Poll_Lunch_Choice_2026-06-14.csv") — this assertion fails on the
    // pre-fix implementation and passes once getLocalIsoDate() is used.
    expect(anchors[0].download).toBe('Poll_Lunch_Choice_2026-06-15.csv');
  });
});
