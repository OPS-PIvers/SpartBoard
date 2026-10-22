import type { RecordedWebStep } from '@/components/tours/web/recorderProtocol';
import React, { useCallback, useEffect, useState } from 'react';
import type { RedactRect } from '@/components/widgets/GuidedLearning/utils/redactImage';
import { cropRect } from '../recorder/geometry';
import {
  isRecorderInternal,
  PANEL_PORT,
  type RawCapture,
  type RecorderStatus,
} from '../recorder/messages';
import { BlurBoxes } from './BlurBoxes';
import { cropScreenshot, finishPicture } from './pictures';

interface PanelStep {
  capture: Omit<RawCapture, 'screenshot'>;
  picture: Blob | null;
  blur: RedactRect[];
  pending: boolean;
}

const KEEP_ALIVE_MS = 20_000;
// Keeps each message well under Chrome's message and session-storage limits.
const SEND_BATCH = 10;

const send = <T,>(msg: object): Promise<T> => chrome.runtime.sendMessage(msg);

const clueOf = (s: PanelStep) =>
  s.capture.locator.name ||
  s.capture.locator.text ||
  s.capture.locator.role ||
  'Click';

const hostOf = (urlPattern: string) => {
  try {
    return new URL(urlPattern.replace(/\*/g, 'x')).host;
  } catch {
    return '';
  }
};

