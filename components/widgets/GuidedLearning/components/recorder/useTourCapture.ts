import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { GuidedLearningTourBinding } from '@/types';
import { accessibleName, roleOf } from '@/components/tours/resolveTourAnchor';
import { canCaptureDisplay, grabFrame } from '../../utils/displayCapture';
import { redactImage, type RedactRect } from '../../utils/redactImage';
import type { UnmappedAnchorContext } from '@/components/tours/anchorQueue';
import {
  captureUnmappedContext,
  rectToImagePct,
  resolveRecordedAnchor,
  suggestAnchorId,
  type RecordedAnchor,
  type RecordedPlacement,
} from './resolveAnchor';
import {
  collectRedactionRects,
  scrubFallback,
  toFrameRedactions,
  type NameMatcher,
} from './redaction';
import type { RecordedBoardWidget } from './recordedLayouts';

export interface RecordedStep extends RecordedPlacement {
  id: string;
  tour: GuidedLearningTourBinding;
  /** Index into the recording's frames. */
  frameIndex: number;
  untagged: boolean;
  suggestedId?: string;
  /** The board widget the click landed in, from its `data-tour-widget` ancestor. */
  widgetId?: string;
  /** Widget layouts at the moment of the click. */
  board?: RecordedBoardWidget[];
  /** Redacted structure of an untagged click, for the unmapped-anchor queue. */
  context?: UnmappedAnchorContext;
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

/** Longest wait for the shared tab to deliver a frame painted after the pill hid. */
export const FRESH_FRAME_TIMEOUT_MS = 300;

// The capture stream trails the page, so the video's current frame can still show the pill.
const freshFrame = (video: HTMLVideoElement, since: number) =>
  new Promise<void>((resolve) => {
    if (typeof video.requestVideoFrameCallback !== 'function') {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, FRESH_FRAME_TIMEOUT_MS);
    let seen = 0;
    // Without a capture time, the second new frame is the first sure to post-date the hide.
    const check: VideoFrameRequestCallback = (_now, meta) => {
      seen++;
      if (
        meta.captureTime === undefined ? seen >= 2 : meta.captureTime > since
      ) {
        clearTimeout(timer);
        resolve();
      } else video.requestVideoFrameCallback(check);
    };
    video.requestVideoFrameCallback(check);
  });

// Controls that open a menu, popover or panel.
const OPENER =
  '[aria-haspopup]:not([aria-haspopup="false"]), [aria-expanded], [aria-controls]';

/** The menu or panel opener a click landed on, if any. */
export const panelOpenerOf = (target: Element): HTMLElement | null =>
  target.closest('[data-tour-ignore]')
    ? null
    : target.closest<HTMLElement>(OPENER);

/** The widget instance an element belongs to, including portalled settings panels. */
export const widgetIdOf = (el: Element): string | undefined =>
  el.closest('[data-tour-widget]')?.getAttribute('data-tour-widget') ??
  undefined;

/** Like `resolveRecordedAnchor`, but an untagged opener inside a tagged container binds to the opener itself. */
export function resolveCaptureTarget(target: Element): RecordedAnchor | null {
  const resolved = resolveRecordedAnchor(target);
  const opener = panelOpenerOf(target);
  if (!resolved || !opener || resolved.untagged) return resolved;
  // A tagged opener, or a tagged part of one, already names the step.
  if (opener.contains(resolved.element)) return resolved;
  const role = roleOf(opener);
  const name = accessibleName(opener);
  const fallback = role && name ? { role, name } : undefined;
  return {
    anchor: '',
    fallback,
    untagged: true,
    suggestedId: suggestAnchorId(fallback),
    element: opener,
  };
}

const TOGGLE = '[role="switch"], [role="checkbox"], input[type="checkbox"]';

const isOn = (el: Element): boolean =>
  el instanceof HTMLInputElement
    ? el.checked
    : el.getAttribute('aria-checked') === 'true';

/** The on/off control a click lands on, through its label, with the state the click leaves it in. */
export function toggleOf(
  target: Element,
  /** A keyboard click: a native checkbox has already flipped by then. */
  afterDefault = false
): { element: Element; value: boolean } | null {
  if (target.closest('[data-tour-ignore]')) return null;
  const label = target.closest('label')?.control;
  const element =
    target.closest(TOGGLE) ??
    (label instanceof HTMLInputElement && label.type === 'checkbox'
      ? label
      : null);
  if (!element || element.matches(':disabled, [aria-disabled="true"]'))
    return null;
  const flipped = afterDefault && element instanceof HTMLInputElement;
  return { element, value: flipped ? isOn(element) : !isOn(element) };
}

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'number',
]);

