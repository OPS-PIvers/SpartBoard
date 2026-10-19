// Downloads, verifies and caches the pinned model (F27). Runs in the recognizer Worker; caches is injectable for tests.
import { Md5 } from './md5';

export const MODEL_CACHE_NAME = 'spartboard-pronunciation-models';

export interface ModelPin {
  bytes: number;
  md5Prefix: string;
}

export type ModelLoadFailure = 'download-failed' | 'integrity';

export class ModelLoadError extends Error {
  readonly reason: ModelLoadFailure;
  constructor(reason: ModelLoadFailure, message: string) {
    super(message);
    this.name = 'ModelLoadError';
    this.reason = reason;
  }
}

export interface ModelCacheDeps {
  fetch: (url: string) => Promise<Response>;
  caches: Pick<CacheStorage, 'open' | 'delete'> | null;
}

export interface LoadedModel {
  bytes: Uint8Array;
  source: 'cache' | 'network';
  url: string;
}

export function defaultModelCacheDeps(): ModelCacheDeps {
  return {
    fetch: (url) => fetch(url),
    caches: typeof caches === 'undefined' ? null : caches,
  };
}

// Written only after the bytes pass the size and md5 check, so a half-verified entry is never trusted.
const verifiedKey = (url: string) => `${url}#verified`;

async function openCache(deps: ModelCacheDeps): Promise<Cache | null> {
  if (!deps.caches) return null;
  try {
    return await deps.caches.open(MODEL_CACHE_NAME);
  } catch {
    return null;
  }
}

/** The first of `urls` with a verified cached copy, without reading its body. */
export async function findCachedModel(
  urls: readonly string[],
  deps: ModelCacheDeps = defaultModelCacheDeps()
): Promise<string | null> {
  const cache = await openCache(deps);
  if (!cache) return null;
  for (const url of urls) {
    try {
      if ((await cache.match(verifiedKey(url))) && (await cache.match(url)))
        return url;
    } catch {
      // A broken cache entry reads as not cached.
    }
  }
  return null;
}

async function readCached(
  cache: Cache,
  url: string,
  pin: ModelPin
): Promise<Uint8Array | null> {
  try {
    if (!(await cache.match(verifiedKey(url)))) return null;
    const hit = await cache.match(url);
    if (!hit) return null;
    const bytes = new Uint8Array(await hit.arrayBuffer());
    if (bytes.length === pin.bytes) return bytes;
  } catch {
    // Fall through to a fresh download.
  }
  await Promise.all([cache.delete(url), cache.delete(verifiedKey(url))]).catch(
    () => undefined
  );
  return null;
}

interface Tracked {
  stream: ReadableStream<Uint8Array>;
  received: () => number;
  done: () => { received: number; md5: string };
}

function track(
  body: ReadableStream<Uint8Array>,
  total: number,
  onProgress: (loaded: number, total: number) => void
): Tracked {
  const md5 = new Md5();
  let received = 0;
  const stream = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        md5.update(chunk);
        received += chunk.length;
        onProgress(received, total);
        controller.enqueue(chunk);
      },
    })
  );
  let digest: string | null = null;
  return {
    stream,
    received: () => received,
    done: () => ({ received, md5: (digest ??= md5.hex()) }),
  };
}

function checkIntegrity(
  url: string,
  pin: ModelPin,
  got: { received: number; md5: string }
): void {
  if (got.received !== pin.bytes || !got.md5.startsWith(pin.md5Prefix)) {
    throw new ModelLoadError(
      'integrity',
      `${url}: got ${got.received} bytes, md5 ${got.md5.slice(0, 12)}; pinned ${pin.bytes}, ${pin.md5Prefix}`
    );
  }
}

async function open(
  url: string,
  deps: ModelCacheDeps
): Promise<ReadableStream<Uint8Array>> {
  let response: Response;
  try {
    response = await deps.fetch(url);
  } catch (err) {
    throw new ModelLoadError(
      'download-failed',
      `${url}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!response.ok || !response.body) {
    throw new ModelLoadError(
      'download-failed',
      `${url}: HTTP ${response.status}`
    );
  }
  return response.body;
}

async function downloadToMemory(
  url: string,
  pin: ModelPin,
  deps: ModelCacheDeps,
  onProgress: (loaded: number, total: number) => void
): Promise<Uint8Array> {
  const tracked = track(await open(url, deps), pin.bytes, onProgress);
  const out = new Uint8Array(pin.bytes);
  let at = 0;
  const reader = tracked.stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (at + value.length > out.length) {
        await reader.cancel();
        throw new ModelLoadError(
          'integrity',
          `${url}: more than the pinned ${pin.bytes} bytes`
        );
      }
      out.set(value, at);
      at += value.length;
    }
  } catch (err) {
    if (err instanceof ModelLoadError) throw err;
    throw new ModelLoadError(
      'download-failed',
      `${url}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  checkIntegrity(url, pin, tracked.done());
  return out;
}

async function downloadOne(
  url: string,
  pin: ModelPin,
  cache: Cache | null,
  deps: ModelCacheDeps,
  onProgress: (loaded: number, total: number) => void
): Promise<Uint8Array> {
  if (!cache) return downloadToMemory(url, pin, deps, onProgress);
  const tracked = track(await open(url, deps), pin.bytes, onProgress);
  try {
    // Streams straight into Cache Storage so the 240 MB is never held twice.
    await cache.put(
      url,
      new Response(tracked.stream, {
        headers: { 'Content-Type': 'application/octet-stream' },
      })
    );
  } catch (err) {
    if (tracked.received() < pin.bytes) {
      throw new ModelLoadError(
        'download-failed',
        `${url}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    // The download finished but the cache refused it (quota): keep it in memory for this page only.
    return downloadToMemory(url, pin, deps, onProgress);
  }
  try {
    checkIntegrity(url, pin, tracked.done());
  } catch (err) {
    await cache.delete(url).catch(() => undefined);
    throw err;
  }
  await cache.put(verifiedKey(url), new Response('ok'));
  const bytes = await readCached(cache, url, pin);
  return bytes ?? downloadToMemory(url, pin, deps, onProgress);
}

/** Reads the first verified cached copy, else downloads each URL in turn until one passes the pin. */
export async function loadModel(
  urls: readonly string[],
  pin: ModelPin,
  onProgress: (loaded: number, total: number) => void,
  deps: ModelCacheDeps = defaultModelCacheDeps()
): Promise<LoadedModel> {
  const cache = await openCache(deps);
  if (cache) {
    for (const url of urls) {
      const bytes = await readCached(cache, url, pin);
      if (bytes) return { bytes, source: 'cache', url };
    }
  }
  let failure: ModelLoadError | null = null;
  for (const url of urls) {
    try {
      const bytes = await downloadOne(url, pin, cache, deps, onProgress);
      return { bytes, source: 'network', url };
    } catch (err) {
      const next =
        err instanceof ModelLoadError
          ? err
          : new ModelLoadError('download-failed', String(err));
      // An integrity failure outranks a plain network failure in the final report.
      if (!failure || next.reason === 'integrity') failure = next;
    }
  }
  throw failure ?? new ModelLoadError('download-failed', 'No model URL');
}

/** Deletes every cached model copy on this device. */
export async function clearModelCache(
  deps: ModelCacheDeps = defaultModelCacheDeps()
): Promise<void> {
  await deps.caches?.delete(MODEL_CACHE_NAME);
}
