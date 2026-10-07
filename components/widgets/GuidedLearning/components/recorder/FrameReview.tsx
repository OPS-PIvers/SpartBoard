import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';
import { formatUnmappedAnchors } from '@/components/tours/anchorQueue';
import { redactImage, type RedactRect } from '../../utils/redactImage';
import type { TourRecording } from './useTourCapture';
import { keepFrames } from './recordingHandoff';

/** Smallest drawn area, in image-%, so a stray click draws nothing. */
const MIN_RECT_PCT = 1;
/** Arrow-key nudge for a selected blur, in image-%. */
const NUDGE_PCT = 1;

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

const moveRect = (r: RedactRect, dx: number, dy: number): RedactRect => ({
  ...r,
  xPct: Math.min(100 - r.wPct, Math.max(0, r.xPct + dx)),
  yPct: Math.min(100 - r.hPct, Math.max(0, r.yPct + dy)),
});

type Corner = 'nw' | 'ne' | 'sw' | 'se';
const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se'];

// The corner opposite the dragged one stays put.
const anchorOf = (r: RedactRect, c: Corner): Point => ({
  x: c.endsWith('w') ? r.xPct + r.wPct : r.xPct,
  y: c.startsWith('n') ? r.yPct + r.hPct : r.yPct,
});

const sameRects = (a: readonly RedactRect[], b: readonly RedactRect[]) =>
  a.length === b.length &&
  a.every(
    (r, i) =>
      r.xPct === b[i].xPct &&
      r.yPct === b[i].yPct &&
      r.wPct === b[i].wPct &&
      r.hPct === b[i].hPct
  );

interface ReviewFrame {
  /** Index in the original recording. */
  orig: number;
  /** The frame as captured, with the automatic blur baked in. */
  frame: Blob;
  /** What the review paints: the unblurred frame when there is one, else `frame`. */
  base: Blob;
  /** Blur already baked into `base`, which can't be edited. */
  locked: RedactRect[];
  /** Editable blur as captured, and as it is now. */
  auto: RedactRect[];
  boxes: RedactRect[];
}

type Drag =
  | { kind: 'draw'; start: Point }
  | { kind: 'move'; start: Point; from: RedactRect; at: number }
  | { kind: 'resize'; fixed: Point; at: number };

const boxStyle = (r: RedactRect): React.CSSProperties => ({
  left: `${r.xPct}%`,
  top: `${r.yPct}%`,
  width: `${r.wPct}%`,
  height: `${r.hPct}%`,
});

const cornerClass: Record<Corner, string> = {
  nw: '-left-1.5 -top-1.5 cursor-nwse-resize',
  ne: '-right-1.5 -top-1.5 cursor-nesw-resize',
  sw: '-bottom-1.5 -left-1.5 cursor-nesw-resize',
  se: '-bottom-1.5 -right-1.5 cursor-nwse-resize',
};

/** The preview blur scales the frame down by this much and back up; upload bakes the real blur. */
const PREVIEW_SHRINK = 12;
/** Strip thumbnail height, in canvas px (twice the shown height). */
const THUMB_PX = 112;

// Paints a frame with its blur areas; the canvas's own size gives the review its aspect ratio.
const FrameCanvas: React.FC<{
  frame: Blob;
  boxes: readonly RedactRect[];
  label: string;
}> = ({ frame, boxes, label }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState<{
    frame: Blob;
    plain: ImageBitmap;
    small: HTMLCanvasElement;
  } | null>(null);
  useEffect(() => {
    if (typeof createImageBitmap !== 'function') return;
    let cancelled = false;
    let made: ImageBitmap | null = null;
    void createImageBitmap(frame)
      .then((plain) => {
        if (cancelled) {
          plain.close();
          return;
        }
        made = plain;
        const small = document.createElement('canvas');
        small.width = Math.max(1, Math.round(plain.width / PREVIEW_SHRINK));
        small.height = Math.max(1, Math.round(plain.height / PREVIEW_SHRINK));
        small
          .getContext('2d')
          ?.drawImage(plain, 0, 0, small.width, small.height);
        setLoaded({ frame, plain, small });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      made?.close();
    };
  }, [frame]);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !loaded || loaded.frame !== frame) return;
    const { plain, small } = loaded;
    // A closed bitmap (frame left and revisited before re-decode) reads 0×0 and would throw.
    if (plain.width === 0 || plain.height === 0) return;
    canvas.width = plain.width;
    canvas.height = plain.height;
    ctx.drawImage(plain, 0, 0);
    ctx.imageSmoothingEnabled = true;
    const k = small.width / plain.width;
    for (const r of boxes) {
      const x = (r.xPct / 100) * plain.width;
      const y = (r.yPct / 100) * plain.height;
      const w = (r.wPct / 100) * plain.width;
      const h = (r.hPct / 100) * plain.height;
      if (w >= 1 && h >= 1)
        ctx.drawImage(small, x * k, y * k, w * k, h * k, x, y, w, h);
    }
  }, [loaded, boxes, frame]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      className="block h-auto max-h-[58vh] w-auto max-w-full"
    />
  );
};

