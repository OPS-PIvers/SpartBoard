import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { logError } from '@/utils/logError';
import {
  parseRecorderPortMessage,
  RECORDER_PORT,
  type RecordedWebStep,
} from './recorderProtocol';

const KEEP_ALIVE_MS = 25_000;
const RECONNECT_MS = 1_000;
const MAX_RECONNECTS = 5;

export type RecorderLink = 'off' | 'connecting' | 'connected' | 'unavailable';

interface ChromePort {
  postMessage: (msg: unknown) => void;
  disconnect: () => void;
  onMessage: { addListener: (fn: (msg: unknown) => void) => void };
  onDisconnect: { addListener: (fn: () => void) => void };
}

interface ChromeRuntime {
  connect?: (id: string, info: { name: string }) => ChromePort;
}

const extensionId = (): string =>
  (import.meta.env.VITE_SPART_EXTENSION_ID as string | undefined) ?? '';

const runtime = (): ChromeRuntime | null =>
  (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime ??
  null;

/** Opens the recorder port for one web tour draft; each recorded step is saved by `onStep`, then acknowledged. */
export function useWebTourRecorder({
  setId,
  title,
  onStep,
}: {
  setId: string;
  title: string;
  onStep: (step: RecordedWebStep) => Promise<void>;
}): { link: RecorderLink; connect: () => void; disconnect: () => void } {
  const [link, setLink] = useState<RecorderLink>('off');
  const port = useRef<ChromePort | null>(null);
  const onStepRef = useRef(onStep);
  const done = useRef(new Set<string>());
  const queue = useRef<Promise<void>>(Promise.resolve());

  useLayoutEffect(() => {
    onStepRef.current = onStep;
  }, [onStep]);

  const wanted = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };

  const disconnect = useCallback(() => {
    wanted.current = false;
    clearTimers();
    port.current?.disconnect();
    port.current = null;
    setLink('off');
  }, []);

  const open = useCallback(
    (retries: number) => {
      const openPort = (left: number): void => {
        if (port.current) return;
        const id = extensionId();
        const connectFn = runtime()?.connect;
        if (!id || !connectFn) {
          setLink('unavailable');
          return;
        }
        let p: ChromePort;
        try {
          p = connectFn(id, { name: RECORDER_PORT });
        } catch {
          setLink('unavailable');
          return;
        }
        port.current = p;
        setLink('connecting');
        let attached = false;
        // Re-attaching is harmless and keeps the extension's worker from going idle.
        const keepAlive = setInterval(
          () => p.postMessage({ type: 'recorder/attach', setId, title }),
          KEEP_ALIVE_MS
        );
        p.onDisconnect.addListener(() => {
          clearInterval(keepAlive);
          if (port.current !== p) return;
          port.current = null;
          // The worker restarted: reconnect, and unacknowledged steps are re-sent.
          if (attached && wanted.current && left > 0) {
            setLink('connecting');
            timers.current.push(
              setTimeout(() => openPort(left - 1), RECONNECT_MS)
            );
            return;
          }
          setLink(attached ? 'off' : 'unavailable');
        });
        p.onMessage.addListener((raw) => {
          const msg = parseRecorderPortMessage(raw);
          if (!msg || msg.setId !== setId) return;
          if (msg.type === 'recorder/attached') {
            attached = true;
            setLink('connected');
          }
          if (msg.type !== 'recorder/step') return;
          const step = msg.step;
          // One at a time, so steps keep their recorded order.
          queue.current = queue.current.then(async () => {
            if (!done.current.has(step.id)) {
              try {
                await onStepRef.current(step);
                done.current.add(step.id);
              } catch (err) {
                logError('web tour recorder step', err, { setId });
                return;
              }
            }
            p.postMessage({ type: 'recorder/ack', setId, stepId: step.id });
          });
        });
        p.postMessage({ type: 'recorder/attach', setId, title });
      };
      openPort(retries);
    },
    [setId, title]
  );

  const connect = useCallback(() => {
    wanted.current = true;
    open(MAX_RECONNECTS);
  }, [open]);

  useEffect(() => disconnect, [disconnect, setId]);

  return { link, connect, disconnect };
}
