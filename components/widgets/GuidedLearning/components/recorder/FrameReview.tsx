import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Copy, Upload, X } from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';
import { redactImage, type RedactRect } from '../../utils/redactImage';
import type { TourRecording } from './useTourCapture';

/** Smallest drawn area, in image-%, so a stray click draws nothing. */
const MIN_RECT_PCT = 1;

const clampPct = (v: number) => Math.min(100, Math.max(0, v));

interface Point {
  x: number;
  y: number;
}

const rectFrom = (a: Point, b: Point): RedactRect => ({
  xPct: Math.min(a.x, b.x),
  yPct: Math.min(a.y, b.y),
  wPct: Math.abs(a.x - b.x),
  hPct: Math.abs(a.y - b.y),
});

const boxStyle = (r: RedactRect): React.CSSProperties => ({
  left: `${r.xPct}%`,
  top: `${r.yPct}%`,
  width: `${r.wPct}%`,
  height: `${r.hPct}%`,
});

// Paints a frame into a canvas; the canvas's own size gives the review its aspect ratio.
const FrameCanvas: React.FC<{ frame: Blob; label: string }> = ({
  frame,
  label,
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (typeof createImageBitmap !== 'function') return;
    let cancelled = false;
    void createImageBitmap(frame).then((bitmap) => {
      const canvas = ref.current;
      if (!cancelled && canvas) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      }
      bitmap.close();
    });
    return () => {
      cancelled = true;
    };
  }, [frame]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      className="block h-auto max-h-[62vh] w-auto max-w-full"
    />
  );
};

interface FrameReviewProps {
  recording: TourRecording;
  /** Receives the reviewed frames: the recorder's redacted frames, with any extra blur baked in. */
  onUpload: (frames: Blob[]) => void;
  onDiscard: () => void;
  /** Progress text while uploading; the controls lock while it is set. */
  busy?: string | null;
  error?: string | null;
}

