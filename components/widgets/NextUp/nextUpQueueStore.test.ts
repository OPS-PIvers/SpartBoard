import { describe, expect, it } from 'vitest';
import type { NextUpQueueItem } from '@/types';
import { createNextUpQueueStore } from './nextUpQueueStore';

const entry = (id: string) => ({ id, name: id, joinedAt: 1 });

/** A Drive stand-in whose writes finish only when the test says so. */
function fakeDrive() {
  const writes: { queue: NextUpQueueItem[]; finish: () => void }[] = [];
  let file: NextUpQueueItem[] = [];
  const write = (queue: NextUpQueueItem[]) =>
    new Promise<void>((resolve) => {
      writes.push({
        queue,
        finish: () => {
          file = queue;
          resolve();
        },
      });
    });
  return { writes, write, file: () => file };
}

const names = (queue: NextUpQueueItem[]) =>
  queue.map((item) => `${item.id}:${item.status}`);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Next Up queue store', () => {
  it('keeps every student when two drains overlap and the first write lands last', async () => {
    const store = createNextUpQueueStore();
    const drive = fakeDrive();

    const first = store.dispatch(
      { type: 'joined', entries: [entry('a')] },
      drive.write
    );
    // The listener fires again before the first write lands, with A still present.
    const second = store.dispatch(
      { type: 'joined', entries: [entry('a'), entry('b')] },
      drive.write
    );
    expect(names(store.getQueue())).toEqual(['a:active', 'b:waiting']);

    // Writes run one at a time, so the second waits for the first.
    await flush();
    expect(drive.writes).toHaveLength(1);
    drive.writes[0].finish();
    await first;
    await flush();
    expect(drive.writes).toHaveLength(2);
    drive.writes[1].finish();
    await second;

    expect(names(drive.file())).toEqual(['a:active', 'b:waiting']);
  });

  it('keeps both the advance and new names when Next is pressed during a drain', async () => {
    const store = createNextUpQueueStore();
    const drive = fakeDrive();
    const seed = store.dispatch(
      { type: 'joined', entries: [entry('a'), entry('b')] },
      drive.write
    );
    await flush();
    drive.writes[0].finish();
    await seed;

    const drain = store.dispatch(
      { type: 'joined', entries: [entry('c')] },
      drive.write
    );
    const next = store.dispatch({ type: 'advance' }, drive.write);
    await flush();
    drive.writes[1].finish();
    await drain;
    await flush();
    drive.writes[2].finish();
    await next;

    expect(names(drive.file())).toEqual(['a:done', 'b:active', 'c:waiting']);
  });

  it('does not bring back a student after Reset while their join is still being cleaned up', async () => {
    const store = createNextUpQueueStore();
    const write = () => Promise.resolve();
    await store.dispatch({ type: 'joined', entries: [entry('a')] }, write);
    await store.dispatch({ type: 'reset' }, write);
    await store.dispatch({ type: 'joined', entries: [entry('a')] }, write);
    expect(store.getQueue()).toEqual([]);
  });

  it('skips a write when a repeated snapshot adds no one, but still waits for the queued one', async () => {
    const store = createNextUpQueueStore();
    const drive = fakeDrive();
    const first = store.dispatch(
      { type: 'joined', entries: [entry('a')] },
      drive.write
    );
    let repeatDone = false;
    const repeat = store
      .dispatch({ type: 'joined', entries: [entry('a')] }, drive.write)
      .then(() => {
        repeatDone = true;
      });
    await flush();
    expect(repeatDone).toBe(false);
    drive.writes[0].finish();
    await Promise.all([first, repeat]);
    expect(drive.writes).toHaveLength(1);
  });

  it('ignores a download that started before a local change finished saving', async () => {
    const store = createNextUpQueueStore();
    const drive = fakeDrive();
    const stale: NextUpQueueItem[] = [];
    let finishDownload: (queue: NextUpQueueItem[]) => void = () => undefined;
    const load = store.load(
      () =>
        new Promise((resolve) => {
          finishDownload = resolve;
        })
    );
    const join = store.dispatch(
      { type: 'joined', entries: [entry('a')] },
      drive.write
    );
    finishDownload(stale);
    await load;
    expect(names(store.getQueue())).toEqual(['a:active']);
    await flush();
    drive.writes[0].finish();
    await join;
  });

  it('shows a download when nothing changed locally', async () => {
    const store = createNextUpQueueStore();
    const fromDrive: NextUpQueueItem[] = [
      { id: 'x', name: 'x', joinedAt: 1, status: 'active' },
    ];
    await store.load(() => Promise.resolve(fromDrive));
    expect(store.getQueue()).toBe(fromDrive);
  });

  it('keeps writing later changes after one Drive write fails', async () => {
    const store = createNextUpQueueStore();
    const saved: NextUpQueueItem[][] = [];
    const failed = store.dispatch(
      { type: 'joined', entries: [entry('a')] },
      () => Promise.reject(new Error('offline'))
    );
    const next = store.dispatch(
      { type: 'joined', entries: [entry('b')] },
      (queue) => {
        saved.push(queue);
        return Promise.resolve();
      }
    );
    await expect(failed).rejects.toThrow('offline');
    await next;
    expect(names(saved[0])).toEqual(['a:active', 'b:waiting']);
  });
});
