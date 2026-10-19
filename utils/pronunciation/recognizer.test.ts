import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BackendLoadError,
  createRecognizer,
  getRecognizer,
  setRecognizerForTests,
  type Recognizer,
  type RecognizerBackend,
  type RecognizerEnv,
  type RecognizerState,
} from './recognizer';
import { PRONUNCIATION_MODEL } from '@/config/pronunciationModel';

const SR = 16000;

// Half a second of tone between silences, so trimming and voiced time have something to find.
function speechLike(): Float32Array {
  const out = new Float32Array(SR * 1.5);
  for (let i = SR * 0.5; i < SR; i++) out[i] = 0.3 * Math.sin(i / 5);
  return out;
}

type LoadFn = RecognizerBackend['load'];
type RunFn = RecognizerBackend['run'];

function fakeBackend(over: { load?: LoadFn; run?: RunFn } = {}) {
  const load = vi.fn<LoadFn>(
    over.load ??
      ((_urls, onProgress, onStarting) => {
        onProgress(10, 100);
        onStarting();
        return Promise.resolve();
      })
  );
  const run = vi.fn<RunFn>(
    over.run ??
      (() =>
        Promise.resolve({
          tokens: [{ symbol: 'p', startFrame: 1, endFrame: 2 }],
          confidence: 0.9,
        }))
  );
  const dispose = vi.fn<() => void>();
  const backend: RecognizerBackend = { load, run, dispose };
  return { backend, load, run, dispose };
}

function make(env: Partial<RecognizerEnv> = {}, fake = fakeBackend()) {
  const states: RecognizerState['kind'][] = [];
  const r = createRecognizer({
    urls: ['https://bucket.example/model.onnx'],
    createBackend: () => fake.backend,
    isCached: () => Promise.resolve(false),
    isMetered: () => false,
    hasWasm: () => true,
    hasWorker: () => true,
    decodeAudio: () => Promise.resolve(speechLike()),
    now: () => performance.now(),
    slowMs: 15_000,
    ...env,
  });
  r.subscribe((s) => states.push(s.kind));
  return { r, states, ...fake };
}

const blob = () => new Blob([new Uint8Array(4)], { type: 'audio/webm' });

afterEach(() => {
  vi.useRealTimers();
  setRecognizerForTests(null);
});

