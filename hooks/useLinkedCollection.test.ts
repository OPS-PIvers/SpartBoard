import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { LinkedCollection } from '@/types';
import {
  LINKED_COLLECTION_MAX_BOARDS,
  useLinkedCollection,
} from './useLinkedCollection';

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: true }));

const board = (i: number) => ({ shareId: `s${i}`, name: `B${i}`, order: i });

const setup = () => renderHook(() => useLinkedCollection()).result.current;

describe('useLinkedCollection (bypass store)', () => {
  it('creates a link with no members and the host as last editor', async () => {
    const api = setup();
    const id = await api.createLinkedCollection({
      hostUid: 'host',
      hostName: 'Host',
      mode: 'synced',
      name: '  Unit 3  ',
      boards: [board(0)],
    });
    const link = await api.loadLinkedCollection(id);
    expect(link).toMatchObject({
      linkId: id,
      name: 'Unit 3',
      participants: {},
      updatedBy: 'host',
      ended: false,
    });
  });

  it('joins with the role the mode grants', async () => {
    const api = setup();
    const synced = await api.createLinkedCollection({
      hostUid: 'host',
      hostName: null,
      mode: 'synced',
      name: 'A',
      boards: [],
    });
    const view = await api.createLinkedCollection({
      hostUid: 'host',
      hostName: null,
      mode: 'view-only',
      name: 'B',
      boards: [],
    });
    await api.joinLinkedCollection({ linkId: synced, mode: 'synced' }, 'u1');
    await api.joinLinkedCollection({ linkId: view, mode: 'view-only' }, 'u1');
    expect((await api.loadLinkedCollection(synced))?.participants.u1.role).toBe(
      'collaborator'
    );
    expect((await api.loadLinkedCollection(view))?.participants.u1.role).toBe(
      'viewer'
    );
  });

  it('notifies subscribers on update, leave and end', async () => {
    const api = setup();
    const id = await api.createLinkedCollection({
      hostUid: 'host',
      hostName: null,
      mode: 'synced',
      name: 'A',
      boards: [],
    });
    const seen: (LinkedCollection | null)[] = [];
    const unsub = api.subscribeLinkedCollection(id, (l) => seen.push(l));
    await api.joinLinkedCollection({ linkId: id, mode: 'synced' }, 'u1');
    await api.updateLinkedCollection(id, 'u1', { boards: [board(1)] });
    await api.leaveLinkedCollection(id, 'u1');
    await api.endLinkedCollection(id, 'host');
    unsub();
    const last = seen[seen.length - 1];
    expect(seen).toHaveLength(5);
    expect(last).toMatchObject({
      boards: [board(1)],
      participants: {},
      ended: true,
      updatedBy: 'host',
    });
  });

  it('rejects a board list over the cap and a blank name', async () => {
    const api = setup();
    const boards = Array.from(
      { length: LINKED_COLLECTION_MAX_BOARDS + 1 },
      (_, i) => board(i)
    );
    await expect(
      api.createLinkedCollection({
        hostUid: 'host',
        hostName: null,
        mode: 'synced',
        name: 'A',
        boards,
      })
    ).rejects.toThrow();
    await expect(
      api.updateLinkedCollection('any', 'host', { name: '   ' })
    ).rejects.toThrow();
  });
});
