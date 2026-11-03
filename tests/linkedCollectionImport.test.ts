import { describe, it, expect } from 'vitest';
import { linkedBoardFromShare } from '@/utils/linkedCollectionImport';
import type { Dashboard } from '@/types';

const entry = { shareId: 'sh1', name: 'Board', order: 0 };
const opts = {
  uid: 'u1',
  role: 'collaborator' as const,
  fallbackName: 'Untitled',
  order: 3,
};
const base: Dashboard = {
  id: 'orig',
  name: 'Board',
  background: 'bg',
  widgets: [],
  createdAt: 1,
};

describe('linkedBoardFromShare connections', () => {
  it('carries connections with every sequence run cleared', () => {
    const snap: Dashboard = {
      ...base,
      connections: [
        {
          id: 'seq',
          kind: 'sequence',
          steps: [{ id: 's1', actions: [] }],
          repeat: 'once',
          run: { deviceId: 'd', stepIndex: 1, stepStartedAt: 2, loops: 0 },
        },
        { id: 'f', kind: 'follow', leaderId: 'a', followerId: 'b' },
      ],
    };
    const board = linkedBoardFromShare(entry, snap, opts);
    expect(board.connections).toHaveLength(2);
    expect(board.connections?.[0]).toMatchObject({ id: 'seq', run: null });
    expect(board.connections?.[1]).toMatchObject({ id: 'f', kind: 'follow' });
    expect(snap.connections?.[0]).toMatchObject({ run: { deviceId: 'd' } });
  });

  it('omits connections when the share has none or an empty list', () => {
    expect(linkedBoardFromShare(entry, base, opts)).not.toHaveProperty(
      'connections'
    );
    expect(
      linkedBoardFromShare(entry, { ...base, connections: [] }, opts)
    ).not.toHaveProperty('connections');
  });
});
