import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { GuidedLearningTourBinding } from '@/types';
import { canCaptureDisplay, grabFrame } from '../../utils/displayCapture';
import {
  rectToImagePct,
  resolveRecordedAnchor,
  type RecordedPlacement,
} from './resolveAnchor';

export interface RecordedStep extends RecordedPlacement {
  id: string;
  tour: GuidedLearningTourBinding;
  /** Index into the recording's frames. */
  frameIndex: number;
  untagged: boolean;
  suggestedId?: string;
}

export interface TourRecording {
  frames: Blob[];
  steps: RecordedStep[];
}

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
}

/** Records a click-through of this tab: a frame and a tour-bound step per click. */
export function useTourCapture({ chromeRef }: Options) {
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [error, setError] = useState<CaptureError | null>(null);
  const [stepCount, setStepCount] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recording = useRef<TourRecording>({ frames: [], steps: [] });
  const hovered = useRef<Element | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    videoRef.current = null;
  };

  const reset = () => {
    stopStream();
    recording.current = { frames: [], steps: [] };
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
    recording.current = { frames: [], steps: [] };
    setStepCount(0);
    track.onended = () => {
      stopStream();
      setStatus((s) => (s === 'idle' ? s : 'paused'));
    };
    setStatus('recording');
  };

  /** Grabs a frame with the recorder hidden and appends a step bound to `target`. */
  const capture = async (
    target: Element,
    action: GuidedLearningTourBinding['action']
  ) => {
    const video = videoRef.current;
    const resolved = resolveRecordedAnchor(target);
    if (!video || !resolved) return;
    const rect = resolved.element.getBoundingClientRect();
    const viewport = { w: window.innerWidth, h: window.innerHeight };
    const chrome = chromeRef.current;
    const prev = chrome?.style.visibility ?? '';
    if (chrome) chrome.style.visibility = 'hidden';
    let frame: Blob | null = null;
    try {
      await nextFrame();
      frame = await grabFrame(video);
    } finally {
      if (chrome) chrome.style.visibility = prev;
    }
    if (!frame) return;
    const placement = rectToImagePct(rect, viewport, {
      w: video.videoWidth,
      h: video.videoHeight,
    });
    const rec = recording.current;
    rec.frames.push(frame);
    rec.steps.push({
      id: newId(),
      ...placement,
      tour: {
        anchor: resolved.anchor,
        ...(resolved.fallback ? { fallback: resolved.fallback } : {}),
        action,
      },
      frameIndex: rec.frames.length - 1,
      untagged: resolved.untagged,
      ...(resolved.suggestedId ? { suggestedId: resolved.suggestedId } : {}),
    });
    setStepCount(rec.steps.length);
  };

  const onPointerDown = useEffectEvent((e: PointerEvent) => {
    if (e.button !== 0 || !(e.target instanceof Element)) return;
    void capture(e.target, 'click');
  });
  const onPointerMove = useEffectEvent((e: PointerEvent) => {
    if (e.target instanceof Element) hovered.current = e.target;
  });
  const markStep = () => {
    if (status !== 'recording' || !hovered.current) return;
    void capture(hovered.current, 'observe');
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

  const finish = (): TourRecording => {
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
