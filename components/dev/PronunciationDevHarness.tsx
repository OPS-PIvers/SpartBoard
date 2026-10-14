// Chromebook go/no-go for on-device pronunciation scoring (#2350). Dev builds and the spartboard-dev site only.
import React, { useEffect, useRef, useState } from 'react';
import * as ort from 'onnxruntime-web-1-30';
import wasmUrl from '../../node_modules/onnxruntime-web-1-30/dist/ort-wasm-simd-threaded.jsep.wasm?url';
import angloUrl from '../../scripts/spikes/pronunciation-bias-probe/audio/pero_anglo_r_human.wav?url';
import tapUrl from '../../scripts/spikes/pronunciation-bias-probe/audio/pero_tap_human.wav?url';
import trill1Url from '../../scripts/spikes/pronunciation-bias-probe/audio/perro_trill_human_1.wav?url';
import trill2Url from '../../scripts/spikes/pronunciation-bias-probe/audio/perro_trill_human_2.wav?url';
import trill3Url from '../../scripts/spikes/pronunciation-bias-probe/audio/perro_trill_human_3.wav?url';
import { PRONUNCIATION_MODEL } from '@/config/pronunciationModel';
import vocab from '@/utils/pronunciation/xlsr53EspeakVocab.json';
import { greedyCtcDecode, invertVocab } from '@/utils/pronunciation/ctcDecode';
import {
  MODEL_SAMPLE_RATE,
  decodeToModelRate,
  normalizeForWav2Vec2,
} from '@/utils/pronunciation/audio';

ort.env.wasm.wasmPaths = { wasm: wasmUrl };

const SYMBOLS = invertVocab(vocab);
const CACHE_NAME = 'spartboard-pronunciation-models';
const URL_KEY = 'pronunciationDev.modelUrl';
const MIC_SECONDS = 3;

// Expected strings are the q4 CPU decodes recorded in scripts/spikes/retroflex-confusion/RESULTS.md.
const CLIPS = [
  { name: 'pero_anglo_r_human', url: angloUrl, target: 'peɾo', python: 'peɹo' },
  { name: 'pero_tap_human', url: tapUrl, target: 'peɾo', python: 'pero' },
  {
    name: 'perro_trill_human_1',
    url: trill1Url,
    target: 'pero',
    python: 'perro',
  },
  {
    name: 'perro_trill_human_2',
    url: trill2Url,
    target: 'pero',
    python: 'erɹo',
  },
  {
    name: 'perro_trill_human_3',
    url: trill3Url,
    target: 'pero',
    python: 'perro',
  },
] as const;

type Backend = 'wasm' | 'webgpu';

interface DeviceInfo {
  userAgent: string;
  cores: number;
  deviceMemoryGb: number | null;
  crossOriginIsolated: boolean;
  webgpuAdapter: boolean;
  storageQuotaMb: number | null;
  storageUsageMb: number | null;
}

interface LoadResult {
  backend: Backend;
  source: 'cache' | 'network' | 'file';
  bytes: number;
  sizeMatchesPin: boolean;
  fetchMs: number;
  sessionMs: number;
  threads: number;
  heapMb: number | null;
  cacheWriteError: string | null;
}

interface DecodeRow {
  clip: string;
  pass: 'cold' | 'warm' | 'mic';
  audioSeconds: number;
  prepMs: number;
  inferMs: number;
  realTimeFactor: number;
  frames: number;
  output: string;
  python: string | null;
  target: string | null;
}

interface PerfMemory {
  usedJSHeapSize: number;
}

function heapMb(): number | null {
  const mem = (performance as Performance & { memory?: PerfMemory }).memory;
  return mem ? Math.round(mem.usedJSHeapSize / 1e6) : null;
}

function mb(bytes: number): string {
  return (bytes / 1e6).toFixed(1);
}

async function probeDevice(): Promise<DeviceInfo> {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    gpu?: { requestAdapter: () => Promise<unknown> };
  };
  let webgpuAdapter = false;
  try {
    webgpuAdapter = !!(await nav.gpu?.requestAdapter());
  } catch {
    webgpuAdapter = false;
  }
  let quota: number | null = null;
  let usage: number | null = null;
  try {
    const est = await navigator.storage?.estimate();
    quota = est?.quota != null ? Math.round(est.quota / 1e6) : null;
    usage = est?.usage != null ? Math.round(est.usage / 1e6) : null;
  } catch {
    // Storage estimate is unavailable in some managed profiles.
  }
  return {
    userAgent: navigator.userAgent,
    cores: navigator.hardwareConcurrency,
    deviceMemoryGb: nav.deviceMemory ?? null,
    crossOriginIsolated: window.crossOriginIsolated,
    webgpuAdapter,
    storageQuotaMb: quota,
    storageUsageMb: usage,
  };
}

