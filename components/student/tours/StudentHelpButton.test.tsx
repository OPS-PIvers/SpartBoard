import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { HelpResourceItem } from '@/types/helpCenter';
import { StudentHelpButton } from './StudentHelpButton';

const h = vi.hoisted(() => ({
  runnable: new Set<string>(),
  start: vi.fn(),
}));
vi.mock('@/components/tours/useTourOffers', () => ({
  useRunnableTourIds: () => h.runnable,
}));
vi.mock('@/components/tours/tourState', () => ({
  requestStartTour: h.start,
}));

const item = (id: string): HelpResourceItem =>
  ({
    id,
    kind: 'guided-learning',
    title: `Tour ${id}`,
    setId: `set-${id}`,
    audience: 'students',
  }) as HelpResourceItem;

beforeEach(() => {
  h.runnable = new Set(['set-a']);
  h.start.mockClear();
});

describe('StudentHelpButton', () => {
  it('lists only runnable tours and starts one', () => {
    render(<StudentHelpButton items={[item('a'), item('b')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByRole('menuitem', { name: 'Tour a' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Tour b' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tour a' }));
    expect(h.start).toHaveBeenCalledWith({ setId: 'set-a' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows nothing when no tour can run', () => {
    h.runnable = new Set();
    const { container } = render(<StudentHelpButton items={[item('a')]} />);
    expect(container.innerHTML).toBe('');
  });
});
