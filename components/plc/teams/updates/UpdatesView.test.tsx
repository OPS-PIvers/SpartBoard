import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PlcUpdate } from '@/types';
import { UpdatesView, type UpdatesViewProps } from './UpdatesView';

const upd = (id: string, extra: Partial<PlcUpdate> = {}): PlcUpdate => ({
  id,
  title: `Title ${id}`,
  body: 'Body',
  requiresAck: false,
  inDigest: true,
  pinned: false,
  reactions: {},
  authorUid: 'lead',
  authorName: 'Erin Walsh',
  createdAt: new Date(2026, 9, 6).getTime(),
  updatedAt: 0,
  ...extra,
});

const props = (over: Partial<UpdatesViewProps> = {}): UpdatesViewProps => ({
  updates: [upd('a'), upd('b', { requiresAck: true })],
  isLead: false,
  myUid: 'me',
  myAcks: {},
  rosters: {},
  onPost: vi.fn(() => Promise.resolve()),
  onReact: vi.fn(),
  onAck: vi.fn(),
  onPin: vi.fn(),
  onDelete: vi.fn(),
  ...over,
});

describe('UpdatesView', () => {
  it('a member reads, reacts and acknowledges but cannot post or manage', () => {
    const p = props();
    render(<UpdatesView {...p} onPost={undefined} />);
    expect(
      screen.queryByRole('textbox', { name: 'Post an update' })
    ).toBeNull();
    expect(screen.queryByLabelText('Update options')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(p.onAck).toHaveBeenCalledWith('b');
    fireEvent.click(screen.getAllByRole('button', { name: '0 reactions' })[0]);
    expect(p.onReact).toHaveBeenCalledWith('a', true);
  });

  it('shows the date a member acknowledged', () => {
    render(
      <UpdatesView
        {...props({ myAcks: { b: new Date(2026, 9, 7).getTime() } })}
      />
    );
    expect(screen.getByText('Acknowledged Oct 7')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
  });

  it('a lead posts with the first line as the title', async () => {
    const p = props({ isLead: true });
    render(<UpdatesView {...p} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Post an update' }), {
      target: { value: 'Fire drill\nNorth stairs' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() =>
      expect(p.onPost).toHaveBeenCalledWith({
        title: 'Fire drill',
        body: 'North stairs',
        requiresAck: false,
        inDigest: true,
      })
    );
  });

  it('a lead sees who has and has not acknowledged', () => {
    render(
      <UpdatesView
        {...props({
          isLead: true,
          rosters: {
            b: {
              total: 3,
              acknowledged: [{ uid: 'x', name: 'Ann', ackedAt: 1 }],
              notYet: [
                { uid: 'y', name: 'Ben' },
                { uid: 'z', name: 'Cy' },
              ],
            },
          },
        })}
      />
    );
    expect(screen.getByText('1 of 3')).toBeTruthy();
    expect(screen.getByText('Not yet · 2')).toBeTruthy();
    expect(screen.getByText('Ben')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByText('Ben')).toBeNull();
  });

  it('a lead pins from the options menu', () => {
    const p = props({ isLead: true });
    render(<UpdatesView {...p} />);
    fireEvent.click(screen.getAllByLabelText('Update options')[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pin' }));
    expect(p.onPin).toHaveBeenCalledWith('a', true);
  });

  it('filters to updates that need acknowledgement', () => {
    render(<UpdatesView {...props()} />);
    fireEvent.change(screen.getByLabelText('Filter updates'), {
      target: { value: 'ack' },
    });
    expect(screen.queryByText('Title a')).toBeNull();
    expect(screen.getByText('Title b')).toBeTruthy();
  });
});

describe('UpdatesView edit failure', () => {
  it('stays in edit mode with the text when saving fails', async () => {
    const onEdit = vi.fn(() => Promise.reject(new Error('offline')));
    render(<UpdatesView {...props({ isLead: true, onEdit })} />);
    fireEvent.click(screen.getAllByLabelText('Update options')[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onEdit).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled
      ).toBe(false)
    );
    expect(screen.getByDisplayValue(/Title a/)).toBeTruthy();
  });
});