describe('prepare', () => {
  it('downloads with progress, starts, then is ready', async () => {
    const { r, states } = make();
    expect(r.state().kind).toBe('idle');
    await r.prepare({ allowMetered: false });
    expect(states).toEqual(['downloading', 'downloading', 'starting', 'ready']);
  });

  it('goes straight to starting when the model is cached', async () => {
    const { r, states } = make({ isCached: () => Promise.resolve(true) });
    await r.prepare({ allowMetered: false });
    expect(states[0]).toBe('starting');
    expect(r.state().kind).toBe('ready');
  });

  it('asks first on a metered connection when the model is not cached', async () => {
    const { r, load } = make({ isMetered: () => true });
    await r.prepare({ allowMetered: false });
    expect(r.state()).toEqual({
      kind: 'needs-download',
      bytes: PRONUNCIATION_MODEL.bytes,
    });
    expect(load).not.toHaveBeenCalled();
    await r.prepare({ allowMetered: true });
    expect(r.state().kind).toBe('ready');
  });

  it('does not ask on a metered connection when the model is already cached', async () => {
    const { r } = make({
      isMetered: () => true,
      isCached: () => Promise.resolve(true),
    });
    await r.prepare({ allowMetered: false });
    expect(r.state().kind).toBe('ready');
  });

  it('retries a failed download but not an integrity failure', async () => {
    let attempt = 0;
    const { r, dispose, load } = make(
      {},
      fakeBackend({
        load: () => {
          attempt += 1;
          return attempt === 1
            ? Promise.reject(new BackendLoadError('download-failed', 'net'))
            : Promise.resolve();
        },
      })
    );
    await r.prepare({ allowMetered: false });
    expect(r.state()).toEqual({
      kind: 'unsupported',
      reason: 'download-failed',
    });
    expect(dispose).toHaveBeenCalled();
    await r.prepare({ allowMetered: false });
    expect(r.state().kind).toBe('ready');

    const bad = make(
      {},
      fakeBackend({
        load: () => Promise.reject(new BackendLoadError('integrity', 'md5')),
      })
    );
    await bad.r.prepare({ allowMetered: false });
    await bad.r.prepare({ allowMetered: false });
    expect(bad.r.state()).toEqual({ kind: 'unsupported', reason: 'integrity' });
    expect(bad.load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('maps an unknown load error to download-failed', async () => {
    const { r } = make(
      {},
      fakeBackend({ load: () => Promise.reject(new Error('x')) })
    );
    await r.prepare({ allowMetered: false });
    expect(r.state()).toEqual({
      kind: 'unsupported',
      reason: 'download-failed',
    });
  });

  it('is unsupported without Workers or WebAssembly, for good', async () => {
    const noWorker = make({ hasWorker: () => false });
    await noWorker.r.prepare({ allowMetered: true });
    expect(noWorker.r.state()).toEqual({
      kind: 'unsupported',
      reason: 'no-worker',
    });
    const noWasm = make({ hasWasm: () => false });
    await noWasm.r.prepare({ allowMetered: true });
    await noWasm.r.prepare({ allowMetered: true });
    expect(noWasm.r.state()).toEqual({
      kind: 'unsupported',
      reason: 'no-wasm',
    });
    expect(noWasm.load).not.toHaveBeenCalled();
  });

  it('shares one load between overlapping calls', async () => {
    const { r, load } = make();
    await Promise.all([
      r.prepare({ allowMetered: false }),
      r.prepare({ allowMetered: false }),
    ]);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('recognize', () => {
  it('refuses before the model is ready', async () => {
    const { r } = make();
    await expect(r.recognize(blob())).rejects.toMatchObject({
      code: 'not-ready',
    });
  });

  it('trims, measures voiced time and hands the Worker its own copy', async () => {
    const { r, run } = make();
    await r.prepare({ allowMetered: false });
    const result = await r.recognize(blob());
    expect(result.tokens.map((t) => t.symbol)).toEqual(['p']);
    expect(result.confidence).toBe(0.9);
    expect(result.voicedMs).toBeGreaterThanOrEqual(400);
    expect(result.voicedMs).toBeLessThanOrEqual(520);
    expect(result.audio16k.length).toBeLessThan(SR * 1.5);
    const sent = run.mock.calls[0][0];
    expect(sent).not.toBe(result.audio16k);
    expect(sent).toEqual(result.audio16k);
  });

  it('skips the model on silence', async () => {
    const { r, run } = make({
      decodeAudio: () => Promise.resolve(new Float32Array(200)),
    });
    await r.prepare({ allowMetered: false });
    const result = await r.recognize(blob());
    expect(result).toMatchObject({ tokens: [], confidence: 0, voicedMs: 0 });
    expect(run).not.toHaveBeenCalled();
  });

  it('marks the device too slow when the first decode passes the limit', async () => {
    vi.useFakeTimers();
    const { r, dispose } = make(
      { slowMs: 15_000 },
      fakeBackend({ run: () => new Promise<never>(() => undefined) })
    );
    await r.prepare({ allowMetered: false });
    const pending = r.recognize(blob());
    const check = expect(pending).rejects.toMatchObject({ code: 'too-slow' });
    await vi.advanceTimersByTimeAsync(15_000);
    await check;
    expect(r.state()).toEqual({ kind: 'unsupported', reason: 'too-slow' });
    expect(dispose).toHaveBeenCalled();
    await r.prepare({ allowMetered: true });
    expect(r.state().kind).toBe('unsupported');
  });

  it('only times the first decode', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const { r } = make(
      { slowMs: 15_000 },
      fakeBackend({
        run: async () => {
          calls += 1;
          if (calls === 2) await new Promise((res) => setTimeout(res, 20_000));
          return { tokens: [], confidence: 0.5 };
        },
      })
    );
    await r.prepare({ allowMetered: false });
    await r.recognize(blob());
    const second = r.recognize(blob());
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(second).resolves.toMatchObject({ confidence: 0.5 });
    expect(r.state().kind).toBe('ready');
  });

  it('drops a backend whose run failed so prepare starts a fresh one', async () => {
    let calls = 0;
    const { r, dispose, load } = make(
      {},
      fakeBackend({
        run: () => {
          calls += 1;
          return calls === 1
            ? Promise.reject(new Error('wasm abort'))
            : Promise.resolve({ tokens: [], confidence: 0.4 });
        },
      })
    );
    await r.prepare({ allowMetered: false });
    await expect(r.recognize(blob())).rejects.toMatchObject({ code: 'failed' });
    expect(dispose).toHaveBeenCalled();
    expect(r.state().kind).toBe('idle');
    await r.prepare({ allowMetered: false });
    expect(load).toHaveBeenCalledTimes(2);
    await expect(r.recognize(blob())).resolves.toMatchObject({
      confidence: 0.4,
    });
  });

  it('surfaces a decode failure without changing state', async () => {
    const { r } = make({
      decodeAudio: () => Promise.reject(new Error('bad audio')),
    });
    await r.prepare({ allowMetered: false });
    await expect(r.recognize(blob())).rejects.toMatchObject({ code: 'failed' });
    expect(r.state().kind).toBe('ready');
  });
});

describe('getRecognizer', () => {
  it('returns the injected test recognizer', () => {
    const fake = { state: () => ({ kind: 'ready' }) } as unknown as Recognizer;
    setRecognizerForTests(fake);
    expect(getRecognizer()).toBe(fake);
  });
});
