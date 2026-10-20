// On-device pronunciation check (#2350, P3): the real Speak recognizer and capture path. Dev builds and the spartboard-dev site only.
import React, {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import angloUrl from '../../scripts/spikes/pronunciation-bias-probe/audio/pero_anglo_r_human.wav?url';
import tapUrl from '../../scripts/spikes/pronunciation-bias-probe/audio/pero_tap_human.wav?url';
import trill1Url from '../../scripts/spikes/pronunciation-bias-probe/audio/perro_trill_human_1.wav?url';
import trill2Url from '../../scripts/spikes/pronunciation-bias-probe/audio/perro_trill_human_2.wav?url';
import trill3Url from '../../scripts/spikes/pronunciation-bias-probe/audio/perro_trill_human_3.wav?url';
import {
  PRONUNCIATION_MODEL,
  SPEAK_CAPTURE,
} from '@/config/pronunciationModel';
import { useAudioRecording, type AudioTake } from '@/hooks/useAudioRecording';
import { MODEL_SAMPLE_RATE } from '@/utils/pronunciation/audio';
import { clearModelCache } from '@/utils/pronunciation/modelCache';
import {
  createRecognizer,
  defaultModelUrls,
  isMeteredConnection,
  type Recognizer,
  type RecognizerState,
} from '@/utils/pronunciation/recognizer';
import type { RecordingConfig } from '@/types';

const URL_KEY = 'pronunciationDev.modelUrl';
const MIC_SECONDS = 3;
const MIC_CONFIG: RecordingConfig = {
  prepSeconds: 0,
  limitSeconds: MIC_SECONDS,
  prepExpiry: 'armed',
  takeLimit: null,
};

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

interface DeviceInfo {
  userAgent: string;
  cores: number;
  deviceMemoryGb: number | null;
  crossOriginIsolated: boolean;
  metered: boolean;
  storageQuotaMb: number | null;
  storageUsageMb: number | null;
}

interface LoadResult {
  url: string;
  readyMs: number;
  heapMb: number | null;
}

interface DecodeRow {
  clip: string;
  pass: 'cold' | 'warm' | 'mic';
  audioSeconds: number;
  decodeMs: number;
  realTimeFactor: number;
  confidence: number;
  voicedMs: number;
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
  const nav = navigator as Navigator & { deviceMemory?: number };
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
    metered: isMeteredConnection(),
    storageQuotaMb: quota,
    storageUsageMb: usage,
  };
}

function defaultUrl(): string {
  return defaultModelUrls()[0] ?? PRONUNCIATION_MODEL.huggingFaceUrl;
}

const IDLE: RecognizerState = { kind: 'idle' };

function describeState(s: RecognizerState): string {
  switch (s.kind) {
    case 'idle':
      return 'Not loaded';
    case 'needs-download':
      return `Needs a ${mb(s.bytes)} MB download`;
    case 'downloading':
      return `Downloading ${mb(s.loaded)} / ${mb(s.total)} MB`;
    case 'starting':
      return 'Starting the model…';
    case 'ready':
      return 'Ready';
    case 'unsupported':
      return `Unsupported: ${s.reason}`;
  }
}