export const SidePanel: React.FC = () => {
  const [status, setStatus] = useState<RecorderStatus | null>(null);
  const [steps, setSteps] = useState<PanelStep[]>([]);
  const [target, setTarget] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    void send<RecorderStatus>({ type: 'rec/status' }).then(setStatus);
  }, []);

  useEffect(() => {
    // The worker stops recording when this port closes; reconnect if the worker restarts.
    let port: chrome.runtime.Port | null = null;
    let closed = false;
    const open = () => {
      port = chrome.runtime.connect({ name: PANEL_PORT });
      port.onDisconnect.addListener(() => {
        if (!closed) setTimeout(open, 500);
      });
    };
    open();
    // Messages keep the worker awake while the panel is open.
    const keepAlive = setInterval(refresh, KEEP_ALIVE_MS);
    const onMessage = (msg: unknown, sender: chrome.runtime.MessageSender) => {
      if (sender.id !== chrome.runtime.id || sender.tab) return;
      if (isRecorderInternal(msg, 'rec/changed')) refresh();
      if (!isRecorderInternal(msg, 'rec/captured')) return;
      const { screenshot, ...capture } = msg.capture;
      // Placed now so steps keep their order while pictures decode.
      setSteps((s) => [
        ...s,
        { capture, picture: null, blur: [], pending: true },
      ]);
      const done = (picture: Blob | null) =>
        setSteps((s) =>
          s.map((x) =>
            x.capture.id === capture.id ? { ...x, picture, pending: false } : x
          )
        );
      // No picture when the click couldn't be placed: an uncropped screen shows too much.
      if (!screenshot || !capture.target) {
        done(null);
        return;
      }
      const target = capture.target;
      const image = new Image();
      image.onload = () => {
        const crop = cropRect(target, capture.viewport, {
          w: image.naturalWidth,
          h: image.naturalHeight,
        });
        void cropScreenshot(screenshot, crop)
          .catch(() => null)
          .then(done);
      };
      image.onerror = () => done(null);
      image.src = screenshot;
    };
    chrome.runtime.onMessage.addListener(onMessage);
    refresh();
    return () => {
      closed = true;
      clearInterval(keepAlive);
      chrome.runtime.onMessage.removeListener(onMessage);
      port?.disconnect();
    };
  }, [refresh]);

  const tours = status?.tours ?? [];
  const chosen = tours.find((t) => t.setId === target) ?? tours[0];
  const recording = status?.recordingTabId != null;
  const staff = status?.profile === 'staff';

  const toggleRecording = async () => {
    setError('');
    if (recording) {
      await send({ type: 'rec/stop' });
      return;
    }
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id === undefined) return;
    const ok = await send<boolean>({ type: 'rec/start', tabId: tab.id });
    if (!ok) setError("This page can't be recorded. Open the website first.");
  };

  const sendSteps = async () => {
    if (!chosen || steps.length === 0 || steps.some((s) => s.pending)) return;
    setBusy(true);
    setError('');
    try {
      // Steps captured while sending stay in the list; only sent ones leave it.
      for (let i = 0; i < steps.length; i += SEND_BATCH) {
        const out: RecordedWebStep[] = [];
        for (const s of steps.slice(i, i + SEND_BATCH)) {
          const picture = s.picture
            ? await finishPicture(s.picture, s.blur)
            : undefined;
          out.push({
            id: s.capture.id,
            urlPattern: s.capture.urlPattern,
            action: s.capture.action,
            locator: s.capture.locator,
            ...(picture ? { picture } : {}),
          });
        }
        const ok = await send<boolean>({
          type: 'rec/send',
          setId: chosen.setId,
          steps: out,
        });
        if (!ok) {
          setError('The web tour is no longer open in SpartBoard.');
          return;
        }
        const sent = new Set(out.map((o) => o.id));
        setSteps((all) => all.filter((x) => !sent.has(x.capture.id)));
      }
    } catch {
      setError("Steps couldn't be sent. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  return (
    <main className="flex min-h-screen flex-col gap-3 bg-white p-4 text-sm text-slate-800">
      <h1 className="text-base font-semibold text-slate-900">
        Record a web tour
      </h1>
      {!staff ? (
        <p>Sign in to Chrome with your Orono staff account to record tours.</p>
      ) : (
        <>
          {tours.length === 0 ? (
            <p>
              Open a web tour in SpartBoard and press Record steps. Steps you
              record here are sent to it.
            </p>
          ) : tours.length === 1 ? (
            <p>
              Sending to{' '}
              <span className="font-semibold">
                {chosen?.title || 'Untitled tour'}
              </span>
            </p>
          ) : (
            <label className="flex flex-col gap-1">
              Sending to
              <select
                className="rounded-md border border-slate-300 px-2 py-1"
                value={chosen?.setId}
                onChange={(e) => setTarget(e.target.value)}
              >
                {tours.map((t) => (
                  <option key={t.setId} value={t.setId}>
                    {t.title || 'Untitled tour'}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className={`rounded-md px-3 py-2 font-semibold text-white ${
              recording
                ? 'bg-red-700 hover:bg-red-800'
                : 'bg-blue-700 hover:bg-blue-800'
            }`}
            onClick={() => void toggleRecording()}
          >
            {recording ? 'Stop recording' : 'Record'}
          </button>
          {recording && (
            <p className="text-slate-600">
              Click through the website. Each click becomes a step.
            </p>
          )}
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          {steps.length > 0 && (
            <>
              <p className="text-slate-600">
                Drag across a picture to blur student names or anything private.
                Steps not sent yet are lost if you close this panel.
              </p>
              <ol className="flex flex-col divide-y divide-slate-200">
                {steps.map((s, i) => (
                  <li key={s.capture.id} className="flex flex-col gap-2 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">
                        {i + 1}. {clueOf(s)}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        className="shrink-0 text-slate-600 underline hover:text-slate-900 disabled:opacity-50"
                        onClick={() =>
                          setSteps((all) => all.filter((x) => x !== s))
                        }
                      >
                        Delete
                      </button>
                    </div>
                    <span className="truncate text-xs text-slate-500">
                      {hostOf(s.capture.urlPattern)}
                    </span>
                    {s.pending ? null : s.picture ? (
                      // Locked while sending, so what goes out matches what is shown.
                      <div
                        className={busy ? 'pointer-events-none opacity-60' : ''}
                      >
                        <BlurBoxes
                          picture={s.picture}
                          boxes={s.blur}
                          label={`Picture for step ${i + 1}`}
                          onChange={(blur) => {
                            if (busy) return;
                            setSteps((all) =>
                              all.map((x) => (x === s ? { ...x, blur } : x))
                            );
                          }}
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">No picture</span>
                    )}
                  </li>
                ))}
              </ol>
              <button
                type="button"
                disabled={!chosen || busy}
                className="rounded-md bg-slate-900 px-3 py-2 font-semibold text-white disabled:opacity-50"
                onClick={() => void sendSteps()}
              >
                {busy
                  ? 'Sending...'
                  : `Send ${steps.length} ${steps.length === 1 ? 'step' : 'steps'} to SpartBoard`}
              </button>
            </>
          )}
          {status.unsaved > 0 && (
            <p className="text-slate-600">
              {status.unsaved} sent{' '}
              {status.unsaved === 1 ? 'step is' : 'steps are'} waiting for
              SpartBoard to save {status.unsaved === 1 ? 'it' : 'them'}.
            </p>
          )}
        </>
      )}
    </main>
  );
};
