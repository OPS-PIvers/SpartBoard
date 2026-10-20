import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  MODEL_CACHE_NAME,
  ModelLoadError,
  findCachedModel,
  loadModel,
  type ModelCacheDeps,
} from './modelCache';

const MODEL = Uint8Array.from({ length: 50_000 }, (_, i) => (i * 7) & 0xff);
const PIN = {
  bytes: MODEL.length,
  md5Prefix: createHash('md5').update(MODEL).digest('hex').slice(0, 12),
};
const URL_A = 'https://bucket.example/model.onnx';
const URL_B = 'https://hf.example/model.onnx';

class FakeCache {
  readonly entries = new Map<string, Uint8Array>();
  failPut = false;
  match(key: string) {
    const bytes = this.entries.get(key);
    return Promise.resolve(bytes ? new Response(bytes.slice()) : undefined);
  }
  async put(key: string, res: Response) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (this.failPut) throw new DOMException('Quota', 'QuotaExceededError');
    this.entries.set(key, bytes);
  }
  delete(key: string) {
    return Promise.resolve(this.entries.delete(key));
  }
}

function chunked(bytes: Uint8Array, size = 4096): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream({
    pull(controller) {
      if (at >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(at, at + size));
      at += size;
    },
  });
}

function setup(serve: Record<string, Uint8Array | number>) {
  const cache = new FakeCache();
  const fetch = vi.fn((url: string) => {
    const body = serve[url];
    if (body === undefined)
      return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve(
      typeof body === 'number'
        ? new Response(null, { status: body })
        : new Response(chunked(body))
    );
  });
  const deps: ModelCacheDeps = {
    fetch,
    caches: {
      open: (name: string) => {
        expect(name).toBe(MODEL_CACHE_NAME);
        return Promise.resolve(cache as unknown as Cache);
      },
      delete: () => Promise.resolve(true),
    },
  };
  return { cache, fetch, deps };
}

describe('loadModel', () => {
  it('downloads with progress, verifies, caches, then reads the cache next time', async () => {
    const { cache, fetch, deps } = setup({ [URL_A]: MODEL });
    const progress = vi.fn();
    const first = await loadModel([URL_A], PIN, progress, deps);
    expect(first.source).toBe('network');
    expect(first.bytes).toEqual(MODEL);
    expect(progress).toHaveBeenLastCalledWith(MODEL.length, MODEL.length);
    expect(cache.entries.has(`${URL_A}#verified`)).toBe(true);
    expect(await findCachedModel([URL_A], deps)).toBe(URL_A);

    const second = await loadModel([URL_A], PIN, vi.fn(), deps);
    expect(second.source).toBe('cache');
    expect(second.bytes).toEqual(MODEL);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a file whose md5 does not match the pin and leaves nothing cached', async () => {
    const tampered = MODEL.slice();
    tampered[123] ^= 0xff;
    const { cache, deps } = setup({ [URL_A]: tampered });
    const err = await loadModel([URL_A], PIN, vi.fn(), deps).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(ModelLoadError);
    expect((err as ModelLoadError).reason).toBe('integrity');
    expect(cache.entries.size).toBe(0);
    expect(await findCachedModel([URL_A], deps)).toBeNull();
  });

  it('rejects a file of the wrong size', async () => {
    const { deps } = setup({ [URL_A]: MODEL.slice(0, 1000) });
    await expect(loadModel([URL_A], PIN, vi.fn(), deps)).rejects.toMatchObject({
      reason: 'integrity',
    });
  });

  it('falls through to the next URL when the first fails', async () => {
    const { deps } = setup({ [URL_A]: 404, [URL_B]: MODEL });
    const loaded = await loadModel([URL_A, URL_B], PIN, vi.fn(), deps);
    expect(loaded.url).toBe(URL_B);
  });

  it('reports download-failed when every URL fails to download', async () => {
    const { deps } = setup({ [URL_A]: 404 });
    await expect(
      loadModel([URL_A, URL_B], PIN, vi.fn(), deps)
    ).rejects.toMatchObject({ reason: 'download-failed' });
  });

  it('ignores a cached copy that never passed verification', async () => {
    const { cache, fetch, deps } = setup({ [URL_A]: MODEL });
    cache.entries.set(URL_A, MODEL.slice(0, 10));
    expect(await findCachedModel([URL_A], deps)).toBeNull();
    const loaded = await loadModel([URL_A], PIN, vi.fn(), deps);
    expect(loaded.source).toBe('network');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the model in memory when the cache refuses it', async () => {
    const { cache, deps } = setup({ [URL_A]: MODEL });
    cache.failPut = true;
    const loaded = await loadModel([URL_A], PIN, vi.fn(), deps);
    expect(loaded.bytes).toEqual(MODEL);
    expect(cache.entries.size).toBe(0);
  });

  it('works without Cache Storage', async () => {
    const { deps } = setup({ [URL_A]: MODEL });
    const loaded = await loadModel([URL_A], PIN, vi.fn(), {
      ...deps,
      caches: null,
    });
    expect(loaded.bytes).toEqual(MODEL);
  });
});