// A small picture of a frame for the strip.
const ThumbCanvas: React.FC<{ frame: Blob }> = ({ frame }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (typeof createImageBitmap !== 'function') return;
    let cancelled = false;
    void createImageBitmap(frame)
      .then((bitmap) => {
        const canvas = ref.current;
        if (!cancelled && canvas) {
          canvas.height = THUMB_PX;
          canvas.width = Math.round((bitmap.width / bitmap.height) * THUMB_PX);
          canvas
            .getContext('2d')
            ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        }
        bitmap.close();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [frame]);
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      width={96}
      height={THUMB_PX}
      className="block h-14 w-auto bg-slate-100"
    />
  );
};

interface FrameReviewProps {
  recording: TourRecording;
  /** Receives the reviewed recording: kept frames only, with the blur as reviewed baked in. */
  onUpload: (reviewed: TourRecording) => void;
  onDiscard: () => void;
  /** Label for the button that finishes the review. */
  uploadLabel?: string;
  /** Progress text while uploading; the controls lock while it is set. */
  busy?: string | null;
  error?: string | null;
}

/** Optional check of the recorded frames before they upload: edit the blur, drop frames. */
export const FrameReview: React.FC<FrameReviewProps> = ({
  recording,
  onUpload,
  onDiscard,
  uploadLabel,
  busy = null,
  error = null,
}) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<ReviewFrame[]>(() =>
    recording.frames.map((frame, orig) => {
      const raw = recording.raw?.[orig];
      const captured = recording.redactions[orig] ?? [];
      return raw
        ? {
            orig,
            frame,
            base: raw,
            locked: [],
            auto: captured,
            boxes: captured,
          }
        : { orig, frame, base: frame, locked: captured, auto: [], boxes: [] };
    })
  );
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [removed, setRemoved] = useState<{
    item: ReviewFrame;
    at: number;
  } | null>(null);
  const [draft, setDraft] = useState<RedactRect | null>(null);
  const [applying, setApplying] = useState(false);
  const [blurError, setBlurError] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const layerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  // Baked frames by original index and blur, so a retried upload reuses the same Blob.
  const baked = useRef(new Map<number, { boxes: RedactRect[]; blob: Blob }>());

  const total = items.length;
  const current = items[index] as ReviewFrame | undefined;
  const locked = !!busy || applying;
  const blurredCount = items.filter(
    (it) => it.boxes.length + it.locked.length > 0
  ).length;
  const steps = current
    ? recording.steps.filter((s) => s.frameIndex === current.orig)
    : [];
  const untagged = steps.filter((s) => s.untagged);
  const changed = !!current && !sameRects(current.boxes, current.auto);

  const show = (next: number) => {
    setIndex(next);
    setSelected(null);
    setBlurError(false);
  };
  const goTo = (next: number) => {
    if (next < 0 || next >= total) return;
    show(next);
  };

  const setBoxes = (update: (boxes: RedactRect[]) => RedactRect[]) => {
    if (!current) return;
    setItems((prev) =>
      prev.map((it) =>
        it.orig === current.orig ? { ...it, boxes: update(it.boxes) } : it
      )
    );
  };
  const removeBox = (at: number) => {
    setBoxes((boxes) => boxes.filter((_, i) => i !== at));
    setSelected(null);
  };

  const removeFrame = () => {
    if (!current) return;
    const next = items.filter((_, i) => i !== index);
    setItems(next);
    setRemoved({ item: current, at: index });
    show(Math.min(index, next.length - 1));
  };
  const restoreFrame = () => {
    if (!removed) return;
    const next = [...items];
    next.splice(removed.at, 0, removed.item);
    setItems(next);
    setRemoved(null);
    show(removed.at);
  };

  const bake = async (it: ReviewFrame): Promise<Blob> => {
    if (sameRects(it.boxes, it.auto)) return it.frame;
    if (it.boxes.length === 0) return it.base;
    const hit = baked.current.get(it.orig);
    if (hit && sameRects(hit.boxes, it.boxes)) return hit.blob;
    const blob = await redactImage(it.base, it.boxes, { mode: 'blur' });
    baked.current.set(it.orig, { boxes: it.boxes, blob });
    return blob;
  };

  const upload = async () => {
    setApplying(true);
    setBlurError(false);
    let frames: Blob[];
    try {
      frames = await Promise.all(items.map(bake));
    } catch {
      setBlurError(true);
      setApplying(false);
      return;
    }
    setApplying(false);
    const kept = keepFrames(
      recording,
      items.map((it) => it.orig)
    );
    onUpload({
      frames,
      redactions: items.map((it) => [...it.locked, ...it.boxes]),
      steps: kept.steps,
    });
  };

  const toPct = (e: React.PointerEvent): Point => {
    const r = layerRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: clampPct(((e.clientX - r.left) / (r.width || 1)) * 100),
      y: clampPct(((e.clientY - r.top) / (r.height || 1)) * 100),
    };
  };
  const beginDrag = (e: React.PointerEvent, drag: Drag) => {
    if (e.button !== 0 || locked) return false;
    e.stopPropagation();
    dragRef.current = drag;
    layerRef.current?.setPointerCapture?.(e.pointerId);
    return true;
  };
  const endDrag = () => {
    dragRef.current = null;
    setDraft(null);
  };

  const onLayerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toPct(e);
    if (drag.kind === 'draw') setDraft(rectFrom(drag.start, p));
    else if (drag.kind === 'move')
      setBoxes((boxes) =>
        boxes.map((b, i) =>
          i === drag.at
            ? moveRect(drag.from, p.x - drag.start.x, p.y - drag.start.y)
            : b
        )
      );
    else
      setBoxes((boxes) =>
        boxes.map((b, i) => (i === drag.at ? rectFrom(drag.fixed, p) : b))
      );
  };
  const onLayerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    endDrag();
    if (!drag) return;
    if (drag.kind === 'draw') {
      const r = rectFrom(drag.start, toPct(e));
      if (r.wPct >= MIN_RECT_PCT && r.hPct >= MIN_RECT_PCT) {
        setBoxes((boxes) => [...boxes, r]);
        setSelected(current?.boxes.length ?? null);
      }
    } else if (drag.kind === 'resize') {
      // A corner dragged flat keeps a usable size.
      setBoxes((boxes) =>
        boxes.map((b, i) =>
          i === drag.at
            ? {
                ...b,
                wPct: Math.max(MIN_RECT_PCT, b.wPct),
                hPct: Math.max(MIN_RECT_PCT, b.hPct),
              }
            : b
        )
      );
    }
  };

  const onBoxKey = (e: React.KeyboardEvent, at: number) => {
    if (locked) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeBox(at);
      return;
    }
    const step = e.shiftKey ? NUDGE_PCT * 5 : NUDGE_PCT;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    setBoxes((boxes) =>
      boxes.map((b, i) => (i === at ? moveRect(b, d[0], d[1]) : b))
    );
  };

  const copyId = (id: string) => {
    void navigator.clipboard?.writeText(id).then(() => setCopied(id));
  };
  // Every untagged click in the recording, not just this frame's.
  const copyAll = () => {
    const contexts = recording.steps.flatMap((s) =>
      s.untagged && s.context ? [s.context] : []
    );
    void navigator.clipboard
      ?.writeText(formatUnmappedAnchors(contexts))
      .then(() => setCopiedAll(true));
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
          {!current ? (
            <p className="px-4 py-16 text-sm font-semibold text-slate-600">
              {t('glRecorder.reviewNoFrames')}
            </p>
          ) : (
            <div className="relative inline-block">
              <FrameCanvas
                frame={current.base}
                boxes={draft ? [...current.boxes, draft] : current.boxes}
                label={t('glRecorder.reviewFrame', {
                  current: index + 1,
                  total,
                })}
              />
              <div
                ref={layerRef}
                data-testid="gl-frame-review-draw"
                className="absolute inset-0 cursor-crosshair touch-none"
                onPointerDown={(e) => {
                  if (beginDrag(e, { kind: 'draw', start: toPct(e) }))
                    setSelected(null);
                }}
                onPointerMove={onLayerMove}
                onPointerUp={onLayerUp}
                onPointerCancel={endDrag}
              >
                {current.locked.map((r, i) => (
                  <div
                    key={`locked-${i}`}
                    data-testid="gl-frame-review-blurred"
                    className="pointer-events-none absolute rounded-sm ring-2 ring-sky-500/60"
                    style={boxStyle(r)}
                  />
                ))}
                {current.boxes.map((r, i) => {
                  const isSelected = selected === i;
                  return (
                    <div
                      key={`box-${i}`}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      aria-label={t('glRecorder.reviewBlurArea', { n: i + 1 })}
                      data-testid="gl-frame-review-blurred"
                      className={`absolute cursor-move rounded-sm focus:outline-none ${
                        isSelected
                          ? 'ring-2 ring-brand-blue-primary'
                          : 'ring-2 ring-sky-500 focus-visible:ring-brand-blue-primary'
                      }`}
                      style={boxStyle(r)}
                      onFocus={() => setSelected(i)}
                      onKeyDown={(e) => onBoxKey(e, i)}
                      onPointerDown={(e) => {
                        if (
                          beginDrag(e, {
                            kind: 'move',
                            start: toPct(e),
                            from: r,
                            at: i,
                          })
                        )
                          setSelected(i);
                      }}
                    >
                      {isSelected &&
                        CORNERS.map((c) => (
                          <span
                            key={c}
                            data-testid={`gl-frame-review-handle-${c}`}
                            aria-hidden="true"
                            className={`absolute h-3 w-3 rounded-sm border-2 border-brand-blue-primary bg-white ${cornerClass[c]}`}
                            onPointerDown={(e) => {
                              if (
                                beginDrag(e, {
                                  kind: 'resize',
                                  fixed: anchorOf(r, c),
                                  at: i,
                                })
                              )
                                setSelected(i);
                            }}
                          />
                        ))}
                      {isSelected && (
                        <button
                          type="button"
                          aria-label={t('glRecorder.reviewRemoveBlur')}
                          title={t('glRecorder.reviewRemoveBlur')}
                          disabled={locked}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => removeBox(i)}
                          className="absolute -right-3 -top-8 flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-700 shadow ring-1 ring-slate-300 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  );
                })}
                {draft && (
                  <div
                    className="pointer-events-none absolute rounded-sm ring-2 ring-sky-500"
                    style={boxStyle(draft)}
                  />
                )}
              </div>
            </div>
          )}
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
              {total > 0
                ? t('glRecorder.reviewFrame', { current: index + 1, total })
                : t('glRecorder.reviewNoFramesShort')}
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
            {changed && current.auto.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setBoxes(() => current.auto);
                  setSelected(null);
                }}
                disabled={locked}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {t('glRecorder.reviewRestoreBlur')}
              </button>
            )}
            {current && current.boxes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setBoxes(() => []);
                  setSelected(null);
                }}
                disabled={locked}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                {t('glRecorder.reviewRemoveAllBlur')}
              </button>
            )}
            <button
              type="button"
              onClick={removeFrame}
              disabled={!current || locked}
              title={
                steps.length > 0
                  ? t('glRecorder.reviewRemoveHint', { count: steps.length })
                  : undefined
              }
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t('glRecorder.reviewRemove')}
            </button>
          </div>
        </div>

        {total > 1 && (
          <ol
            aria-label={t('glRecorder.reviewFrames')}
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {items.map((it, i) => {
              const blurred = it.boxes.length + it.locked.length > 0;
              return (
                <li key={it.orig} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    disabled={locked}
                    aria-current={i === index ? 'true' : undefined}
                    aria-label={t('glRecorder.reviewFrame', {
                      current: i + 1,
                      total,
                    })}
                    className={`relative block overflow-hidden rounded-md ring-2 ${
                      i === index
                        ? 'ring-brand-blue-primary'
                        : 'ring-transparent hover:ring-slate-300'
                    }`}
                  >
                    <ThumbCanvas frame={it.frame} />
                    {blurred && (
                      <span
                        data-testid="gl-frame-review-strip-blurred"
                        className="absolute bottom-1 right-1 rounded bg-slate-900/75 p-0.5 text-white"
                      >
                        <EyeOff className="h-3 w-3" aria-hidden="true" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {removed && (
          <p
            role="status"
            className="flex flex-wrap items-center gap-2 text-sm text-slate-700"
          >
            {t('glRecorder.reviewRemoved')}
            <button
              type="button"
              onClick={restoreFrame}
              disabled={locked}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold text-brand-blue-primary hover:bg-slate-100 disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {t('glRecorder.reviewUndoRemove')}
            </button>
          </p>
        )}

        {error && !busy && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
          >
            <p className="min-w-0 flex-1 font-semibold">{error}</p>
            <button
              type="button"
              onClick={() => void upload()}
              disabled={locked || total === 0}
              className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-bold text-red-800 hover:bg-red-100 disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {t('glRecorder.retry')}
            </button>
          </div>
        )}

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
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-800">
                {t('glRecorder.untaggedTitle')}
              </h3>
              <button
                type="button"
                onClick={copyAll}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand-blue-primary hover:bg-slate-100"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                {copiedAll ? t('glRecorder.copied') : t('glRecorder.copyAll')}
              </button>
            </div>
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
              t('glRecorder.reviewBlurredCount', {
                count: blurredCount,
                total,
              })}
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
              onClick={() => void upload()}
              disabled={locked || total === 0}
              className="flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-blue-dark disabled:opacity-40"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {uploadLabel ?? t('glRecorder.reviewUpload')}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
};
