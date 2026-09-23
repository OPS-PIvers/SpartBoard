import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { GuidedLearningTourBinding } from '@/types';
import { canCaptureDisplay, grabFrame } from '../../utils/displayCapture';
import { redactImage, type RedactRect } from '../../utils/redactImage';
import {
  rectToImagePct,
  resolveRecordedAnchor,
  type RecordedPlacement,
} from './resolveAnchor';
import {
  collectRedactionRects,
  scrubFallback,
  toFrameRedactions,
  type NameMatcher,
} from './redaction';

export interface RecordedStep extends RecordedPlacement {
  id: string;
  tour: GuidedLearningTourBinding;
  /** Index into the recording's frames. */
  frameIndex: number;
  untagged: boolean;
  suggestedId?: string;
}

export interface TourRecording {
  /** Already redacted; the raw frames never leave `capture`. */
  frames: Blob[];
  /** The automatic blur boxes baked into each frame, for review. */
  redactions: RedactRect[][];
  steps: RecordedStep[];
}

const emptyRecording = (): TourRecording => ({
  frames: [],
  redactions: [],
  steps: [],
});

type Captured = { frame: Blob; boxes: RedactRect[]; step: RecordedStep };

export type CaptureStatus = 'idle' | 'starting' | 'recording' | 'paused';

export type CaptureError =
  | 'unsupported'
  | 'not-chrome'
  | 'cancelled'
  | 'not-this-tab';

/** `preferCurrentTab` and tab-only capture are Chromium features. */
export const isChromium = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const brands = (
    navigator as Navigator & {
      userAgentData?: { brands?: { brand: string }[] };
    }
  ).userAgentData?.brands;
  if (brands) return brands.some((b) => /Chromium/.test(b.brand));
  return /Chrome\//.test(navigator.userAgent);
};