/** Wraps a download so bytes stream through (into Cache Storage) without a second in-memory copy. */
function withProgress(
  response: Response,
  onProgress: (received: number) => void
): Response {
  const body = response.body;
  if (!body) return response;
  let received = 0;
  const reader = body.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      received += value.length;
      onProgress(received);
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/octet-stream' },
  });
}

export const PronunciationDevHarness: React.FC = () => {
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [modelUrl, setModelUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(URL_KEY) ?? PRONUNCIATION_MODEL.defaultUrl;
    } catch {
      return PRONUNCIATION_MODEL.defaultUrl;
    }
  });
  const [backend, setBackend] = useState<Backend>('wasm');
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    received: number;
    mbps: string | null;
  } | null>(null);
  const [load, setLoad] = useState<LoadResult | null>(null);
  const [rows, setRows] = useState<DecodeRow[]>([]);
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<ort.InferenceSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    void probeDevice().then((info) => {
      if (!cancelled) setDevice(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setStatus(label);
    try {
      await task();
      setStatus('Done');
    } catch (err) {
      setError(
        err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      );
      setStatus('Failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const createSession = async (
    bytes: Uint8Array,
    source: LoadResult['source'],
    fetchMs: number,
    cacheWriteError: string | null
  ) => {
    await sessionRef.current?.release();
    sessionRef.current = null;
    const threads = window.crossOriginIsolated
      ? Math.min(4, navigator.hardwareConcurrency || 1)
      : 1;
    ort.env.wasm.numThreads = threads;
    setStatus(`Creating ${backend} session…`);
    const t0 = performance.now();
    sessionRef.current = await ort.InferenceSession.create(bytes, {
      executionProviders: [backend],
    });
    setLoad({
      backend,
      source,
      bytes: bytes.length,
      sizeMatchesPin: bytes.length === PRONUNCIATION_MODEL.bytes,
      fetchMs: Math.round(fetchMs),
      sessionMs: Math.round(performance.now() - t0),
      threads,
      heapMb: heapMb(),
      cacheWriteError,
    });
  };

  const loadFromUrl = () =>
    run('Loading model…', async () => {
      try {
        localStorage.setItem(URL_KEY, modelUrl);
      } catch {
        // Remembering the URL is a convenience only.
      }
      const t0 = performance.now();
      let cache: Cache | null = null;
      try {
        cache = await caches.open(CACHE_NAME);
      } catch {
        cache = null;
      }
      const hit = await cache?.match(modelUrl);
      if (hit) {
        setStatus('Reading model from device cache…');
        const bytes = new Uint8Array(await hit.arrayBuffer());
        await createSession(bytes, 'cache', performance.now() - t0, null);
        return;
      }
      setStatus('Downloading model…');
      const download = async () => {
        const response = await fetch(modelUrl);
        if (!response.ok)
          throw new Error(`Download failed: HTTP ${response.status}`);
        const startedAt = performance.now();
        setProgress({ received: 0, mbps: null });
        return withProgress(response, (received) => {
          const seconds = (performance.now() - startedAt) / 1000;
          setProgress({
            received,
            mbps: seconds > 0 ? (received / 1e6 / seconds).toFixed(1) : null,
          });
        });
      };
      let bytes: Uint8Array | null = null;
      let cacheWriteError: string | null = null;
      if (cache) {
        try {
          await cache.put(modelUrl, await download());
          const stored = await cache.match(modelUrl);
          if (stored) bytes = new Uint8Array(await stored.arrayBuffer());
        } catch (err) {
          cacheWriteError = err instanceof Error ? err.message : String(err);
        }
      }
      bytes ??= new Uint8Array(await (await download()).arrayBuffer());
      const fetchMs = performance.now() - t0;
      await createSession(bytes, 'network', fetchMs, cacheWriteError);
    });

  const loadFromFile = (file: File) =>
    run('Reading model file…', async () => {
      const t0 = performance.now();
      const bytes = new Uint8Array(await file.arrayBuffer());
      await createSession(bytes, 'file', performance.now() - t0, null);
    });

  const clearCache = () =>
    run('Clearing cached model…', async () => {
      await caches.delete(CACHE_NAME);
      setDevice(await probeDevice());
    });

  const decode = async (
    audioBytes: ArrayBuffer
  ): Promise<Omit<DecodeRow, 'clip' | 'pass' | 'python' | 'target'>> => {
    const session = sessionRef.current;
    if (!session) throw new Error('Load the model first.');
    const t0 = performance.now();
    const audio = normalizeForWav2Vec2(await decodeToModelRate(audioBytes));
    const prepMs = performance.now() - t0;
    const feeds: Record<string, ort.Tensor> = {
      [session.inputNames[0]]: new ort.Tensor('float32', audio, [
        1,
        audio.length,
      ]),
    };
    if (session.inputNames.includes('attention_mask')) {
      feeds.attention_mask = new ort.Tensor(
        'int64',
        new BigInt64Array(audio.length).fill(1n),
        [1, audio.length]
      );
    }
    const t1 = performance.now();
    const out = await session.run(feeds);
    const inferMs = performance.now() - t1;
    const logits = out[session.outputNames[0]];
    const [, frames, vocabSize] = logits.dims;
    const result = greedyCtcDecode(
      logits.data as Float32Array,
      frames,
      vocabSize,
      SYMBOLS,
      PRONUNCIATION_MODEL.padId
    );
    const audioSeconds = audio.length / MODEL_SAMPLE_RATE;
    return {
      audioSeconds: Number(audioSeconds.toFixed(2)),
      prepMs: Math.round(prepMs),
      inferMs: Math.round(inferMs),
      realTimeFactor: Number((inferMs / 1000 / audioSeconds).toFixed(2)),
      frames,
      output: result.text,
    };
  };

  const decodeClips = () =>
    run('Decoding clips…', async () => {
      const pass: DecodeRow['pass'] = rows.some((r) => r.pass === 'cold')
        ? 'warm'
        : 'cold';
      for (const clip of CLIPS) {
        setStatus(`Decoding ${clip.name} (${pass})…`);
        const bytes = await (await fetch(clip.url)).arrayBuffer();
        const row = await decode(bytes);
        setRows((prev) => [
          ...prev,
          {
            clip: clip.name,
            pass,
            python: clip.python,
            target: clip.target,
            ...row,
          },
        ]);
      }
    });

  const recordMic = () =>
    run(`Recording ${MIC_SECONDS} s, say "perro"…`, async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      try {
        const recorder = new MediaRecorder(stream);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => chunks.push(e.data);
        const stopped = new Promise<void>((resolve) => {
          recorder.onstop = () => resolve();
        });
        recorder.start();
        await new Promise((resolve) => setTimeout(resolve, MIC_SECONDS * 1000));
        recorder.stop();
        await stopped;
        setStatus('Decoding microphone take…');
        const bytes = await new Blob(chunks, {
          type: recorder.mimeType,
        }).arrayBuffer();
        const row = await decode(bytes);
        setRows((prev) => [
          ...prev,
          {
            clip: 'microphone',
            pass: 'mic',
            python: null,
            target: 'pero',
            ...row,
          },
        ]);
      } finally {
        stream.getTracks().forEach((t) => t.stop());
      }
    });

  const report = JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      model: PRONUNCIATION_MODEL.id,
      device,
      load,
      rows,
      error,
    },
    null,
    2
  );

  return (
    <div className="h-screen [height:100dvh] overflow-y-auto bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-4xl space-y-6 p-6 pb-24">
        <header>
          <h1 className="text-2xl font-bold">
            Pronunciation model device test
          </h1>
          <p className="text-sm text-slate-600">
            Loads the pinned {mb(PRONUNCIATION_MODEL.bytes)} MB phoneme model in
            this browser and decodes the five committed clips. Nothing is
            uploaded. Copy the report at the bottom back into #2350.
          </p>
        </header>

        <section className="rounded-lg border bg-white p-4">
          <h2 className="mb-2 font-semibold">1. This device</h2>
          {device ? (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              <dt>Cores</dt>
              <dd>{device.cores}</dd>
              <dt>Memory (GB, rounded by browser)</dt>
              <dd>{device.deviceMemoryGb ?? 'unknown'}</dd>
              <dt>WebGPU adapter</dt>
              <dd>{device.webgpuAdapter ? 'yes' : 'no'}</dd>
              <dt>Cross-origin isolated (threads)</dt>
              <dd>
                {device.crossOriginIsolated ? 'yes' : 'no, single thread'}
              </dd>
              <dt>Storage used / quota (MB)</dt>
              <dd>
                {device.storageUsageMb ?? '?'} / {device.storageQuotaMb ?? '?'}
              </dd>
              <dt>Browser</dt>
              <dd className="break-all">{device.userAgent}</dd>
            </dl>
          ) : (
            <p className="text-sm">Checking…</p>
          )}
        </section>

        <section className="space-y-3 rounded-lg border bg-white p-4">
          <h2 className="font-semibold">2. Load the model</h2>
          <label className="block text-sm">
            Model URL
            <input
              className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs"
              value={modelUrl}
              onChange={(e) => setModelUrl(e.target.value)}
              disabled={busy}
            />
          </label>
          <fieldset className="flex gap-4 text-sm" disabled={busy}>
            <legend className="sr-only">Backend</legend>
            {(['wasm', 'webgpu'] as const).map((b) => (
              <label key={b} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="backend"
                  checked={backend === b}
                  onChange={() => setBackend(b)}
                />
                {b === 'wasm' ? 'CPU (WASM)' : 'GPU (WebGPU)'}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => void loadFromUrl()}
              disabled={busy}
            >
              Load model
            </button>
            <label className="cursor-pointer rounded border px-3 py-1.5 text-sm">
              Load from a downloaded file…
              <input
                type="file"
                accept=".onnx"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void loadFromFile(file);
                }}
              />
            </label>
            <button
              type="button"
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
              onClick={() => void clearCache()}
              disabled={busy}
            >
              Clear cached model
            </button>
          </div>
          {progress && (
            <p className="text-sm">
              {mb(progress.received)} / {mb(PRONUNCIATION_MODEL.bytes)} MB
              {progress.mbps && ` · ${progress.mbps} MB/s`}
            </p>
          )}
          {load && (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              <dt>Source</dt>
              <dd>{load.source}</dd>
              <dt>Bytes</dt>
              <dd>
                {load.bytes.toLocaleString()}{' '}
                {load.sizeMatchesPin ? '(matches pin)' : '(DIFFERS from pin)'}
              </dd>
              <dt>Fetch / read</dt>
              <dd>{(load.fetchMs / 1000).toFixed(1)} s</dd>
              <dt>Session create</dt>
              <dd>{(load.sessionMs / 1000).toFixed(1)} s</dd>
              <dt>Backend / threads</dt>
              <dd>
                {load.backend} / {load.threads}
              </dd>
              <dt>JS heap after load</dt>
              <dd>{load.heapMb != null ? `${load.heapMb} MB` : 'unknown'}</dd>
              {load.cacheWriteError && (
                <>
                  <dt>Cache write</dt>
                  <dd className="text-red-700">{load.cacheWriteError}</dd>
                </>
              )}
            </dl>
          )}
        </section>

        <section className="space-y-3 rounded-lg border bg-white p-4">
          <h2 className="font-semibold">3. Decode</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => void decodeClips()}
              disabled={busy || !load}
            >
              Decode the 5 clips
            </button>
            <button
              type="button"
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
              onClick={() => void recordMic()}
              disabled={busy || !load}
            >
              Record {MIC_SECONDS} s from the mic
            </button>
          </div>
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-1 pr-3">Clip</th>
                    <th className="pr-3">Pass</th>
                    <th className="pr-3">Audio s</th>
                    <th className="pr-3">Prep ms</th>
                    <th className="pr-3">Infer ms</th>
                    <th className="pr-3">× real time</th>
                    <th className="pr-3">Heard</th>
                    <th className="pr-3">Python q4</th>
                    <th>Target</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b font-mono text-xs">
                      <td className="py-1 pr-3 font-sans">{r.clip}</td>
                      <td className="pr-3">{r.pass}</td>
                      <td className="pr-3">{r.audioSeconds}</td>
                      <td className="pr-3">{r.prepMs}</td>
                      <td className="pr-3">{r.inferMs}</td>
                      <td className="pr-3">{r.realTimeFactor}</td>
                      <td className="pr-3 text-base">{r.output || '∅'}</td>
                      <td className="pr-3">
                        {r.python == null
                          ? '-'
                          : r.python === r.output
                            ? '✓ same'
                            : `≠ ${r.python}`}
                      </td>
                      <td>{r.target ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p role="status" className="text-sm">
          Status: {status}
        </p>
        {error && (
          <p
            role="alert"
            className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800"
          >
            {error}
          </p>
        )}

        <section className="space-y-2 rounded-lg border bg-white p-4">
          <h2 className="font-semibold">4. Report</h2>
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm"
            onClick={() => void navigator.clipboard?.writeText(report)}
          >
            Copy report
          </button>
          <pre className="max-h-64 overflow-auto rounded bg-slate-100 p-2 text-xs">
            {report}
          </pre>
        </section>
      </div>
    </div>
  );
};
