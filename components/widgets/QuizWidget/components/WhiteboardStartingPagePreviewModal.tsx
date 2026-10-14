import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eraser, Move, PenLine, Trash2 } from 'lucide-react';
import type {
  WhiteboardInkStroke,
  WhiteboardPlacedImage,
  WhiteboardStartingPage,
} from '@/types';
import { Modal } from '@/components/common/Modal';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { WHITEBOARD_INK_POINTS_MAX } from '@/config/quizRecordingDefaults';
import {
  drawStartingPage,
  placedImages,
  WHITEBOARD_PAGE_HEIGHT,
  WHITEBOARD_PAGE_WIDTH,
} from '@/utils/whiteboard/startingPage';
import { useStartingPageImages } from '@/components/quiz/whiteboard/useStartingPageImages';
import {
  appendInkPoint,
  canStartStroke,
  CORNERS,
  cornerPoint,
  hitCorner,
  hitImage,
  inkPointCount,
  moveRect,
  resizeFromCorner,
  strokeHit,
  TEACHER_INK_COLOR,
  TEACHER_INK_SIZE,
  withEdits,
  type Corner,
} from './whiteboardStartingPageEdit';

type Tool = 'move' | 'pen' | 'eraser';
const TOOLS: { id: Tool; icon: typeof Move }[] = [
  { id: 'move', icon: Move },
  { id: 'pen', icon: PenLine },
  { id: 'eraser', icon: Eraser },
];

const SELECT_BLUE = '#2563eb';
// Handle sizes are screen pixels so they stay grabbable at any modal width.
const HANDLE_PX = { mouse: 16, touch: 28 };
// Hit radii in screen pixels; a finger gets at least a 48px target.
const HANDLE_REACH_PX = { mouse: 16, touch: 28 };
const ERASER_REACH_PX = { mouse: 8, touch: 16 };
const NUDGE = { small: 10, large: 50 };
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
const coarsePointer = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches;

type Drag =
  | {
      kind: 'move';
      index: number;
      startX: number;
      startY: number;
      start: WhiteboardPlacedImage;
    }
  | { kind: 'resize'; index: number; corner: Corner }
  | { kind: 'pen'; points: number[] }
  | { kind: 'erase' };

export interface WhiteboardStartingPagePreviewModalProps {
  page: WhiteboardStartingPage;
  onChange: (next: WhiteboardStartingPage) => void;
  onClose: () => void;
}

const toolBtn = (active: boolean) =>
  `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-bold transition ${
    active
      ? 'bg-white text-brand-blue-primary shadow-sm'
      : 'text-slate-600 hover:text-slate-900'
  }`;
const plainBtn =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

/** Edits the starting page's images and teacher ink; nothing is kept until Save. */
export const WhiteboardStartingPagePreviewModal: React.FC<
  WhiteboardStartingPagePreviewModalProps
