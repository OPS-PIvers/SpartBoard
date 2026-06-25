import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ShortLink } from '@/types';

import {
  computeLinksKpis,
  LinksPanel,
} from '@/components/admin/Analytics/LinksPanel';

// Mutable hook return so each test can stage its own short-link set / loading
// / error state without remounting providers.
const hookValue: {
  links: ShortLink[];
  loading: boolean;
  error: string | null;
} = {
  links: [],
  loading: false,
  error: null,
};

vi.mock('@/hooks/useShortLinks', () => ({
  useShortLinks: () => hookValue,
}));

const makeLink = (overrides: Partial<ShortLink>): ShortLink => ({
  code: 'abc',
  destination: 'https://example.com/very/long/path',
  createdBy: 'uid-1',
  createdByEmail: 'admin@example.com',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  clicks: 0,
  lastClickedAt: null,
  ...overrides,
});

describe('computeLinksKpis', () => {
  it('sums clicks, counts recent + zero-click links', () => {
    const now = 1_000_000_000_000;
    const day = 24 * 60 * 60 * 1000;
    const links: ShortLink[] = [
      makeLink({ code: 'a', clicks: 5, createdAt: now - 1 * day }), // recent, clicked
      makeLink({ code: 'b', clicks: 10, createdAt: now - 30 * day }), // old, clicked
      makeLink({ code: 'c', clicks: 0, createdAt: now - 2 * day }), // recent, zero
      makeLink({ code: 'd', clicks: 0, createdAt: now - 100 * day }), // old, zero
    ];

    const kpis = computeLinksKpis(links, now);

    expect(kpis.totalLinks).toBe(4);
    expect(kpis.totalClicks).toBe(15);
    expect(kpis.createdLast7Days).toBe(2); // a + c
    expect(kpis.zeroClickLinks).toBe(2); // c + d
  });

  it('returns all-zero KPIs for an empty list', () => {
    expect(computeLinksKpis([], Date.now())).toEqual({
      totalLinks: 0,
      totalClicks: 0,
      createdLast7Days: 0,
      zeroClickLinks: 0,
    });
  });

  it('treats a link created exactly 7 days ago as within the window', () => {
    const now = 1_000_000_000_000;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const kpis = computeLinksKpis(
      [makeLink({ createdAt: now - sevenDays })],
      now
    );
    expect(kpis.createdLast7Days).toBe(1);
  });
});

describe('LinksPanel', () => {
  beforeEach(() => {
    hookValue.links = [];
    hookValue.loading = false;
    hookValue.error = null;
  });

  it('renders a graceful empty state when there are no links', () => {
    hookValue.links = [];
    render(<LinksPanel />);
    expect(screen.getByText('No short links yet')).toBeInTheDocument();
  });

  it('renders KPI values and the top-links table when links exist', () => {
    hookValue.links = [
      makeLink({ code: 'top', clicks: 42, lastClickedAt: Date.now() }),
      makeLink({ code: 'mid', clicks: 7, lastClickedAt: Date.now() - 1000 }),
    ];
    render(<LinksPanel />);

    // Total clicks KPI (42 + 7 = 49) is surfaced.
    expect(screen.getByText('49')).toBeInTheDocument();
    // Top link code appears in the table (top + recent tables both list it).
    expect(screen.getAllByText('/r/top').length).toBeGreaterThan(0);
  });

  it('renders an error surface when the hook reports an error', () => {
    hookValue.error = 'Failed to load short links.';
    render(<LinksPanel />);
    expect(
      screen.getByText('Failed to Load Link Analytics')
    ).toBeInTheDocument();
  });
});
