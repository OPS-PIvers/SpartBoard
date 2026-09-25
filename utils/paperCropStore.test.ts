import { describe, expect, it, vi } from 'vitest';
import {
  createCropUploader,
  memoryCropStore,
  parseWrittenCropSet,
  writtenCropKey,
  type CropUploadStatus,
} from './paperCropStore';

const blob = () => new Blob(['x'], { type: 'image/webp' });

const deferred = () => {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('memoryCropStore written crops', () => {
  it('keeps the written set apart from row crops and clears both', async () => {
    const store = memoryCropStore();
    await store.save('b1', new Map([['1:0', 'data:x']]));
    await store.saveWritten('b1', {
      scanId: 'scan1',
      crops: [
        { seat: 1, questionId: 'q7', page: 1, state: 'ink', blob: blob() },
      ],
    });
    expect((await store.loadWritten('b1'))?.crops).toHaveLength(1);
    expect((await store.load('b1')).get('1:0')).toBe('data:x');
    await store.clear('b1');
    expect(await store.loadWritten('b1')).toBeNull();
    expect((await store.load('b1')).size).toBe(0);
  });
});

describe('parseWrittenCropSet', () => {
  it('drops malformed entries and keeps real blobs', () => {
    const b = blob();
    const parsed = parseWrittenCropSet({
      scanId: 's',
      crops: [
        { seat: 2, questionId: 'q1', page: 1, state: 'blank', blob: b },
        { seat: 2, questionId: 'q2', page: 1, state: 'smudge' },
        { seat: '3', questionId: 'q3', page: 1, state: 'ink' },
        { seat: 4, questionId: 'q4', page: 2, state: 'ink', blob: 'nope' },
      ],
    });
    expect(parsed?.crops).toEqual([
      { seat: 2, questionId: 'q1', page: 1, state: 'blank', blob: b },
      { seat: 4, questionId: 'q4', page: 2, state: 'ink', blob: null },
    ]);
  });

  it('rejects a record without a scan id', () => {
    expect(parseWrittenCropSet({ crops: [] })).toBeNull();
    expect(parseWrittenCropSet(null)).toBeNull();
  });
});

describe('createCropUploader', () => {
  it('uploads in the background and reports each status', async () => {
    const upload = vi.fn(() => Promise.resolve());
    const seen: Array<[string, CropUploadStatus]> = [];
    const up = createCropUploader(upload, (k, s) => seen.push([k, s]));
    up.enqueue({ key: writtenCropKey(1, 'q7'), path: 'p/1', blob: blob() });
    expect(upload).toHaveBeenCalledWith('p/1', expect.any(Blob));
    await up.whenIdle();
    expect(up.status('1:q7')).toBe('done');
    expect(seen.map(([, s]) => s)).toEqual(['queued', 'uploading', 'done']);
  });

  it('caps concurrent uploads', async () => {
    const gates = [deferred(), deferred(), deferred()];
    let call = 0;
    const upload = vi.fn(() => gates[call++].promise);
    const up = createCropUploader(upload, () => undefined, 2);
    up.enqueue({ key: 'a', path: 'a', blob: blob() });
    up.enqueue({ key: 'b', path: 'b', blob: blob() });
    up.enqueue({ key: 'c', path: 'c', blob: blob() });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(up.status('c')).toBe('queued');
    gates[0].resolve();
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(3));
    gates[1].resolve();
    gates[2].resolve();
    await up.whenIdle();
    expect(['a', 'b', 'c'].map(up.status)).toEqual(['done', 'done', 'done']);
  });

  it('retries once, then marks failed until retried', async () => {
    let fail = true;
    const upload = vi.fn(() =>
      fail ? Promise.reject(new Error('offline')) : Promise.resolve()
    );
    const up = createCropUploader(upload, () => undefined);
    up.enqueue({ key: 'a', path: 'a', blob: blob() });
    await up.whenIdle();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(up.status('a')).toBe('failed');
    fail = false;
    up.retryFailed();
    await up.whenIdle();
    expect(up.status('a')).toBe('done');
  });

  it('never uploads the same crop twice', async () => {
    const upload = vi.fn(() => Promise.resolve());
    const up = createCropUploader(upload, () => undefined);
    up.enqueue({ key: 'a', path: 'a', blob: blob() });
    up.enqueue({ key: 'a', path: 'a', blob: blob() });
    up.markDone('b');
    up.enqueue({ key: 'b', path: 'b', blob: blob() });
    await up.whenIdle();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('treats a denied create on a resumed review as already uploaded', async () => {
    const denied = Object.assign(new Error('denied'), {
      code: 'storage/unauthorized',
    });
    const upload = vi.fn(() => Promise.reject(denied));
    const up = createCropUploader(upload, () => undefined);
    up.enqueue({ key: 'a', path: 'a', blob: blob(), mayExist: true });
    up.enqueue({ key: 'b', path: 'b', blob: blob() });
    await up.whenIdle();
    expect(up.status('a')).toBe('done');
    expect(up.status('b')).toBe('failed');
  });
});
