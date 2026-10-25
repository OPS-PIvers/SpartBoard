import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  writes: [] as { path: string; data: Record<string, unknown> }[],
  deleted: [] as string[],
  afterWrite: null as null | (() => void),
}));

vi.mock('@/config/firebase', () => ({ db: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  doc: (_db: unknown, coll: string, id: string) => ({ path: `${coll}/${id}` }),
  getDoc: ({ path }: { path: string }) => {
    const data = h.docs.get(path);
    return Promise.resolve({
      exists: () => data !== undefined,
      data: () => data,
      get: (field: string) => data?.[field],
    });
  },
  setDoc: ({ path }: { path: string }, data: Record<string, unknown>) => {
    h.writes.push({ path, data });
    h.docs.set(path, data);
    h.afterWrite?.();
    return Promise.resolve();
  },
}));
vi.mock('firebase/storage', () => ({
  ref: (_s: unknown, path: string) => ({ path }),
  getBytes: vi.fn(),
  uploadBytes: vi.fn(() => Promise.resolve()),
  deleteObject: ({ path }: { path: string }) =>
    Promise.resolve(void h.deleted.push(path)),
}));

import { getBytes, uploadBytes } from 'firebase/storage';
import {
  duplicateWebTourDraft,
  isWebTourPicturePath,
  publishWebTour,
  uploadWebTourPicture,
  webTourPicturePaths,
} from './webTours';

const pic = (name: string, setId = 'w1') => ({
  web: { picture: { path: `web_tour_pictures/${setId}/${name}`, w: 1, h: 1 } },
});
const draft = (steps: unknown[]) => ({
  id: 'w1',
  title: 'Gradebook',
  mode: 'tour',
  imageUrls: [],
  steps,
});

beforeEach(() => {
  h.docs.clear();
  h.writes.length = 0;
  h.deleted.length = 0;
  h.afterWrite = null;
});

describe('web tour picture paths', () => {
  it('accepts only a file directly in the set folder', () => {
    expect(isWebTourPicturePath('w1', 'web_tour_pictures/w1/a.png')).toBe(true);
    expect(isWebTourPicturePath('w1', 'web_tour_pictures/w2/a.png')).toBe(
      false
    );
    expect(isWebTourPicturePath('w1', 'web_tour_pictures/w1/x/a.png')).toBe(
      false
    );
    expect(isWebTourPicturePath('w1', 'web_tour_pictures/w1/')).toBe(false);
    expect(isWebTourPicturePath('w1', 'users/u/hotspot_images/a.png')).toBe(
      false
    );
  });

  it('collects step pictures and ignores other sets and odd shapes', () => {
    const paths = webTourPicturePaths('w1', {
      steps: [pic('a.png'), pic('b.png', 'w2'), { web: {} }, null, {}],
    });
    expect([...paths]).toEqual(['web_tour_pictures/w1/a.png']);
  });

  it('uploads under a random name inside the set folder', async () => {
    const a = await uploadWebTourPicture('w1', new Blob(['x']), 'image/png');
    const b = await uploadWebTourPicture('w1', new Blob(['x']), 'image/webp');
    expect(isWebTourPicturePath('w1', a)).toBe(true);
    expect(a).toMatch(/\.png$/);
    expect(b).toMatch(/\.webp$/);
    expect(a).not.toBe(b);
  });

  it('refuses a set id that would leave the pictures folder', async () => {
    await expect(
      uploadWebTourPicture('w1/x', new Blob(['x']), 'image/png')
    ).rejects.toThrow('Invalid set id');
  });
});

describe('publishWebTour', () => {
  it('writes the snapshot with a top-level web surface', async () => {
    h.docs.set('building_web_tours/w1', draft([pic('a.png')]));
    await publishWebTour('w1', 'admin-uid');
    const write = h.writes.find(
      (w) => w.path === 'building_guided_learning_tours/w1'
    );
    expect(write?.data.surface).toBe('web');
    expect(write?.data.publishedBy).toBe('admin-uid');
    expect((write?.data.set as { surface?: string }).surface).toBe('web');
  });

  it('deletes only pictures the previous snapshot used that the draft dropped', async () => {
    h.docs.set('building_guided_learning_tours/w1', {
      surface: 'web',
      set: { steps: [pic('old.png'), pic('kept.png')] },
    });
    h.docs.set(
      'building_web_tours/w1',
      draft([pic('kept.png'), pic('new.png')])
    );
    await publishWebTour('w1', 'admin-uid');
    expect(h.deleted).toEqual(['web_tour_pictures/w1/old.png']);
  });

  it('keeps a picture a newer draft saved back while publishing', async () => {
    h.docs.set('building_guided_learning_tours/w1', {
      surface: 'web',
      set: { steps: [pic('old.png')] },
    });
    h.docs.set('building_web_tours/w1', draft([pic('new.png')]));
    h.afterWrite = () =>
      h.docs.set('building_web_tours/w1', draft([pic('old.png')]));
    await publishWebTour('w1', 'admin-uid');
    expect(h.deleted).toEqual([]);
  });

  it('refuses to overwrite a SpartBoard tour with the same id', async () => {
    h.docs.set('building_guided_learning_tours/w1', { set: { steps: [] } });
    h.docs.set('building_web_tours/w1', draft([]));
    await expect(publishWebTour('w1', 'admin-uid')).rejects.toThrow();
    expect(h.writes).toEqual([]);
  });

  it('runs the gate on the loaded draft and writes nothing when it throws', async () => {
    h.docs.set('building_web_tours/w1', draft([pic('a.png')]));
    const check = vi.fn(() => {
      throw new Error('unchecked step');
    });
    await expect(publishWebTour('w1', 'admin-uid', check)).rejects.toThrow(
      'unchecked step'
    );
    expect(check).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }));
    expect(h.writes).toEqual([]);
  });

  it('fails when there is no draft', async () => {
    await expect(publishWebTour('w1', 'admin-uid')).rejects.toThrow();
  });
});

describe('duplicateWebTourDraft', () => {
  it('copies pictures into the new set and saves the copy', async () => {
    vi.mocked(getBytes).mockResolvedValue(new ArrayBuffer(4));
    const copy = await duplicateWebTourDraft(
      draft([{ id: 's1', ...pic('a.png') }]) as never
    );
    expect(copy.title).toBe('Gradebook (Copy)');
    const path = copy.steps[0].web?.picture?.path ?? '';
    expect(isWebTourPicturePath(copy.id, path)).toBe(true);
    expect(h.writes.map((w) => w.path)).toEqual([
      `building_web_tours/${copy.id}`,
    ]);
  });

  it('removes the pictures it copied when one upload fails', async () => {
    vi.mocked(getBytes).mockResolvedValue(new ArrayBuffer(4));
    vi.mocked(uploadBytes)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('offline'));
    await expect(
      duplicateWebTourDraft(
        draft([
          { id: 's1', ...pic('a.png') },
          { id: 's2', ...pic('b.png') },
        ]) as never
      )
    ).rejects.toThrow('offline');
    expect(h.writes).toEqual([]);
    expect(h.deleted).toHaveLength(1);
    expect(h.deleted[0].startsWith('web_tour_pictures/')).toBe(true);
    expect(h.deleted[0]).not.toContain('/w1/');
  });
});
