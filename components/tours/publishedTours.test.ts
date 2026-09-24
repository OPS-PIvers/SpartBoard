import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';

const h = vi.hoisted(() => ({
  docs: new Map<string, unknown>(),
  loadBuildingSet: vi.fn(),
}));

const snapOf = (id: string) => ({
  exists: () => h.docs.has(id),
  data: () => h.docs.get(id),
});

vi.mock('@/config/firebase', () => ({ db: {}, isConfigured: true }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, coll: string, id: string) => ({ id, coll }),
  getDoc: (ref: { id: string }) => Promise.resolve(snapOf(ref.id)),
  setDoc: (ref: { id: string }, data: unknown) => {
    h.docs.set(ref.id, data);
    return Promise.resolve();
  },
  onSnapshot: vi.fn(),
}));
vi.mock('@/hooks/useGuidedLearning', () => ({
  loadBuildingSet: h.loadBuildingSet,
}));

import { loadRunnableTour, publishTour } from './publishedTours';

const tourSet = (label: string, extra: Partial<GuidedLearningSet> = {}) =>
  ({
    id: 'set-1',
    title: 'Boards',
    mode: 'guided',
    imageUrls: ['https://i/1.png'],
    imagePaths: ['users/a/hotspot_images/1.png'],
    steps: [
      {
        id: 's1',
        label,
        xPct: 1,
        yPct: 1,
        imageIndex: 0,
        interactionType: 'tooltip',
        tour: { anchor: 'sidebar.boards', action: 'click' },
      },
    ],
    tourSetup: { widgets: ['clock'] },
    watchPace: 'calm',
    welcomeEnabled: true,
    welcomeMessage: 'Welcome',
    createdAt: 1,
    updatedAt: 2,
    authorUid: 'u1',
    ...extra,
  }) as GuidedLearningSet;

beforeEach(() => {
  h.docs.clear();
  h.docs.set('_meta', { seededAt: 1 });
  h.loadBuildingSet.mockReset();
});

describe('publishTour', () => {
  it('writes the tour content with publishedAt, without bookkeeping fields', async () => {
    await publishTour(tourSet('Open boards'), 'admin-uid');
    const written = h.docs.get('set-1') as {
      set: Record<string, unknown>;
      publishedAt: number;
      publishedBy: string;
    };
    expect(written.publishedBy).toBe('admin-uid');
    expect(typeof written.publishedAt).toBe('number');
    expect(written.set).toMatchObject({
      id: 'set-1',
      mode: 'guided',
      watchPace: 'calm',
      welcomeMessage: 'Welcome',
      tourSetup: { widgets: ['clock'] },
    });
    expect(written.set).not.toHaveProperty('imagePaths');
    expect(written.set).not.toHaveProperty('authorUid');
    expect(written.set).not.toHaveProperty('updatedAt');
  });
});

describe('loadRunnableTour', () => {
  it('runs the published snapshot, not later Studio edits', async () => {
    await publishTour(tourSet('Published words'), 'admin-uid');
    h.loadBuildingSet.mockResolvedValue(tourSet('Unpublished edit'));
    const set = await loadRunnableTour('set-1');
    expect(set?.steps[0].label).toBe('Published words');
    expect(h.loadBuildingSet).not.toHaveBeenCalled();
  });

  it('runs the new version once it is republished', async () => {
    await publishTour(tourSet('First'), 'admin-uid');
    await publishTour(tourSet('Second'), 'admin-uid');
    expect((await loadRunnableTour('set-1'))?.steps[0].label).toBe('Second');
  });

  it('runs nothing for a never-published tour once the one-time publish ran', async () => {
    h.loadBuildingSet.mockResolvedValue(tourSet('Draft only'));
    expect(await loadRunnableTour('set-1')).toBeNull();
    expect(h.loadBuildingSet).not.toHaveBeenCalled();
  });

  it('falls back to the saved set until the one-time publish marker exists', async () => {
    h.docs.clear();
    h.loadBuildingSet.mockResolvedValue(tourSet('Legacy'));
    expect((await loadRunnableTour('set-1'))?.steps[0].label).toBe('Legacy');
  });

  it('does not fall back for a malformed published doc', async () => {
    h.docs.delete('_meta');
    h.docs.set('set-1', { set: 'nope' });
    h.loadBuildingSet.mockResolvedValue(tourSet('Legacy'));
    expect(await loadRunnableTour('set-1')).toBeNull();
  });
});