> = ({ page, onChange, onClose }) => {
  const { t } = useTranslation();
  const tk = (key: string) =>
    t(`quizMediaResponse.authoring.whiteboard.${key}`);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [images, setImages] = useState<WhiteboardPlacedImage[]>(() =>
    placedImages(page)
  );
  const [ink, setInk] = useState<WhiteboardInkStroke[]>(() => page.ink ?? []);
  const [tool, setTool] = useState<Tool>('move');
  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [displayWidth, setDisplayWidth] = useState(0);
  const [coarse] = useState(coarsePointer);

  // Handles are sized from the canvas's on-screen width, so track it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() =>
      setDisplayWidth(canvas.clientWidth)
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const draft = useMemo(
    () =>
      withEdits(
        page,
        images,
        drag?.kind === 'pen' && drag.points.length > 0
          ? [
              ...ink,
              {
                color: TEACHER_INK_COLOR,
                size: TEACHER_INK_SIZE,
                points: drag.points,
              },
            ]
          : ink
      ),
    [page, images, ink, drag]
  );
  const { images: loaded } = useStartingPageImages(draft);
  const selectedRect =
    tool === 'move' && selected !== null ? images[selected] : undefined;

  // The canvas is an external surface, so it is repainted from state after each change.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawStartingPage(ctx, draft, loaded);
    if (!selectedRect) return;
    ctx.save();
    ctx.strokeStyle = SELECT_BLUE;
    ctx.lineWidth = 3;
    ctx.strokeRect(
      selectedRect.x,
      selectedRect.y,
      selectedRect.w,
      selectedRect.h
    );
    const unitsPerPx =
      displayWidth > 0 ? WHITEBOARD_PAGE_WIDTH / displayWidth : 2;
    const size = (coarse ? HANDLE_PX.touch : HANDLE_PX.mouse) * unitsPerPx;
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 2 * unitsPerPx;
    for (const c of CORNERS) {
      const [cx, cy] = cornerPoint(selectedRect, c);
      ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
      ctx.strokeRect(cx - size / 2, cy - size / 2, size, size);
    }
    ctx.restore();
  }, [draft, loaded, selectedRect, displayWidth, coarse]);

  const toPage = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const unitsPerPx = r.width > 0 ? WHITEBOARD_PAGE_WIDTH / r.width : 1;
    return {
      x: (e.clientX - r.left) * unitsPerPx,
      y: (e.clientY - r.top) * unitsPerPx,
      unitsPerPx,
      touch: e.pointerType === 'touch' || e.pointerType === 'pen',
    };
  };

  const eraseAt = (x: number, y: number, radius: number) =>
    setInk((current) => {
      const kept = current.filter((s) => !strokeHit(s, x, y, radius));
      return kept.length === current.length ? current : kept;
    });

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const p = toPage(e);
    e.currentTarget.focus();
    if (tool === 'move') {
      const reach =
        (p.touch ? HANDLE_REACH_PX.touch : HANDLE_REACH_PX.mouse) *
        p.unitsPerPx;
      const corner = selectedRect
        ? hitCorner(selectedRect, p.x, p.y, reach)
        : null;
      if (selected !== null && corner) {
        setDrag({ kind: 'resize', index: selected, corner });
      } else {
        const index = hitImage(images, p.x, p.y);
        setSelected(index >= 0 ? index : null);
        if (index < 0) return;
        setDrag({
          kind: 'move',
          index,
          startX: p.x,
          startY: p.y,
          start: images[index],
        });
      }
    } else if (tool === 'pen') {
      if (!canStartStroke(ink)) return;
      setDrag({ kind: 'pen', points: appendInkPoint([], p.x, p.y, 1) });
    } else {
      eraseAt(
        p.x,
        p.y,
        (p.touch ? ERASER_REACH_PX.touch : ERASER_REACH_PX.mouse) * p.unitsPerPx
      );
      setDrag({ kind: 'erase' });
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag) return;
    const p = toPage(e);
    if (drag.kind === 'move') {
      const moved = moveRect(drag.start, p.x - drag.startX, p.y - drag.startY);
      setImages((cur) => cur.map((img, i) => (i === drag.index ? moved : img)));
    } else if (drag.kind === 'resize') {
      setImages((cur) =>
        cur.map((img, i) =>
          i === drag.index ? resizeFromCorner(img, drag.corner, p.x, p.y) : img
        )
      );
    } else if (drag.kind === 'pen') {
      const budget = WHITEBOARD_INK_POINTS_MAX - inkPointCount(ink);
      const points = appendInkPoint(drag.points, p.x, p.y, budget);
      if (points !== drag.points) setDrag({ kind: 'pen', points });
    } else {
      eraseAt(
        p.x,
        p.y,
        (p.touch ? ERASER_REACH_PX.touch : ERASER_REACH_PX.mouse) * p.unitsPerPx
      );
    }
  };

  const endDrag = () => {
    if (drag?.kind === 'pen' && drag.points.length >= 2) {
      const stroke = {
        color: TEACHER_INK_COLOR,
        size: TEACHER_INK_SIZE,
        points: drag.points,
      };
      setInk((cur) => [...cur, stroke]);
    }
    setDrag(null);
  };

  const nudge = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const dir = ARROWS[e.key];
    const resize = e.key === '+' || e.key === '=' || e.key === '-';
    if ((!dir && !resize) || tool !== 'move' || images.length === 0) return;
    e.preventDefault();
    if (selected === null) {
      setSelected(images.length - 1);
      return;
    }
    const img = images[selected];
    let next: WhiteboardPlacedImage;
    if (dir) {
      const step = e.shiftKey ? NUDGE.large : NUDGE.small;
      next = moveRect(img, dir[0] * step, dir[1] * step);
    } else {
      const s = e.key === '-' ? 0.9 : 1.1;
      next = resizeFromCorner(img, 'se', img.x + img.w * s, img.y + img.h * s);
    }
    setImages((cur) => cur.map((im, i) => (i === selected ? next : im)));
  };

  const removeSelected = () => {
    if (selected === null) return;
    setImages((cur) => cur.filter((_, i) => i !== selected));
    setSelected(null);
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={tk('startingPageLabel')}
      maxWidth="max-w-4xl"
      zIndex="z-modal-deep"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label={tk('toolsLabel')}
            className="inline-flex rounded-lg bg-slate-100 p-1"
          >
            {TOOLS.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={tool === id}
                onClick={() => {
                  setTool(id);
                  if (id !== 'move') setSelected(null);
                }}
                className={toolBtn(tool === id)}
                {...tourFieldAttr(
                  'quiz-editor.whiteboard-preview-tool',
                  'quiz',
                  id
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {tk(`tool.${id}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={ink.length === 0}
            onClick={() => setInk([])}
            className={plainBtn}
            {...tourTypeAttr(
              'quiz-editor.whiteboard-preview-clear-ink',
              'quiz'
            )}
          >
            {tk('clearInk')}
          </button>
          {selectedRect && (
            <button
              type="button"
              onClick={removeSelected}
              className={plainBtn}
              {...tourTypeAttr(
                'quiz-editor.whiteboard-preview-remove-image',
                'quiz'
              )}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {tk('removeImage')}
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={plainBtn}
              {...tourTypeAttr('quiz-editor.whiteboard-preview-cancel', 'quiz')}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(withEdits(page, images, ink));
                onClose();
              }}
              className="inline-flex items-center rounded-lg bg-brand-blue-primary px-4 py-1.5 text-sm font-bold text-white hover:bg-brand-blue-dark"
              {...tourTypeAttr('quiz-editor.whiteboard-preview-save', 'quiz')}
            >
              {t('common.save')}
            </button>
          </div>
        </div>
        <canvas
          ref={canvasRef}
          width={WHITEBOARD_PAGE_WIDTH}
          height={WHITEBOARD_PAGE_HEIGHT}
          role="img"
          tabIndex={0}
          aria-label={tk('previewLabel')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={(e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
              e.preventDefault();
              removeSelected();
            } else {
              nudge(e);
            }
          }}
          className={`block aspect-[4/3] w-full touch-none select-none rounded-lg border border-slate-200 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${
            tool === 'move' ? 'cursor-default' : 'cursor-crosshair'
          }`}
        />
      </div>
    </Modal>
  );
};
