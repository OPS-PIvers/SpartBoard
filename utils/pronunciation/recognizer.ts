// On-device phoneme recognizer for Speak (§5, F26-F28): decode and trim here, run the model in a Worker.
import {
  PRONUNCIATION_MODEL,
  hostedModelUrl,
} from '@/config/pronunciationModel';
import type { CtcToken } from './ctcDecode';
import { decodeToModelRate, trimSilence } from './audio';
import { findCachedModel } from './modelCache';
import {
  measureVoicedMs,
  type WorkerLoadFailure,
  type WorkerRequest,
  type WorkerResponse,
} from './recognizerCore';

export type RecognizerState =
  | { kind: 'idle' }
  | { kind: 'needs-download'; bytes: number }
  | { kind: 'downloading'; loaded: number; total: number }
  | { kind: 'starting' }
  | { kind: 'ready' }
  | {
      kind: 'unsupported';
      reason:
        'no-wasm' | 'no-worker' | 'download-failed' | 'integrity' | 'too-slow';
    };

export interface RecognizeResult {
  tokens: CtcToken[];
  confidence: number;
  voicedMs: number;
  audio16k: Float32Array;
  decodeMs: number;
}

export interface Recognizer {
  state(): RecognizerState;
  subscribe(cb: (s: RecognizerState) => void): () => void;
  prepare(opts: { allowMetered: boolean }): Promise<void>;
  recognize(audio: Blob): Promise<RecognizeResult>;
}

export class RecognizerError extends Error {
  readonly code: 'not-ready' | 'too-slow' | 'failed';
  constructor(code: RecognizerError['code'], message: string) {
    super(message);
    this.name = 'RecognizerError';
    this.code = code;
  }
}

/** What runs the model; a Worker in the app, a fake in tests. */
export interface RecognizerBackend {
  load(
    urls: string[],
    onProgress: (loaded: number, total: number) => void,
    onStarting: () => void
  ): Promise<void>;
  run(audio: Float32Array): Promise<{ tokens: CtcToken[]; confidence: number }>;
  dispose(): void;
}

export class BackendLoadError extends Error {
  readonly reason: WorkerLoadFailure;
  constructor(reason: WorkerLoadFailure, message: string) {
    super(message);
    this.name = 'BackendLoadError';
    this.reason = reason;
  }
}

export interface RecognizerEnv {
  urls: string[];
  createBackend: () => RecognizerBackend;
  isCached: (urls: string[]) => Promise<boolean>;
  isMetered: () => boolean;
  hasWasm: () => boolean;
  hasWorker: () => boolean;
  decodeAudio: (audio: Blob) => Promise<Float32Array>;
  now: () => number;
  /** A first decode slower than this marks the device too slow (F12). */
  slowMs: number;
}

export const TOO_SLOW_MS = 15_000;
// Shorter than one model frame (25 ms) gives the model nothing to read.
const MIN_MODEL_SAMPLES = 400;

interface NetworkInformationLike {
  saveData?: boolean;
  type?: string;
}

/** True on a cellular or data-saver connection, where the 240 MB download must be asked for first (F28). */
export function isMeteredConnection(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (
    navigator as Navigator & { connection?: NetworkInformationLike }
  ).connection;
  return conn?.saveData === true || conn?.type === 'cellular';
}

/** Model URLs in the order tried: this project's bucket, then Hugging Face in dev builds only. */
export function defaultModelUrls(): string[] {
  const bucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as
    string | undefined;
  const urls = bucket ? [hostedModelUrl(bucket)] : [];
  if (import.meta.env.DEV) urls.push(PRONUNCIATION_MODEL.huggingFaceUrl);
  return urls;
}

function createWorkerBackend(): RecognizerBackend {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<
    number,
    {
      resolve: (r: { tokens: CtcToken[]; confidence: number }) => void;
      reject: (e: Error) => void;
    }
  >();
  let loadHandlers: {
    resolve: () => void;
    reject: (e: Error) => void;
    onProgress: (loaded: number, total: number) => void;
    onStarting: () => void;
  } | null = null;

  const failAll = (err: Error) => {
    loadHandlers?.reject(err);
    loadHandlers = null;
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };

  const ensureWorker = (): Worker => {
    if (worker) return worker;
    const w = new Worker(new URL('./recognizer.worker.ts', import.meta.url), {
      type: 'module',
    });
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'progress':
          loadHandlers?.onProgress(msg.loaded, msg.total);
          break;
        case 'starting':
          loadHandlers?.onStarting();
          break;
        case 'loaded':
          loadHandlers?.resolve();
          loadHandlers = null;
          break;
        case 'load-error':
          loadHandlers?.reject(new BackendLoadError(msg.reason, msg.message));
          loadHandlers = null;
          break;
        case 'result':
          pending.get(msg.id)?.resolve(msg);
          pending.delete(msg.id);
          break;
        case 'recognize-error':
          pending.get(msg.id)?.reject(new Error(msg.message));
          pending.delete(msg.id);
          break;
      }
    };
    // A Worker script that fails to load is a download problem, not an unsupported device.
    w.onerror = (e) => {
      e.preventDefault();
      failAll(
        new BackendLoadError(
          'download-failed',
          e.message || 'Recognizer worker failed'
        )
      );
    };
    worker = w;
    return w;
  };

  const send = (msg: WorkerRequest, transfer: Transferable[] = []) =>
    ensureWorker().postMessage(msg, transfer);

  return {
    load(urls, onProgress, onStarting) {
      return new Promise<void>((resolve, reject) => {
        loadHandlers = { resolve, reject, onProgress, onStarting };
        send({ type: 'load', urls });
      });
    },
    run(audio) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        send({ type: 'recognize', id, audio }, [audio.buffer]);
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      failAll(new Error('Recognizer disposed'));
    },
  };
}

