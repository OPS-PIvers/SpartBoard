import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { HelpResourceItem } from '@/types/helpCenter';
import { SubsHelpButton } from './SubsHelpButton';

const auth = vi.hoisted(() => ({
  isAdmin: false,
  features: new Set<string>(['subs-live-tours']),
}));
const help = vi.hoisted(() => ({
  items: [] as HelpResourceItem[],
  audience: undefined as string | undefined,
  runnable: new Set<string>(),
}));
const tours = vi.hoisted(() => ({
  start: vi.fn(),
  record: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    isAdmin: auth.isAdmin,
    canAccessFeature: (id: string) => auth.features.has(id),
  }),
}));
vi.mock('@/hooks/useHelpResources', () => ({
  useHelpResources: (opts: { audience?: string }) => {
    help.audience = opts.audience;
    return { items: help.items, categories: [], loading: false, error: null };
  },
  incrementHelpOpenCount: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/components/tours/useTourOffers', () => ({
  useRunnableTourIds: () => help.runnable,
}));
vi.mock('@/components/tours/tourState', () => ({
  requestStartTour: tours.start,
  requestRecordTour: tours.record,
}));

const item = (id: string, setId: string): HelpResourceItem => ({
  id,
  kind: 'guided-learning',
  title: `Tour ${id}`,
  description: '',
  categoryId: 'getting-started',
  order: 0,
  visible: true,
  orgId: null,
  widgetTypes: [],
  url: null,
  embedType: null,
  setId,
  openCount: 0,
  createdBy: 'u',
  createdByEmail: '',
  createdAt: 0,
  updatedAt: 0,
  audience: 'subs',
});

beforeEach(() => {
  auth.isAdmin = false;
  auth.features = new Set(['subs-live-tours']);
  help.items = [item('a', 'set-a'), item('b', 'set-b')];
  help.runnable = new Set(['set-a']);
  tours.start.mockClear();
  tours.record.mockClear();
});

describe('SubsHelpButton', () => {
  it('lists only the runnable substitute tours and starts one', () => {
    render(<SubsHelpButton variant="header" />);
    expect(help.audience).toBe('subs');
    fireEvent.click(screen.getByRole('button', { name: /help/i }));
    expect(screen.getByRole('menuitem', { name: 'Tour a' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Tour b' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /record/i })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tour a' }));
    expect(tours.start).toHaveBeenCalledWith({ setId: 'set-a' });
  });

  it('gives admins Record a tour, even with no tours yet', () => {
    auth.isAdmin = true;
    help.items = [];
    render(<SubsHelpButton variant="board" />);
    fireEvent.click(screen.getByRole('button', { name: /help/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /record a tour/i }));
    expect(tours.record).toHaveBeenCalledWith('subs');
  });

  it('shows nothing to a sub when there are no tours', () => {
    help.items = [];
    const { container } = render(<SubsHelpButton variant="header" />);
    expect(container.innerHTML).toBe('');
  });

  it('shows nothing while the flag is off, even to admins', () => {
    auth.isAdmin = true;
    auth.features = new Set();
    const { container } = render(<SubsHelpButton variant="header" />);
    expect(container.innerHTML).toBe('');
  });
});
