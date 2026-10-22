// Drives web tour playback in the installed extension with the fixture tour. Dev builds and the spartboard-dev site only.
import React, { useRef, useState } from 'react';
import { fixtureTourStart } from './webTourFixture';
import { WEB_TOUR_FIXTURE_PATH } from './WebTourFixtureSite';

const ID_KEY = 'webTourPlaybackDev.extensionId';

interface ExternalPort {
  postMessage: (msg: unknown) => void;
  onMessage: { addListener: (cb: (msg: unknown) => void) => void };
  onDisconnect: { addListener: (cb: () => void) => void };
}
interface ExternalRuntime {
  sendMessage: (id: string, msg: unknown, cb: (reply: unknown) => void) => void;
  connect: (id: string, info: { name: string }) => ExternalPort;
  lastError?: { message?: string };
}

const runtime = (): ExternalRuntime | null =>
  (globalThis as { chrome?: { runtime?: ExternalRuntime } }).chrome?.runtime ?? null;

const readId = () => {
  try {
    return localStorage.getItem(ID_KEY) ?? import.meta.env.VITE_SPART_EXTENSION_ID ?? '';
  } catch {
    return import.meta.env.VITE_SPART_EXTENSION_ID ?? '';
  }
};

const btn =
  'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50';

export const WebTourPlaybackDevHarness: React.FC = () => {
  const [id, setId] = useState(readId);
  const [stepIndex, setStepIndex] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const port = useRef<ExternalPort | null>(null);
  const add = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${line}`, ...l].slice(0, 100));

  const send = (msg: unknown, label: string) => {
    const rt = runtime();
    if (!rt || !id) {
      add('No extension: chrome.runtime is missing or the id is empty.');
      return;
    }
    rt.sendMessage(id, msg, (reply) => {
      add(`${label}: ${rt.lastError ? `error ${rt.lastError.message}` : JSON.stringify(reply)}`);
    });
  };

  const watch = () => {
    const rt = runtime();
    if (!rt || !id || port.current) return;
    const p = rt.connect(id, { name: 'web-tour' });
    p.onMessage.addListener((msg) => add(`port: ${JSON.stringify(msg)}`));
    p.onDisconnect.addListener(() => {
      add('port closed');
      port.current = null;
    });
    p.postMessage({ type: 'web-tour/watch', setId: 'fixture-web-tour' });
    port.current = p;
    add('watching fixture-web-tour');
  };

  const saveId = (next: string) => {
    setId(next);
    try {
      localStorage.setItem(ID_KEY, next);
    } catch {
      // Storage blocked: the id lasts for this visit.
    }
  };

  return (
    <div className="h-screen [height:100dvh] overflow-y-auto bg-slate-50">
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6 pb-16">
        <h1 className="text-xl font-bold">Web tour playback harness</h1>
        <p className="text-sm text-slate-600">
          Plays the fixture tour on <a className="underline" href={WEB_TOUR_FIXTURE_PATH}>the fixture site</a> through the
          installed dev extension. Steps cover an in-app route change, a control that appears late, a tie broken by
          position, a frame, a full page load and the picture fallback.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          Extension id
          <input value={id} onChange={(e) => saveId(e.target.value.trim())} className="rounded border border-slate-300 px-2 py-1 font-mono" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={() => send({ type: 'ping' }, 'ping')}>
            Ping
          </button>
          <button type="button" className={btn} onClick={watch}>
            Watch progress
          </button>
          <label className="flex items-center gap-1 text-sm">
            From step
            <input
              type="number"
              min={0}
              max={6}
              value={stepIndex}
              onChange={(e) => setStepIndex(Number(e.target.value) || 0)}
              className="w-16 rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <button
            type="button"
            className={btn}
            onClick={() => {
              watch();
              send(fixtureTourStart(window.location.origin, stepIndex), 'start');
            }}
          >
            Play fixture tour
          </button>
        </div>
        <ol className="flex flex-col gap-1 font-mono text-xs text-slate-700">
          {log.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ol>
      </main>
    </div>
  );
};