/** Longest typed value a step keeps. */
export const MAX_TYPED_CHARS = 500;

/** A text field whose typing becomes a `type` step; never a password. */
export const typedFieldOf = (
  el: EventTarget | null
): HTMLInputElement | HTMLTextAreaElement | null => {
  if (!(el instanceof Element) || el.closest('[data-tour-ignore]')) return null;
  if (el instanceof HTMLTextAreaElement) return el;
  return el instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(el.type)
    ? el
    : null;
};

/** What a recorded value may keep: nothing from a `data-pii` control or a roster name. */
export const recordableValue = (
  el: Element,
  value: string,
  matcher: NameMatcher | null,
  label = ''
): string =>
  el.closest('[data-pii]') ||
  matcher?.test(value) ||
  (label && matcher?.test(label))
    ? ''
    : value.slice(0, MAX_TYPED_CHARS);

/** The value a custom listbox option stands for. */
export const optionValueOf = (option: Element): string =>
  option.getAttribute('data-value') ??
  option.getAttribute('value') ??
  (option.textContent ?? '').trim();

const newId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `rec-${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface Options {
  /** The recorder's own UI, hidden while a frame is grabbed. */
  chromeRef: React.RefObject<HTMLElement | null>;
  /** Roster names to blur in every frame. */
  matcher: NameMatcher | null;
  /** Called each time a captured step lands, with the count and the hook's own finish. */
  onStep?: (count: number, finish: () => Promise<TourRecording>) => void;
  /** Reads the board's widget layouts when a click is captured. */
  snapshot?: () => RecordedBoardWidget[];
}

/** Records a click-through of this tab: a frame and a tour-bound step per click. */
export function useTourCapture({
  chromeRef,
  matcher,
  onStep,
  snapshot,
}: Options) {
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
    const before = rec.steps.length;
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
    if (rec.steps.length > before) onStep?.(rec.steps.length, finish);
  };

  /** Grabs a frame with the recorder hidden, blurs names and `data-pii` into it, and builds a step bound to `target`. */
  const grab = async (
    target: Element,
    action: GuidedLearningTourBinding['action'],
    value: GuidedLearningTourBinding['value']
  ): Promise<Captured | null> => {
    const video = videoRef.current;
    const resolved = resolveCaptureTarget(target);
    if (!video || !resolved) return null;
    const fallback = scrubFallback(resolved.fallback, matcher);
    const suggestedId = fallback ? resolved.suggestedId : undefined;
    // Read before the app reacts to the click and the element changes.
    const context = resolved.untagged
      ? captureUnmappedContext(resolved.element, {
          matcher,
          fallback,
          suggestedId,
        })
      : undefined;
    const rect = resolved.element.getBoundingClientRect();
    // Before the app reacts, so a click that moves or opens a widget is seen after it.
    const board = snapshot?.();
    const viewport = { w: window.innerWidth, h: window.innerHeight };
    // Before and after the app reacts to the click, so a name that moves is covered in both places.
    const rects = collectRedactionRects(document.body, matcher, viewport);
    let raw: Blob | null = null;
    hideChrome();
    try {
      await nextFrame();
      rects.push(...collectRedactionRects(document.body, matcher, viewport));
      await freshFrame(video, performance.now());
      raw = await grabFrame(video);
    } finally {
      showChrome();
    }
    if (!raw) return null;
    const size = { w: video.videoWidth, h: video.videoHeight };
    const boxes = toFrameRedactions(rects, viewport, size);
    const frame = await redactImage(raw, boxes, { mode: 'blur' });
    const widgetId = widgetIdOf(resolved.element) ?? widgetIdOf(target);
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
          ...(value !== undefined ? { value } : {}),
        },
        frameIndex: -1,
        untagged: resolved.untagged,
        ...(suggestedId ? { suggestedId } : {}),
        ...(widgetId ? { widgetId } : {}),
        ...(board ? { board } : {}),
        ...(context ? { context } : {}),
      },
    };
  };

  const capture = (
    target: Element,
    action: GuidedLearningTourBinding['action'],
    value?: GuidedLearningTourBinding['value']
  ) => {
    const { gen } = seq.current;
    const n = seq.current.next++;
    const job = grab(target, action, value)
      .catch(() => null)
      .then((entry) => {
        if (seq.current.gen !== gen) return;
        done.current.set(n, entry);
        flush();
      });
    inflight.current.add(job);
    void job.finally(() => inflight.current.delete(job));
  };

  // The field being typed into; its step lands when focus leaves it, Enter is pressed or another click starts.
  const typing = useRef<{
    field: HTMLInputElement | HTMLTextAreaElement;
    changed: boolean;
  } | null>(null);
  const commitTyping = () => {
    const pending = typing.current;
    typing.current = null;
    if (!pending?.changed || !pending.field.isConnected) return;
    const { field } = pending;
    capture(field, 'type', recordableValue(field, field.value, matcher));
  };

  const onPointerDown = useEffectEvent((e: PointerEvent) => {
    if (e.button !== 0 || !(e.target instanceof Element)) return;
    const target = e.target;
    if (typing.current?.field !== typedFieldOf(target)) commitTyping();
    // Text fields and native selects record what is typed or chosen, not the click into them.
    if (typedFieldOf(target) || target.closest('select')) return;
    const toggle = toggleOf(target);
    if (toggle) {
      capture(toggle.element, 'toggle', toggle.value);
      return;
    }
    const option = target.closest('[role="option"]');
    if (option && !option.closest('[data-tour-ignore]')) {
      const label = (option.textContent ?? '').trim();
      capture(
        option,
        'select',
        recordableValue(option, optionValueOf(option), matcher, label)
      );
      return;
    }
    capture(target, 'click');
  });
  // Keyboard-opened menus never see a pointerdown, but the opener is still its own step.
  const onClick = useEffectEvent((e: MouseEvent) => {
    if (e.detail !== 0 || !(e.target instanceof Element)) return;
    const toggle = toggleOf(e.target, true);
    if (toggle) {
      capture(toggle.element, 'toggle', toggle.value);
      return;
    }
    const opener = panelOpenerOf(e.target);
    if (opener) capture(opener, 'click');
  });
  const onChange = useEffectEvent((e: Event) => {
    const select = e.target;
    if (
      !(select instanceof HTMLSelectElement) ||
      select.closest('[data-tour-ignore]')
    )
      return;
    const label = select.selectedOptions[0]?.textContent?.trim() ?? '';
    capture(
      select,
      'select',
      recordableValue(select, select.value, matcher, label)
    );
  });
  const onFocusIn = useEffectEvent((e: FocusEvent) => {
    const field = typedFieldOf(e.target);
    if (field && typing.current?.field !== field) {
      commitTyping();
      typing.current = { field, changed: false };
    }
  });
  const onInput = useEffectEvent((e: Event) => {
    const field = typedFieldOf(e.target);
    if (!field) return;
    if (typing.current?.field !== field) {
      commitTyping();
      typing.current = { field, changed: true };
    } else typing.current.changed = true;
  });
  const onFocusOut = useEffectEvent((e: FocusEvent) => {
    if (typing.current && e.target === typing.current.field) commitTyping();
  });
  // The pill is skipped, so pressing Mark step marks what was hovered before it.
  const onPointerMove = useEffectEvent((e: PointerEvent) => {
    if (e.target instanceof Element && !e.target.closest('[data-tour-ignore]'))
      hovered.current = e.target;
  });
  const markStep = () => {
    if (status !== 'recording' || !hovered.current) return;
    commitTyping();
    capture(hovered.current, 'observe');
  };
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    // Before the app handles Enter, which often clears the field.
    if (
      e.key === 'Enter' &&
      e.target instanceof HTMLInputElement &&
      typing.current?.field === e.target
    ) {
      commitTyping();
      typing.current = { field: e.target, changed: false };
      return;
    }
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
    const click = (e: MouseEvent) => onClick(e);
    const change = (e: Event) => onChange(e);
    const focusIn = (e: FocusEvent) => onFocusIn(e);
    const input = (e: Event) => onInput(e);
    const focusOut = (e: FocusEvent) => onFocusOut(e);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('click', click, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('change', change, true);
    window.addEventListener('focusin', focusIn, true);
    window.addEventListener('input', input, true);
    window.addEventListener('focusout', focusOut, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('click', click, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('change', change, true);
      window.removeEventListener('focusin', focusIn, true);
      window.removeEventListener('input', input, true);
      window.removeEventListener('focusout', focusOut, true);
    };
  }, [status]);

  // Stop sharing if the recorder unmounts mid-recording.
  useEffect(() => {
    const stream = streamRef;
    return () => stream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const finish = async (): Promise<TourRecording> => {
    commitTyping();
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
