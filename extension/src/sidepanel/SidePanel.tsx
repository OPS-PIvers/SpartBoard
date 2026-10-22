import type { RecordedWebStep } from '@/components/tours/web/recorderProtocol';
import { MAX_TIP_CHARS } from '@/components/tours/web/recorderProtocol';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Circle, MapPin, Send, Square, Trash2 } from 'lucide-react';
import {
  chromeMuted,
  focusRing,
  headerBar,
  iconBtn,
  inputLight,
  primaryBtn,
  secondaryBtn,
} from '@/components/common/lightChrome';
import { cropRect } from '../recorder/geometry';
import {
  isRecorderInternal,
  PANEL_PORT,
  type RecorderPick,
  type RecorderStatus,
} from '../recorder/messages';
import { BlurBoxes } from '@/components/tours/web/BlurBoxes';
import { cropScreenshot, finishPicture } from './pictures';
import { loadUnsent, saveUnsent, type PanelStep, type Unsent } from './unsent';

const KEEP_ALIVE_MS = 20_000;
const SAVE_DELAY_MS = 400;
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

const card = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
const samePick = (a?: RecorderPick | null, b?: RecorderPick | null) =>
  !!a && !!b && a.setId === b.setId && a.stepId === b.stepId;

const dangerBtn = `rounded-lg bg-brand-red-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-red-dark ${focusRing}`;
const disabledLook = 'disabled:cursor-not-allowed disabled:opacity-50';

const toRecorded = async (s: PanelStep): Promise<RecordedWebStep> => {
  const picture = s.picture ? await finishPicture(s.picture, s.blur) : null;
  const tip = s.tip.trim();
  return {
    id: s.capture.id,
    urlPattern: s.capture.urlPattern,
    action: s.capture.action,
    locator: s.capture.locator,
    ...(picture ? { picture } : {}),
    ...(tip ? { tip } : {}),
  };
};