export function defaultRecognizerEnv(): RecognizerEnv {
  return {
    urls: defaultModelUrls(),
    createBackend: createWorkerBackend,
    isCached: async (urls) => (await findCachedModel(urls)) !== null,
    isMetered: isMeteredConnection,
    hasWasm: () =>
      typeof WebAssembly === 'object' &&
      typeof WebAssembly.instantiate === 'function',
    hasWorker: () => typeof Worker === 'function',
    decodeAudio: async (audio) => decodeToModelRate(await audio.arrayBuffer()),
    now: () => performance.now(),
    slowMs: TOO_SLOW_MS,
  };
}

const PERMANENT: ReadonlySet<string> = new Set([
  'no-wasm',
  'no-worker',
  'too-slow',
]);

export function createRecognizer(
  overrides: Partial<RecognizerEnv> = {}
): Recognizer & { dispose(): void } {
  const env: RecognizerEnv = { ...defaultRecognizerEnv(), ...overrides };
  let current: RecognizerState = { kind: 'idle' };
  const listeners = new Set<(s: RecognizerState) => void>();
  let backend: RecognizerBackend | null = null;
  let preparing: Promise<void> | null = null;
  let decodedOnce = false;
  let queue: Promise<unknown> = Promise.resolve();

  const set = (next: RecognizerState) => {
    current = next;
    for (const cb of listeners) cb(next);
  };

  const fail = (
    reason: Extract<RecognizerState, { kind: 'unsupported' }>['reason']
  ) => {
    backend?.dispose();
    backend = null;
    set({ kind: 'unsupported', reason });
  };

  const doPrepare = async (allowMetered: boolean): Promise<void> => {
    if (!env.hasWorker()) return fail('no-worker');
    if (!env.hasWasm()) return fail('no-wasm');
    let cached = false;
    try {
      cached = await env.isCached(env.urls);
    } catch {
      cached = false;
    }
    if (!cached && env.isMetered() && !allowMetered) {
      set({ kind: 'needs-download', bytes: PRONUNCIATION_MODEL.bytes });
      return;
    }
    set(
      cached
        ? { kind: 'starting' }
        : { kind: 'downloading', loaded: 0, total: PRONUNCIATION_MODEL.bytes }
    );
    backend = env.createBackend();
    try {
      await backend.load(
        env.urls,
        (loaded, total) => set({ kind: 'downloading', loaded, total }),
        () => set({ kind: 'starting' })
      );
    } catch (err) {
      return fail(
        err instanceof BackendLoadError ? err.reason : 'download-failed'
      );
    }
    set({ kind: 'ready' });
  };

  const runOne = async (audio: Blob): Promise<RecognizeResult> => {
    if (current.kind !== 'ready' || !backend) {
      throw new RecognizerError('not-ready', `Recognizer is ${current.kind}`);
    }
    const active = backend;
    let raw: Float32Array;
    try {
      raw = await env.decodeAudio(audio);
    } catch (err) {
      throw new RecognizerError(
        'failed',
        err instanceof Error ? err.message : String(err)
      );
    }
    const voicedMs = measureVoicedMs(raw);
    const audio16k = trimSilence(raw);
    if (audio16k.length < MIN_MODEL_SAMPLES) {
      return { tokens: [], confidence: 0, voicedMs, audio16k, decodeMs: 0 };
    }
    const t0 = env.now();
    const first = !decodedOnce;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const work = active.run(audio16k.slice());
    const outcome = first
      ? await Promise.race([
          work.then((r) => ({ kind: 'done' as const, r })),
          new Promise<{ kind: 'slow' }>((resolve) => {
            timer = setTimeout(() => resolve({ kind: 'slow' }), env.slowMs);
          }),
        ]).catch((err: unknown) => {
          throw new RecognizerError(
            'failed',
            err instanceof Error ? err.message : String(err)
          );
        })
      : await work
          .then((r) => ({ kind: 'done' as const, r }))
          .catch((err: unknown) => {
            throw new RecognizerError(
              'failed',
              err instanceof Error ? err.message : String(err)
            );
          });
    if (timer !== null) clearTimeout(timer);
    if (outcome.kind === 'slow') {
      fail('too-slow');
      throw new RecognizerError('too-slow', 'First decode took too long');
    }
    decodedOnce = true;
    return {
      tokens: outcome.r.tokens,
      confidence: outcome.r.confidence,
      voicedMs,
      audio16k,
      decodeMs: Math.round(env.now() - t0),
    };
  };

  return {
    state: () => current,
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    prepare({ allowMetered }) {
      if (current.kind === 'ready') return Promise.resolve();
      if (current.kind === 'unsupported' && PERMANENT.has(current.reason))
        return Promise.resolve();
      preparing ??= doPrepare(allowMetered).finally(() => {
        preparing = null;
      });
      return preparing;
    },
    recognize(audio) {
      // One decode at a time, in call order: the model is single-threaded anyway.
      const next = queue.then(() => runOne(audio));
      queue = next.catch(() => undefined);
      return next;
    },
    dispose() {
      backend?.dispose();
      backend = null;
      listeners.clear();
    },
  };
}

let singleton: Recognizer | null = null;
let override: Recognizer | null = null;

/** The page's one recognizer; the model is loaded at most once per page. */
export function getRecognizer(): Recognizer {
  if (override) return override;
  singleton ??= createRecognizer();
  return singleton;
}

export function setRecognizerForTests(r: Recognizer | null): void {
  override = r;
}
