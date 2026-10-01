import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ViewAsLogEntry } from './useViewAsLog';

const revertMock = vi.fn();
let entries: ViewAsLogEntry[] = [];

vi.mock('./useViewAsLog', () => ({
  useViewAsLog: () => ({
    entries,
    loading: false,
    error: false,
    hasMore: false,
  }),
  revertViewAsChange: (req: unknown) => revertMock(req) as Promise<unknown>,
}));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { ViewAsLogPanel } from './ViewAsLogPanel';
import { formatLogValue } from './formatLogValue';

const entry = (over: Partial<ViewAsLogEntry>): ViewAsLogEntry => ({
  id: 'e1',
  action: 'view_as_save',
  sid: 's1',
  email: 'boss@orono.k12.mn.us',
  targetEmail: 'jane@orono.k12.mn.us',
  path: 'users/jane/userProfile/profile',
  before: { theme: 'light' },
  after: { theme: 'dark' },
  reason: null,
  revertOf: null,
  forced: false,
  timestampMs: 1_700_000_000_000,
  ...over,
});

beforeEach(() => {
  revertMock.mockReset();
  entries = [
    entry({}),
    entry({
      id: 'e2',
      action: 'view_as_start',
      before: null,
      after: null,
      targetEmail: 'sam@orono.k12.mn.us',
      email: 'other@orono.k12.mn.us',
    }),
  ];
});

describe('ViewAsLogPanel', () => {
  it('lists entries and filters by teacher', () => {
    render(<ViewAsLogPanel />);
    expect(screen.getAllByTestId('view-as-log-row')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Teacher'), {
      target: { value: 'sam@orono.k12.mn.us' },
    });
    expect(screen.getAllByTestId('view-as-log-row')).toHaveLength(1);
    expect(screen.getByText('Opened')).toBeTruthy();
  });

  it('offers Revert only on changes that are not yet reverted', () => {
    entries.push(entry({ id: 'r1', action: 'view_as_revert', revertOf: 'e1' }));
    render(<ViewAsLogPanel />);
    expect(screen.queryByRole('button', { name: /^Revert$/ })).toBeNull();
    expect(screen.getAllByText(/^Reverted/).length).toBeGreaterThan(0);
  });

  it('shows logged and current values on conflict, then forces with what it saw', async () => {
    revertMock
      .mockResolvedValueOnce({ status: 'conflict', current: { theme: 'blue' } })
      .mockResolvedValueOnce({ status: 'reverted' });
    render(<ViewAsLogPanel />);
    fireEvent.click(screen.getByRole('button', { name: /^Revert$/ }));
    await screen.findByText('Revert anyway');
    expect(screen.getByText('Logged')).toBeTruthy();
    expect(screen.getByText('"blue"')).toBeTruthy();
    fireEvent.click(screen.getByText('Revert anyway'));
    await waitFor(() =>
      expect(revertMock).toHaveBeenLastCalledWith({
        logId: 'e1',
        force: true,
        seen: { theme: 'blue' },
      })
    );
  });

  it('says when the changed item is gone', async () => {
    revertMock.mockResolvedValueOnce({ status: 'missing' });
    render(<ViewAsLogPanel />);
    fireEvent.click(screen.getByRole('button', { name: /^Revert$/ }));
    await screen.findByText('No longer exists');
  });
});

describe('formatLogValue', () => {
  it('prints absent values and timestamps readably', () => {
    expect(formatLogValue(undefined)).toBe('(none)');
    expect(formatLogValue({ __timestamp: 0 })).toBe(
      JSON.stringify(new Date(0).toLocaleString())
    );
  });
});
