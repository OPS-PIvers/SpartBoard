import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViewAsContextValue } from '@/context/ViewAsContextValue';

let viewAs: ViewAsContextValue | null = null;
vi.mock('@/context/useViewAs', () => ({ useViewAs: () => viewAs }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { displayName: 'Jane Doe' }, orgId: 'orono' }),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  onSnapshot: vi.fn(() => () => undefined),
}));

import { ViewAsBanner } from './ViewAsBanner';
import { formatLastActive } from '@/utils/viewAsFormat';
import { updateViewAsTabState } from '@/utils/viewAsTab';
import {
  publishViewAsLocalBoards,
  reconcileViewAsSnapshot,
  resetViewAsWorkingCopy,
} from '@/utils/viewAsBoards';
import type { Dashboard } from '@/types';

const base = (over: Partial<ViewAsContextValue> = {}): ViewAsContextValue => ({
  sid: 's1',
  targetUid: 'u1',
  targetEmail: 'jane@orono.k12.mn.us',
  adminTarget: false,
  expiresAt: Date.now() + 60 * 60 * 1000,
  readOnly: true,
  renew: vi.fn().mockResolvedValue(undefined),
  unlock: vi.fn().mockResolvedValue(undefined),
  end: vi.fn().mockResolvedValue(undefined),
  ...over,
});

describe('formatLastActive', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');
  it('reads plainly at each scale', () => {
    expect(formatLastActive(0, now)).toBe('No recent activity');
    expect(formatLastActive(now - 20_000, now)).toBe('Active just now');
    expect(formatLastActive(now - 7 * 60_000, now)).toBe('Active 7 min ago');
    expect(formatLastActive(now - 3 * 3_600_000, now)).toBe('Active 3 h ago');
    expect(formatLastActive(now - 3 * 86_400_000, now)).toMatch(/^Active /);
  });
});

describe('ViewAsBanner', () => {
  beforeEach(() => {
    updateViewAsTabState({ blockedNotice: 0 });
  });

  it('renders nothing outside a view-as tab', () => {
    viewAs = null;
    const { container } = render(<ViewAsBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the target, shows read-only and Exit, and hides Renew early on', () => {
    viewAs = base();
    render(<ViewAsBanner />);
    expect(screen.getByTestId('view-as-banner')).toHaveTextContent(
      'Viewing as Jane Doe'
    );
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Renew' })).toBeNull();
  });

  it('offers Renew in the last five minutes and calls it', async () => {
    const renew = vi.fn().mockResolvedValue(undefined);
    viewAs = base({ expiresAt: Date.now() + 4 * 60_000, renew });
    render(<ViewAsBanner />);
    expect(screen.getByText('Ends in 4 min')).toBeInTheDocument();
    await act(async () => {
      screen.getByRole('button', { name: 'Renew' }).click();
      await Promise.resolve();
    });
    expect(renew).toHaveBeenCalled();
  });

  it('shows the View-only notice once a write is blocked', () => {
    viewAs = base();
    render(<ViewAsBanner />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => updateViewAsTabState({ blockedNotice: 1 }));
    expect(screen.getByRole('status')).toHaveTextContent('View-only');
  });

  it('unlocks with a reason, and never offers unlock for an admin target', async () => {
    const unlock = vi.fn().mockResolvedValue(undefined);
    viewAs = base({ adminTarget: true, unlock });
    const { rerender } = render(<ViewAsBanner />);
    expect(screen.queryByRole('button', { name: 'Unlock edits' })).toBeNull();

    viewAs = base({ unlock });
    rerender(<ViewAsBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Unlock edits' }));
    const submit = screen.getByRole('button', { name: 'Unlock' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: '  Fix her clock  ' },
    });
    await act(async () => {
      fireEvent.click(submit);
      await Promise.resolve();
    });
    expect(unlock).toHaveBeenCalledWith('Fix her clock');
  });

  it('lists pending changes and keeps Approve off while read-only', () => {
    resetViewAsWorkingCopy();
    const board = {
      id: 'b1',
      name: 'Period 1',
      background: '',
      createdAt: 1,
      widgets: [
        {
          id: 'w1',
          type: 'clock',
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          xProp: 0.1,
          z: 1,
          flipped: false,
          config: {},
        },
      ],
    } as unknown as Dashboard;
    reconcileViewAsSnapshot([board], []);
    viewAs = base();
    render(<ViewAsBanner />);
    expect(screen.queryByTestId('view-as-pending-toggle')).toBeNull();
    act(() =>
      publishViewAsLocalBoards([
        { ...board, widgets: [{ ...board.widgets[0], xProp: 0.5 }] },
      ])
    );
    fireEvent.click(screen.getByTestId('view-as-pending-toggle'));
    expect(screen.getByTestId('view-as-pending-toggle')).toHaveTextContent(
      'Pending changes (1)'
    );
    expect(screen.getByTestId('view-as-pending-panel')).toHaveTextContent(
      'Period 1'
    );
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });
});
