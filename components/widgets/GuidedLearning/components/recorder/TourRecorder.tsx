import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Circle,
  Flag,
  GripVertical,
  Pause,
  Play,
  Square,
  Trash2,
} from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';
import {
  useTourCapture,
  type CaptureError,
  type TourRecording,
} from './useTourCapture';
import type { NameMatcher } from './redaction';

const ERROR_KEYS: Record<CaptureError, string> = {
  unsupported: 'glRecorder.unsupported',
  'not-chrome': 'glRecorder.notChrome',
  cancelled: 'glRecorder.cancelled',
  'not-this-tab': 'glRecorder.notThisTab',
};

interface TourRecorderProps {
  /** Roster names blurred into every frame. */
  matcher: NameMatcher | null;
  onFinish: (recording: TourRecording) => void;
  onDiscard: () => void;
  /** Re-record one step: finishes on the first captured click. */
  single?: boolean;
}

const btn =
  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-slate-100 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-50';

export const RECORDER_POS_KEY = 'spart_tour_recorder_pos';
const KEY_STEP = 20;

interface Pos {
  x: number;
  y: number;
}

const readPos = (): Pos | null => {
  try {
    const raw = localStorage.getItem(RECORDER_POS_KEY);
    const pos = raw ? (JSON.parse(raw) as Partial<Pos>) : null;
    return pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)
      ? { x: pos.x as number, y: pos.y as number }
      : null;
  } catch {
    return null;
  }
};

const writePos = (pos: Pos | null) => {
  try {
    if (pos) localStorage.setItem(RECORDER_POS_KEY, JSON.stringify(pos));
    else localStorage.removeItem(RECORDER_POS_KEY);
  } catch {
    // Storage blocked: the position just isn't remembered.
  }
};

/** Keeps the whole pill inside the viewport. */
const clampPos = (
  pos: Pos,
  size: { w: number; h: number },
  view = { w: window.innerWidth, h: window.innerHeight }
): Pos => ({
  x: Math.round(Math.min(Math.max(pos.x, 0), Math.max(view.w - size.w, 0))),
  y: Math.round(Math.min(Math.max(pos.y, 0), Math.max(view.h - size.h, 0))),
});

/** Floating recorder pill; the capture never sees it and anchor resolution skips it. */
export const TourRecorder: React.FC<TourRecorderProps> = ({
  matcher,
  onFinish,
  onDiscard,
  single = false,
}) => {
  const { t } = useTranslation();
  const pillRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(readPos);
  const drag = useRef<{ dx: number; dy: number; pointer: number } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const finishingRef = useRef(false);
  const finishWith = (finish: () => Promise<TourRecording>) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    void finish().then(onFinish);
  };
  const capture = useTourCapture({
    chromeRef: pillRef,
    matcher,
    // Single mode finishes itself once the one click lands.
    onStep: single ? (_count, finish) => finishWith(finish) : undefined,
  });
  const { status, stepCount } = capture;
  const live = status === 'recording' || status === 'paused';
  const message = capture.error ? t(ERROR_KEYS[capture.error]) : null;

  const sizeOf = () => {
    const r = pillRef.current?.getBoundingClientRect();
    return { w: r?.width ?? 0, h: r?.height ?? 0 };
  };
  const moveTo = (next: Pos, persist: boolean) => {
    const clamped = clampPos(next, sizeOf());
    setPos(clamped);
    if (persist) writePos(clamped);
  };

  // A remembered spot from a larger window is pulled back on screen.
  const placed = pos !== null;
  useEffect(() => {
    if (!placed) return;
    const refit = () => setPos((p) => (p ? clampPos(p, sizeOf()) : p));
    const raf = requestAnimationFrame(refit);
    window.addEventListener('resize', refit);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', refit);
    };
  }, [placed]);

  const onGripDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const r = pillRef.current?.getBoundingClientRect();
    if (!r) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = {
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      pointer: e.pointerId,
    };
  };
  const onGripMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    moveTo({ x: e.clientX - d.dx, y: e.clientY - d.dy }, false);
  };
  const onGripUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    moveTo({ x: e.clientX - d.dx, y: e.clientY - d.dy }, true);
  };
  const onGripKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const step = delta[e.key];
    const r = pillRef.current?.getBoundingClientRect();
    if (!step || !r) return;
    e.preventDefault();
    moveTo({ x: r.left + step[0], y: r.top + step[1] }, true);
  };
  const resetPos = () => {
    setPos(null);
    writePos(null);
  };

  return createPortal(
    <div
      ref={pillRef}
      role="toolbar"
      aria-label={t('glRecorder.label')}
      data-tour-ignore=""
      data-testid="tour-recorder"
      className={`fixed flex flex-col items-center gap-1 rounded-2xl bg-slate-900/90 px-2 py-1.5 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-xl ${
        pos ? '' : 'left-1/2 -translate-x-1/2'
      }`}
      style={{
        zIndex: Z_INDEX.tour,
        ...(pos
          ? { left: pos.x, top: pos.y }
          : { top: 'calc(1rem + env(safe-area-inset-top, 0px))' }),
      }}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-testid="tour-recorder-grip"
          className="flex cursor-grab touch-none items-center self-stretch rounded-full px-1 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:cursor-grabbing"
          aria-label={t('glRecorder.move')}
          title={t('glRecorder.moveHint')}
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          onKeyDown={onGripKey}
          onDoubleClick={resetPos}
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
        {live ? (
          <span role="status" className="px-2 text-sm font-semibold">
            {single && status === 'recording'
              ? t('glRecorder.rerecordPrompt')
              : t(
                  status === 'recording'
                    ? 'glRecorder.recording'
                    : 'glRecorder.paused',
                  { count: stepCount }
                )}
          </span>
        ) : (
          <button
            type="button"
            className={btn}
            disabled={status === 'starting'}
            onClick={() => void capture.start()}
          >
            <Circle className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            {t('glRecorder.record')}
          </button>
        )}
        {status === 'recording' && (
          <>
            <button type="button" className={btn} onClick={capture.pause}>
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              {t('glRecorder.pause')}
            </button>
            <button
              type="button"
              className={btn}
              title={t('glRecorder.markStepHint')}
              onClick={capture.markStep}
            >
              <Flag className="h-3.5 w-3.5" aria-hidden="true" />
              {t('glRecorder.markStep')}
            </button>
          </>
        )}
        {status === 'paused' && (
          <button type="button" className={btn} onClick={capture.resume}>
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            {t('glRecorder.resume')}
          </button>
        )}
        {live && !single && (
          <button
            type="button"
            className={btn}
            disabled={stepCount === 0 || finishing}
            onClick={() => finishWith(capture.finish)}
          >
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
            {t('glRecorder.finish')}
          </button>
        )}
        <button
          type="button"
          className={btn}
          onClick={() => {
            capture.discard();
            onDiscard();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t(single ? 'glRecorder.cancel' : 'glRecorder.discard')}
        </button>
      </div>
      {message && (
        <p role="alert" className="px-2 pb-0.5 text-xs text-slate-200">
          {message}
        </p>
      )}
    </div>,
    document.body
  );
};
