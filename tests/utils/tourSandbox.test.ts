import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bindTourMaterial,
  endTourSandbox,
  getTourSandbox,
  isSandboxed,
  keepSandboxItem,
  keepableSandboxItems,
  mergeSandboxList,
  registerSandboxKeeper,
  sandboxApi,
  sandboxId,
  sandboxPut,
  sandboxRemove,
  setSandboxPassthrough,
  startTourSandbox,
  tourMaterialItem,
} from '@/utils/tourSandbox';

const item = (id: string, title = id) => ({
  meta: { id, title },
  data: { id, title },
});
const real = [
  { id: 'a', title: 'A' },
  { id: 'b', title: 'B' },
];

afterEach(() => endTourSandbox());

describe('tourSandbox', () => {
  it('holds nothing and changes nothing while off', () => {
    sandboxPut('quiz', 'x', item('x'));
    expect(getTourSandbox().items.quiz.size).toBe(0);
    expect(mergeSandboxList(real, 'quiz', getTourSandbox())).toBe(real);
    expect(isSandboxed('a')).toBe(false);
  });

  it('lists its own items first, edited copies in place and deleted ones gone', () => {
    startTourSandbox();
    sandboxPut('quiz', 'new', item('new', 'New'));
    sandboxPut('quiz', 'a', item('a', 'A edited'), 'copy');
    sandboxRemove('quiz', 'b');
    expect(mergeSandboxList(real, 'quiz', getTourSandbox())).toEqual([
      { id: 'new', title: 'New' },
      { id: 'a', title: 'A edited' },
    ]);
  });

  it('lets writes to a teacher-picked item through', () => {
    startTourSandbox();
    setSandboxPassthrough(['a']);
    expect(isSandboxed('a')).toBe(false);
    expect(isSandboxed('b')).toBe(true);
  });

  it('offers only items the tour made or loaded to keep, saved by a registered widget', async () => {
    startTourSandbox();
    sandboxPut('quiz', 'new', item('new', 'New'));
    sandboxPut('quiz', 'a', item('a'), 'copy');
    expect(keepableSandboxItems()).toEqual([
      { kind: 'quiz', id: 'new', title: 'New' },
    ]);
    const keeper = vi.fn().mockResolvedValue(undefined);
    const stop = registerSandboxKeeper('quiz', keeper);
    await expect(keepSandboxItem('quiz', 'new')).resolves.toBe(true);
    expect(keeper).toHaveBeenCalledWith(item('new', 'New'));
    stop();
    await expect(keepSandboxItem('quiz', 'new')).resolves.toBe(false);
  });

  it('offers a seeded sample to keep only after the tour changed it', () => {
    startTourSandbox();
    sandboxPut('quiz', 's', item('s', 'Sample'), 'sample');
    expect(keepableSandboxItems()).toEqual([]);
    sandboxPut('quiz', 's', item('s', 'Sample edited'));
    expect(keepableSandboxItems()).toEqual([
      { kind: 'quiz', id: 's', title: 'Sample edited' },
    ]);
  });

  it('binds materials to items for the run and forgets them at the end', () => {
    startTourSandbox();
    bindTourMaterial('m1', 'quiz', 'x');
    expect(tourMaterialItem('m1')).toEqual({ kind: 'quiz', id: 'x' });
    endTourSandbox();
    expect(tourMaterialItem('m1')).toBeUndefined();
  });

  it('turns API calls on sandbox ids into no-ops', async () => {
    const api = { pause: vi.fn().mockResolvedValue('real') };
    startTourSandbox();
    const wrapped = sandboxApi(api, {});
    await expect(wrapped.pause(sandboxId())).resolves.toBeUndefined();
    await expect(wrapped.pause({ id: sandboxId() })).resolves.toBeUndefined();
    await expect(wrapped.pause(['a', sandboxId()])).resolves.toBeUndefined();
    await expect(wrapped.pause('real-id')).resolves.toBe('real');
    expect(api.pause).toHaveBeenCalledTimes(1);
  });
});