export const PronunciationDevHarness: React.FC = () => {
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [modelUrl, setModelUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(URL_KEY) ?? defaultUrl();
    } catch {
      return defaultUrl();
    }
  });
  const [recognizer, setRecognizer] = useState<
    (Recognizer & { dispose(): void }) | null
  >(null);
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState<string | null>(null);
  const [load, setLoad] = useState<LoadResult | null>(null);
  const [rows, setRows] = useState<DecodeRow[]>([]);
  const [busy, setBusy] = useState(false);

  const subscribe = useCallback(
    (cb: () => void) => recognizer?.subscribe(cb) ?? (() => undefined),
    [recognizer]
  );
  const modelState = useSyncExternalStore(subscribe, () =>
    recognizer ? recognizer.state() : IDLE
  );

  useEffect(() => {
    let cancelled = false;
    void probeDevice().then((info) => {
      if (!cancelled) setDevice(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The recognizer owns a Worker; terminate it when it is replaced or the page closes.
  useEffect(() => () => recognizer?.dispose(), [recognizer]);

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
    }
  };

  const loadModel = () =>
    run('Loading model…', async () => {
      try {
        localStorage.setItem(URL_KEY, modelUrl);
      } catch {
        // Remembering the URL is a convenience only.
      }
      const next = createRecognizer({ urls: [modelUrl] });
      setRecognizer(next);
      setLoad(null);
      const t0 = performance.now();
      await next.prepare({ allowMetered: true });
      const s = next.state();
      if (s.kind !== 'ready') throw new Error(describeState(s));
      setLoad({
        url: modelUrl,
        readyMs: Math.round(performance.now() - t0),
        heapMb: heapMb(),
      });
    });

  const clearCache = () =>
    run('Clearing cached model…', async () => {
      await clearModelCache();
      setDevice(await probeDevice());
    });

  const decode = async (
    audio: Blob,
    meta: Pick<DecodeRow, 'clip' | 'pass' | 'python' | 'target'>
  ) => {
    if (!recognizer) throw new Error('Load the model first.');
    const r = await recognizer.recognize(audio);
    const audioSeconds = r.audio16k.length / MODEL_SAMPLE_RATE;
    setRows((prev) => [
      ...prev,
      {
        ...meta,
        audioSeconds: Number(audioSeconds.toFixed(2)),
        decodeMs: r.decodeMs,
        realTimeFactor: Number(
          (r.decodeMs / 1000 / Math.max(audioSeconds, 0.01)).toFixed(2)
        ),
        confidence: Number(r.confidence.toFixed(3)),
        voicedMs: r.voicedMs,
        output: r.tokens.map((t) => t.symbol).join(''),
      },
    ]);
  };

  const decodeClips = () =>
    run('Decoding clips…', async () => {
      const pass: DecodeRow['pass'] = rows.some((r) => r.pass === 'cold')
        ? 'warm'
        : 'cold';
      for (const clip of CLIPS) {
        setStatus(`Decoding ${clip.name} (${pass})…`);
        const blob = await (await fetch(clip.url)).blob();
        await decode(blob, {
          clip: clip.name,
          pass,
          python: clip.python,
          target: clip.target,
        });
      }
    });

  const onTakeReady = (take: AudioTake) =>
    void run('Decoding microphone take…', () =>
      decode(take.blob, {
        clip: `microphone (${take.mimeType})`,
        pass: 'mic',
        python: null,
        target: 'pero',
      })
    );

  const mic = useAudioRecording({
    config: MIC_CONFIG,
    enabled: true,
    onTakeReady,
    audioBitsPerSecond: SPEAK_CAPTURE.audioBitsPerSecond,
    constraints: SPEAK_CAPTURE.constraints,
  });
  const recording = mic.phase === 'recording';

  const report = JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      model: PRONUNCIATION_MODEL.id,
      capture: SPEAK_CAPTURE,
      device,
      modelState,
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
            Runs Speak&apos;s recognizer ({mb(PRONUNCIATION_MODEL.bytes)} MB
            model in a Worker) on the five committed clips and on the microphone
            at Speak&apos;s capture settings. Nothing is uploaded.
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
              <dt>Cross-origin isolated (threads)</dt>
              <dd>
                {device.crossOriginIsolated ? 'yes' : 'no, single thread'}
              </dd>
              <dt>Metered connection</dt>
              <dd>{device.metered ? 'yes' : 'no'}</dd>
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => void loadModel()}
              disabled={busy}
            >
              Load model
            </button>
            <button
              type="button"
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
              onClick={() => void clearCache()}
              disabled={busy}
            >
              Clear cached model
            </button>
          </div>
          <p className="text-sm">Model: {describeState(modelState)}</p>
          {load && (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              <dt>Ready after</dt>
              <dd>{(load.readyMs / 1000).toFixed(1)} s</dd>
              <dt>JS heap (page)</dt>
              <dd>{load.heapMb != null ? `${load.heapMb} MB` : 'unknown'}</dd>
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
              disabled={busy || recording || modelState.kind !== 'ready'}
            >
              Decode the 5 clips
            </button>
            <button
              type="button"
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
              onClick={() => (recording ? mic.stop() : void mic.start())}
              disabled={busy || modelState.kind !== 'ready'}
            >
              {recording
                ? `Stop (${mic.recordSecondsLeft ?? 0} s left)`
                : `Record ${MIC_SECONDS} s from the mic, say "perro"`}
            </button>
          </div>
          {mic.phase === 'capture-unavailable' && (
            <p className="text-sm text-red-700">
              Microphone {mic.micState === 'denied' ? 'blocked' : 'unavailable'}
              .
            </p>
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-1 pr-3">Clip</th>
                    <th className="pr-3">Pass</th>
                    <th className="pr-3">Trimmed s</th>
                    <th className="pr-3">Decode ms</th>
                    <th className="pr-3">× real time</th>
                    <th className="pr-3">Confidence</th>
                    <th className="pr-3">Voiced ms</th>
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
                      <td className="pr-3">{r.decodeMs}</td>
                      <td className="pr-3">{r.realTimeFactor}</td>
                      <td className="pr-3">{r.confidence}</td>
                      <td className="pr-3">{r.voicedMs}</td>
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