/** Mandatory check of every recorded frame before any of them upload. */
export const FrameReview: React.FC<FrameReviewProps> = ({
  recording,
  onUpload,
  onDiscard,
  busy = null,
  error = null,
}) => {
  const { t } = useTranslation();
  const total = recording.frames.length;
  const [frames, setFrames] = useState(recording.frames);
  const [boxes, setBoxes] = useState(recording.redactions);
  const [index, setIndex] = useState(0);
  const [viewed, setViewed] = useState<ReadonlySet<number>>(() => new Set([0]));
  const [pending, setPending] = useState<RedactRect[]>([]);
  const [draft, setDraft] = useState<RedactRect | null>(null);
  const [applying, setApplying] = useState(false);
  const [blurError, setBlurError] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const startRef = useRef<Point | null>(null);

  const allViewed = viewed.size >= total;
  const locked = !!busy || applying;
  const steps = recording.steps.filter((s) => s.frameIndex === index);
  const untagged = steps.filter((s) => s.untagged);

  const goTo = (next: number) => {
    if (next < 0 || next >= total) return;
    setIndex(next);
    setPending([]);
    setBlurError(false);
    setViewed((prev) => new Set(prev).add(next));
  };

  const toPct = (e: React.PointerEvent<HTMLElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: clampPct(((e.clientX - r.left) / (r.width || 1)) * 100),
      y: clampPct(((e.clientY - r.top) / (r.height || 1)) * 100),
    };
  };

  const applyBlur = async () => {
    if (pending.length === 0) return;
    setApplying(true);
    setBlurError(false);
    try {
      const out = await redactImage(frames[index], pending, { mode: 'blur' });
      setFrames((prev) => prev.map((f, i) => (i === index ? out : f)));
      setBoxes((prev) =>
        prev.map((b, i) => (i === index ? [...b, ...pending] : b))
      );
      setPending([]);
    } catch {
      setBlurError(true);
    } finally {
      setApplying(false);
    }
  };

  const copyId = (id: string) => {
    void navigator.clipboard?.writeText(id).then(() => setCopied(id));
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gl-frame-review-title"
      data-tour-ignore=""
      className="fixed inset-0 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      style={{ zIndex: Z_INDEX.tour }}
    >
      <div className="flex max-h-full w-full max-w-5xl flex-col gap-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="gl-frame-review-title"
              className="text-lg font-bold text-slate-900"
            >
              {t('glRecorder.reviewTitle')}
            </h2>
            <p className="text-sm text-slate-600">
              {t('glRecorder.reviewBody')}
            </p>
          </div>
          <button
            type="button"
            onClick={onDiscard}
            disabled={locked}
            aria-label={t('glRecorder.reviewDiscard')}
            className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex items-center justify-center rounded-xl bg-slate-100 p-2">
          <div className="relative inline-block">
            <FrameCanvas
              frame={frames[index]}
              label={t('glRecorder.reviewFrame', {
                current: index + 1,
                total,
              })}
            />
            <div
              data-testid="gl-frame-review-draw"
              className="absolute inset-0 cursor-crosshair"
              onPointerDown={(e) => {
                if (e.button !== 0 || locked) return;
                startRef.current = toPct(e);
                e.currentTarget.setPointerCapture?.(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (startRef.current)
                  setDraft(rectFrom(startRef.current, toPct(e)));
              }}
              onPointerUp={(e) => {
                const start = startRef.current;
                startRef.current = null;
                setDraft(null);
                if (!start) return;
                const r = rectFrom(start, toPct(e));
                if (r.wPct >= MIN_RECT_PCT && r.hPct >= MIN_RECT_PCT)
                  setPending((prev) => [...prev, r]);
              }}
              onPointerCancel={() => {
                startRef.current = null;
                setDraft(null);
              }}
            >
              {(boxes[index] ?? []).map((r, i) => (
                <div
                  key={`done-${i}`}
                  data-testid="gl-frame-review-blurred"
                  className="pointer-events-none absolute rounded-sm ring-2 ring-sky-500"
                  style={boxStyle(r)}
                />
              ))}
              {[...pending, ...(draft ? [draft] : [])].map((r, i) => (
                <div
                  key={`new-${i}`}
                  className="pointer-events-none absolute rounded-sm bg-white/30 ring-2 ring-amber-500"
                  style={boxStyle(r)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              disabled={index === 0 || locked}
              aria-label={t('glRecorder.reviewPrev')}
              className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="min-w-28 text-center text-sm font-semibold text-slate-700">
              {t('glRecorder.reviewFrame', { current: index + 1, total })}
            </span>
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              disabled={index >= total - 1 || locked}
              aria-label={t('glRecorder.reviewNext')}
              className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {pending.length > 0 && (
              <button
                type="button"
                onClick={() => setPending([])}
                disabled={locked}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                {t('glRecorder.reviewClear')}
              </button>
            )}
            <button
              type="button"
              onClick={() => void applyBlur()}
              disabled={pending.length === 0 || locked}
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
            >
              {pending.length > 0
                ? t('glRecorder.reviewBlur', { count: pending.length })
                : t('glRecorder.reviewBlurIdle')}
            </button>
          </div>
        </div>

        {blurError && (
          <p role="alert" className="text-sm font-semibold text-red-700">
            {t('glRecorder.reviewBlurFailed')}
          </p>
        )}

        {untagged.length > 0 && (
          <section
            aria-label={t('glRecorder.untaggedTitle')}
            className="rounded-xl border border-slate-200 p-3"
          >
            <h3 className="text-sm font-bold text-slate-800">
              {t('glRecorder.untaggedTitle')}
            </h3>
            <p className="mb-2 text-xs text-slate-600">
              {t('glRecorder.untaggedBody')}
            </p>
            <ul className="flex flex-col gap-1">
              {untagged.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">
                    {s.suggestedId ?? t('glRecorder.untaggedNoId')}
                  </code>
                  {s.suggestedId && (
                    <button
                      type="button"
                      onClick={() => s.suggestedId && copyId(s.suggestedId)}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand-blue-primary hover:bg-slate-100"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      {copied === s.suggestedId
                        ? t('glRecorder.copied')
                        : t('glRecorder.copyId')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <p role="status" className="text-sm text-slate-600">
            {busy ??
              error ??
              t('glRecorder.reviewViewed', { viewed: viewed.size, total })}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDiscard}
              disabled={locked}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {t('glRecorder.reviewDiscard')}
            </button>
            <button
              type="button"
              onClick={() => onUpload(frames)}
              disabled={!allViewed || pending.length > 0 || locked}
              title={allViewed ? undefined : t('glRecorder.reviewUploadHint')}
              className="flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue-dark disabled:opacity-40"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {t('glRecorder.reviewUpload')}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
};
