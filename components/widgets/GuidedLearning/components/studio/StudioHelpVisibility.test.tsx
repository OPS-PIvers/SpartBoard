import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HelpResourceItem } from '@/types/helpCenter';
import { StudioHelpVisibility } from './StudioHelpVisibility';

const h = vi.hoisted(() => ({
  items: [] as Partial<HelpResourceItem>[],
  loading: false,
  updateDoc: vi.fn<(ref: { id: string }, data: unknown) => Promise<void>>(() =>
    Promise.resolve()
  ),
}));

vi.mock('@/config/firebase', () => ({ db: {}, isConfigured: true }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _coll: string, id: string) => ({ id }),
  updateDoc: h.updateDoc,
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'admin@school.org' },
    userRoles: { superAdmins: [] },
    orgId: 'orono',
    roleId: 'domain_admin',
  }),
}));
vi.mock('@/hooks/useHelpResources', () => ({
  useHelpResources: () => ({ items: h.items, loading: h.loading }),
}));

const item = (over: Partial<HelpResourceItem>): Partial<HelpResourceItem> => ({
  id: 'i1',
  kind: 'guided-learning',
  setId: 'tour-1',
  visible: false,
  ...over,
});

beforeEach(() => {
  h.items = [];
  h.loading = false;
  h.updateDoc.mockClear();
});

describe('StudioHelpVisibility', () => {
  it('says the tour is not in Help when no item links it', () => {
    h.items = [item({ setId: 'other' })];
    render(<StudioHelpVisibility setId="tour-1" published />);
    expect(screen.getByText(/Not in Help yet/)).toBeInTheDocument();
  });

  it('shows every hidden linked item in Help with one click once published', async () => {
    h.items = [
      item({ id: 'a' }),
      item({ id: 'b' }),
      item({ id: 'c', visible: true }),
    ];
    render(<StudioHelpVisibility setId="tour-1" published />);
    fireEvent.click(screen.getByRole('button', { name: 'Show in Help' }));
    await waitFor(() => expect(h.updateDoc).toHaveBeenCalledTimes(2));
    expect(h.updateDoc.mock.calls.map(([ref]) => ref.id)).toEqual(['a', 'b']);
    expect(h.updateDoc.mock.calls[0][1]).toMatchObject({ visible: true });
  });

  it('asks to publish first while the tour is a draft', () => {
    h.items = [item({})];
    render(<StudioHelpVisibility setId="tour-1" published={false} />);
    expect(
      screen.getByText(/Publish the tour, then show it/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show in Help' })).toBeNull();
  });

  it('confirms when every linked item is visible', () => {
    h.items = [item({ visible: true })];
    render(<StudioHelpVisibility setId="tour-1" published />);
    expect(screen.getByText(/Shown in Help/)).toBeInTheDocument();
  });

  it('reports a failed write', async () => {
    h.items = [item({})];
    h.updateDoc.mockRejectedValueOnce(new Error('denied'));
    render(<StudioHelpVisibility setId="tour-1" published />);
    fireEvent.click(screen.getByRole('button', { name: 'Show in Help' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Couldn't show it in Help/
    );
  });
});