// Chromium-only options; the pointer is left out of frames because the animated cursor replaces it.
const CAPTURE_OPTIONS = {
  video: { cursor: 'never' },
  audio: false,
  preferCurrentTab: true,
  selfBrowserSurface: 'include',
} as DisplayMediaStreamOptions;

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const newId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `rec-${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface Options {
  /** The recorder's own UI, hidden while a frame is grabbed. */
  chromeRef: React.RefObject<HTMLElement | null>;
  /** Roster names to blur in every frame. */
  matcher: NameMatcher | null;
}

/** Records a click-through of this tab: a frame and a tour-bound step per click. */
export function useTourCapture({ chromeRef, matcher }: Options) {
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [error, setError] = useState<CaptureError | null>(null);
  const [stepCount, setStepCount] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recording = useRef<TourRecording>(emptyRecording());
  const hovered = useRef<Element | null>(null);
  const hiddenCount = useRef(0);
  // Captures finish out of order; they are appended in click order.
  const seq = useRef({ gen: 0, next: 0, flushed: 0 });
  const done = useRef(new Map<number, Captured | null>());
  const inflight = useRef(new Set<Promise<void>>());

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    videoRef.current = null;
  };

  const reset = () => {
    stopStream();
    recording.current = emptyRecording();
    seq.current = { gen: seq.current.gen + 1, next: 0, flushed: 0 };
    done.current.clear();
    setStepCount(0);
    setStatus('idle');
  };

  const start = async () => {
    setError(null);
    if (!canCaptureDisplay()) {
      setError('unsupported');
      return;
    }
    if (!isChromium()) {
      setError('not-chrome');
      return;
    }
    setStatus('starting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia(CAPTURE_OPTIONS);
    } catch {
      setStatus('idle');
      setError('cancelled');
      return;
    }
    const [track] = stream.getVideoTracks();
    const surface = (track?.getSettings() as { displaySurface?: string })
      .displaySurface;
    if (!track || surface !== 'browser') {
      stream.getTracks().forEach((t) => t.stop());
      setStatus('idle');
      setError('not-this-tab');
      return;
    }
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await video.play().catch(() => undefined);
    streamRef.current = stream;
    videoRef.current = video;
    recording.current = emptyRecording();
    setStepCount(0);
    track.onended = () => {
      stopStream();
      setStatus((s) => (s === 'idle' ? s : 'paused'));
    };
    setStatus('recording');
  };

  const hideChrome = () => {
    const chrome = chromeRef.current;
    if (chrome && hiddenCount.current++ === 0)
      chrome.style.visibility = 'hidden';
  };
  const showChrome = () => {
    const chrome = chromeRef.current;
    if (chrome && --hiddenCount.current === 0) chrome.style.visibility = '';
  };

  const flush = () => {
    const rec = recording.current;
    while (done.current.has(seq.current.flushed)) {
      const entry = done.current.get(seq.current.flushed);
      done.current.delete(seq.current.flushed);
      seq.current.flushed++;
      if (!entry) continue;
      rec.frames.push(entry.frame);
      rec.redactions.push(entry.boxes);
      rec.steps.push({ ...entry.step, frameIndex: rec.frames.length - 1 });
    }
    setStepCount(rec.steps.length);
  };

  /** Grabs a frame with the recorder hidden, blurs names and `data-pii` into it, and builds a step bound to `target`. */
  const grab = async (
    target: Element,
    action: GuidedLearningTourBinding['action']
  ): Promise<Captured | null> => {
    const video = videoRef.current;
    const resolved = resolveRecordedAnchor(target);
    if (!video || !resolved) return null;
    const rect = resolved.element.getBoundingClientRect();
    const viewport = { w: window.innerWidth, h: window.innerHeight };
    // Before and after the app reacts to the click, so a name that moves is covered in both places.
    const rects = collectRedactionRects(document.body, matcher, viewport);
    let raw: Blob | null = null;
    hideChrome();
    try {
      await nextFrame();
      rects.push(...collectRedactionRects(document.body, matcher, viewport));
      raw = await grabFrame(video);
    } finally {
      showChrome();
    }
    if (!raw) return null;
    const size = { w: video.videoWidth, h: video.videoHeight };
    const boxes = toFrameRedactions(rects, viewport, size);
    const frame = await redactImage(raw, boxes, { mode: 'blur' });
    const fallback = scrubFallback(resolved.fallback, matcher);
    const suggestedId = fallback ? resolved.suggestedId : undefined;
    return {
      frame,
      boxes,
      step: {
        id: newId(),
        ...rectToImagePct(rect, viewport, size),
        tour: {
          anchor: resolved.anchor,
          ...(fallback ? { fallback } : {}),
          action,
        },
        frameIndex: -1,
        untagged: resolved.untagged,
        ...(suggestedId ? { suggestedId } : {}),
      },
    };
  };

  const capture = (
    target: Element,
    action: GuidedLearningTourBinding['action']
  ) => {
    const { gen } = seq.current;
    const n = seq.current.next++;
    const job = grab(target, action)
      .catch(() => null)
      .then((entry) => {
        if (seq.current.gen !== gen) return;
        done.current.set(n, entry);
        flush();
      });
    inflight.current.add(job);
    void job.finally(() => inflight.current.delete(job));
  };

  const onPointerDown = useEffectEvent((e: PointerEvent) => {
    if (e.button !== 0 || !(e.target instanceof Element)) return;
    capture(e.target, 'click');
  });
  const onPointerMove = useEffectEvent((e: PointerEvent) => {
    if (e.target instanceof Element) hovered.current = e.target;
  });
  const markStep = () => {
    if (status !== 'recording' || !hovered.current) return;
    capture(hovered.current, 'observe');
  };
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (!e.altKey || e.code !== 'KeyM') return;
    e.preventDefault();
    markStep();
  });

  // Capture phase, so the frame and bounds are taken before the app reacts to the click.
  useEffect(() => {
    if (status !== 'recording') return;
    const down = (e: PointerEvent) => onPointerDown(e);
    const move = (e: PointerEvent) => onPointerMove(e);
    const key = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [status]);

  // Stop sharing if the recorder unmounts mid-recording.
  useEffect(() => {
    const stream = streamRef;
    return () => stream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const finish = async (): Promise<TourRecording> => {
    setStatus((s) => (s === 'recording' ? 'paused' : s));
    await Promise.all([...inflight.current]);
    const result = recording.current;
    reset();
    return result;
  };

  return {
    status,
    error,
    stepCount,
    start,
    pause: () => setStatus((s) => (s === 'recording' ? 'paused' : s)),
    resume: () =>
      setStatus((s) => (s === 'paused' && streamRef.current ? 'recording' : s)),
    markStep,
    finish,
    discard: reset,
  };
}