const StepCard: React.FC<{
  step: PanelStep;
  index: number;
  locked: boolean;
  withTip: boolean;
  numbered?: boolean;
  onChange: (next: PanelStep) => void;
  onDelete?: () => void;
}> = ({
  step,
  index,
  locked,
  withTip,
  numbered = true,
  onChange,
  onDelete,
}) => {
  const [blurring, setBlurring] = useState(false);
  return (
    <li className={`flex flex-col gap-2 rounded-2xl p-3 ${card}`}>
      <div className="flex items-center gap-2">
        {numbered && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-blue-lighter text-xs font-semibold text-brand-blue-primary">
            {index + 1}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{clueOf(step)}</span>
          <span className={`block truncate text-xs ${chromeMuted}`}>
            {hostOf(step.capture.urlPattern)}
          </span>
        </span>
        {onDelete && (
          <button
            type="button"
            className={`${iconBtn} ${disabledLook}`}
            disabled={locked}
            aria-label={`Delete step ${index + 1}`}
            title="Delete step"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {step.pending ? (
        <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
      ) : step.picture ? (
        <>
          {/* Locked while sending, so what goes out matches what is shown. */}
          <div
            className={
              blurring && !locked ? '' : 'pointer-events-none select-none'
            }
          >
            <BlurBoxes
              picture={step.picture}
              boxes={step.blur}
              label={`Picture for step ${index + 1}`}
              onChange={(blur) => {
                if (!locked) onChange({ ...step, blur });
              }}
            />
          </div>
          <div>
            <button
              type="button"
              className={`${secondaryBtn} ${disabledLook}`}
              disabled={locked}
              aria-pressed={blurring}
              onClick={() => setBlurring((b) => !b)}
            >
              {blurring ? 'Done blurring' : 'Blur'}
            </button>
          </div>
        </>
      ) : (
        <span className={`text-xs ${chromeMuted}`}>No picture</span>
      )}
      {withTip && (
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          Tip
          <textarea
            className={`min-h-[3.5rem] rounded-lg px-2 py-1.5 text-sm font-normal ${inputLight}`}
            value={step.tip}
            maxLength={MAX_TIP_CHARS}
            disabled={locked}
            onChange={(e) => onChange({ ...step, tip: e.target.value })}
          />
        </label>
      )}
    </li>
  );
};

export const SidePanel: React.FC = () => {
  const [status, setStatus] = useState<RecorderStatus | null>(null);
  const [steps, setSteps] = useState<PanelStep[] | null>(null);
  const [fix, setFix] = useState<PanelStep | null>(null);
  const [target, setTarget] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const picking = useRef<RecorderPick | null>(null);

  const refresh = useCallback(() => {
    void send<RecorderStatus>({ type: 'rec/status' }).then((s) => {
      picking.current = s.pick
        ? { setId: s.pick.setId, stepId: s.pick.stepId }
        : null;
      // A fix picked for another step, or nobody waiting any more, can't be sent.
      setFix((f) => (f && samePick(f.fixFor, s.pick) ? f : null));
      setStatus(s);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadUnsent().then((saved) => {
      if (cancelled) return;
      setSteps(saved.steps);
      setFix(saved.fix);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [saveFailed, setSaveFailed] = useState(false);
  const unsent = useRef<Unsent | null>(null);
  useLayoutEffect(() => {
    unsent.current = steps === null ? null : { steps, fix };
  }, [steps, fix]);

  // Kept until sent or discarded; saved after typing pauses, and once more as the panel closes.
  useEffect(() => {
    if (steps === null) return;
    const timer = setTimeout(
      () => void saveUnsent({ steps, fix }).then((ok) => setSaveFailed(!ok)),
      SAVE_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [steps, fix]);
  useEffect(() => {
    const flush = () => {
      if (unsent.current) void saveUnsent(unsent.current);
    };
    addEventListener('pagehide', flush);
    return () => removeEventListener('pagehide', flush);
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
      const placed: PanelStep = {
        capture,
        picture: null,
        blur: [],
        tip: '',
        pending: true,
      };
      // A click while SpartBoard asks for a fix is that fix, not a new step.
      const asFix = picking.current;
      if (asFix) placed.fixFor = asFix;
      const update = (fn: (s: PanelStep) => PanelStep) =>
        asFix
          ? setFix((f) => (f && f.capture.id === capture.id ? fn(f) : f))
          : setSteps((all) =>
              (all ?? []).map((x) => (x.capture.id === capture.id ? fn(x) : x))
            );
      // Placed now so steps keep their order while pictures decode.
      if (asFix) setFix(placed);
      else setSteps((all) => [...(all ?? []), placed]);
      const done = (picture: Blob | null) =>
        update((x) => ({ ...x, picture, pending: false }));
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
  const pick = status?.pick ?? null;
  const list = steps ?? [];
  // Shown and sent only for the step the worker is still asking about.
  const pickedFix = fix && samePick(fix.fixFor, pick) ? fix : null;

  const startRecording = async () => {
    setError('');
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id === undefined) return;
    const ok = await send<boolean>({ type: 'rec/start', tabId: tab.id });
    if (!ok) setError("This page can't be recorded. Open the website first.");
  };

  const stopRecording = () => send({ type: 'rec/stop' });

  const sendSteps = async () => {
    if (!chosen || list.length === 0 || list.some((s) => s.pending)) return;
    setBusy(true);
    setError('');
    try {
      // Steps captured while sending stay in the list; only sent ones leave it.
      for (let i = 0; i < list.length; i += SEND_BATCH) {
        const out = await Promise.all(
          list.slice(i, i + SEND_BATCH).map(toRecorded)
        );
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
        setSteps((all) => (all ?? []).filter((x) => !sent.has(x.capture.id)));
      }
    } catch {
      setError("Steps couldn't be sent. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const sendFix = async () => {
    const picked = pickedFix;
    if (!picked?.fixFor || picked.pending) return;
    setBusy(true);
    setError('');
    try {
      const ok = await send<boolean>({
        type: 'rec/sendFix',
        ...picked.fixFor,
        step: await toRecorded(picked),
      });
      if (ok) setFix(null);
      else setError('The web tour is no longer open in SpartBoard.');
    } catch {
      setError("The fix couldn't be sent. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const cancelFix = async () => {
    if (recording) await stopRecording();
    setFix(null);
    await send({ type: 'rec/cancelPick' });
  };

  if (!status || steps === null) return null;

  return (
    <main className="flex min-h-screen flex-col bg-slate-50 font-sans text-sm text-slate-900 antialiased">
      <header className={`flex items-center gap-2 px-4 py-3 ${headerBar}`}>
        <img src="../icon-128.png" alt="" className="h-6 w-6 rounded" />
        <h1 className="text-base font-semibold">Record a web tour</h1>
      </header>
      <div className="flex flex-1 flex-col gap-3 p-4">
        {!staff ? (
          <p className="text-slate-700">
            Sign in to Chrome with your Orono staff account to record tours.
          </p>
        ) : pick ? (
          <section className={`flex flex-col gap-3 rounded-2xl p-4 ${card}`}>
            <h2 className="flex items-start gap-2 font-semibold">
              <MapPin
                className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue-primary"
                aria-hidden="true"
              />
              Fix a step in {pick.title || 'Untitled tour'}
            </h2>
            {pickedFix ? (
              <ol className="flex flex-col">
                <StepCard
                  step={pickedFix}
                  index={0}
                  locked={busy}
                  withTip={false}
                  numbered={false}
                  onChange={setFix}
                />
              </ol>
            ) : recording ? (
              <p className="text-slate-700">
                Click the right control on the page.
              </p>
            ) : null}
            {error && (
              <p role="alert" className="text-brand-red-primary">
                {error}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className={`${secondaryBtn} ${disabledLook}`}
                disabled={busy}
                onClick={() => void cancelFix()}
              >
                Cancel
              </button>
              {pickedFix ? (
                <button
                  type="button"
                  className={`${primaryBtn} inline-flex items-center gap-1.5 ${disabledLook}`}
                  disabled={busy || pickedFix.pending}
                  onClick={() => void sendFix()}
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {busy ? 'Sending...' : 'Send fix'}
                </button>
              ) : (
                !recording && (
                  <button
                    type="button"
                    className={`${primaryBtn} inline-flex items-center gap-1.5`}
                    onClick={() => void startRecording()}
                  >
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    Pick on this page
                  </button>
                )
              )}
            </div>
          </section>
        ) : (
          <>
            {tours.length === 0 ? (
              <p className="text-slate-700">
                Open a web tour in SpartBoard and press Record steps.
              </p>
            ) : tours.length === 1 ? (
              <p className="text-slate-700">
                Sending to{' '}
                <span className="font-semibold text-slate-900">
                  {chosen?.title || 'Untitled tour'}
                </span>
              </p>
            ) : (
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                Sending to
                <select
                  className={`rounded-lg px-2 py-1.5 text-sm font-normal ${inputLight}`}
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
            {recording ? (
              <button
                type="button"
                className={`${dangerBtn} inline-flex items-center justify-center gap-1.5 py-2`}
                onClick={() => void stopRecording()}
              >
                <Square className="h-4 w-4 fill-current" aria-hidden="true" />
                Stop recording
              </button>
            ) : (
              <button
                type="button"
                className={`${primaryBtn} inline-flex items-center justify-center gap-1.5 py-2`}
                onClick={() => void startRecording()}
              >
                <Circle className="h-4 w-4 fill-current" aria-hidden="true" />
                Record
              </button>
            )}
            {error && (
              <p role="alert" className="text-brand-red-primary">
                {error}
              </p>
            )}
            {list.length > 0 && (
              <>
                {saveFailed && (
                  <p role="status" className="text-amber-800">
                    {"These steps aren't kept if you close the panel."}
                  </p>
                )}
                <ol className="flex flex-col gap-3">
                  {list.map((s, i) => (
                    <StepCard
                      key={s.capture.id}
                      step={s}
                      index={i}
                      locked={busy}
                      withTip
                      onChange={(next) =>
                        setSteps((all) =>
                          (all ?? []).map((x) =>
                            x.capture.id === s.capture.id ? next : x
                          )
                        )
                      }
                      onDelete={() =>
                        setSteps((all) =>
                          (all ?? []).filter(
                            (x) => x.capture.id !== s.capture.id
                          )
                        )
                      }
                    />
                  ))}
                </ol>
                <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
                  <button
                    type="button"
                    className={`${secondaryBtn} ${disabledLook}`}
                    disabled={busy}
                    onClick={() => setSteps([])}
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    disabled={!chosen || busy || list.some((s) => s.pending)}
                    className={`${primaryBtn} inline-flex items-center gap-1.5 ${disabledLook}`}
                    onClick={() => void sendSteps()}
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    {busy
                      ? 'Sending...'
                      : `Send ${list.length} ${list.length === 1 ? 'step' : 'steps'}`}
                  </button>
                </div>
              </>
            )}
            {status.unsaved > 0 && (
              <p className={chromeMuted}>
                {status.unsaved} sent{' '}
                {status.unsaved === 1 ? 'step is' : 'steps are'} waiting for
                SpartBoard to save {status.unsaved === 1 ? 'it' : 'them'}.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
};
