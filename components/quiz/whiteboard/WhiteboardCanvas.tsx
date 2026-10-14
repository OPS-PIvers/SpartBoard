import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { DrawableObject, EraserMode, Point, TextObject } from '@/types';
import type { WhiteboardStartingPage } from '@/types';
import type { DrawingCommand } from '@/components/widgets/DrawingWidget/commands';
import {
  MAX_UNDO_DEPTH,
  useCommandStack,
} from '@/components/widgets/DrawingWidget/useCommandStack';
import { useDrawingCanvas } from '@/components/widgets/DrawingWidget/useDrawingCanvas';
import {
  TextEditorOverlay,
  type TextEditorHandle,
} from '@/components/widgets/DrawingWidget/TextEditorOverlay';
import {
  hitTestObject,
  isObjectEnclosedByPolygon,
} from '@/components/widgets/DrawingWidget/hitTest';
import { nextZ } from '@/utils/migrateDrawingConfig';
import { WhiteboardToolbar } from './WhiteboardToolbar';
import { WhiteboardZoomFrame } from './WhiteboardZoomFrame';
import {
  WHITEBOARD_COLORS,
  type WhiteboardSize,
  type WhiteboardTool,
} from './whiteboardTools';
import {
  WHITEBOARD_PAGE,
  WHITEBOARD_PIXEL_RATIO,
  paintWhiteboardStartingPage,
} from './whiteboardPicture';

/** Where the canvas reports every change; W2's recorder satisfies this shape. */
export interface WhiteboardCaptureSink {
  push: (cmd: DrawingCommand, meta?: { pointTimes?: number[] }) => void;
  undo: () => void;
  redo: () => void;
}

export interface WhiteboardCanvasHandle {
  /** Commits any open text box, then returns the page's objects. */
  flush: () => DrawableObject[];
}

interface WhiteboardCanvasProps {
  startingPage: WhiteboardStartingPage;
  startingImage?: CanvasImageSource | null;
  /** Prep time and after the take: the page shows, drawing is off. */
  disabled?: boolean;
  recorder?: WhiteboardCaptureSink;
  onObjectsChange?: (objects: DrawableObject[]) => void;
  className?: string;
}

const PAGE_SIZE = { width: WHITEBOARD_PAGE.w, height: WHITEBOARD_PAGE.h };
const PEN_WIDTHS: Record<WhiteboardSize, number> = {
  thin: 4,
  medium: 8,
  thick: 16,
};
const ERASER_WIDTHS: Record<WhiteboardSize, number> = {
  thin: 16,
  medium: 40,
  thick: 96,
};
const TEXT_FONT_SIZE = 40;
// Toolbar width plus the gap beside it at 2, 3 and 4 columns (see WhiteboardToolbar).
const TOOLBAR_ROOM =
  '[--rail:214px] [@container(min-height:388px)]:[--rail:166px] [@container(min-height:526px)]:[--rail:120px]';
const isEraserStroke = (o: DrawableObject) =>
  o.kind === 'path' && o.color === 'eraser';

/** Student whiteboard: a fixed 1600x1200 page on a 2x bitmap over a locked starting page. */
export const WhiteboardCanvas = forwardRef<
  WhiteboardCanvasHandle,
  WhiteboardCanvasProps
>(
  (
    {
      startingPage,
      startingImage = null,
      disabled = false,
      recorder,
      onObjectsChange,
      className = 'h-full',
    },
    ref
  ) => {
    const pageRef = useRef<HTMLDivElement>(null);
    const backgroundRef = useRef<HTMLCanvasElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const textEditorRef = useRef<TextEditorHandle | null>(null);

    const [objects, setObjects] = useState<DrawableObject[]>([]);
    const objectsRef = useRef<DrawableObject[]>([]);
    const [tool, setTool] = useState<WhiteboardTool>('pen');
    const [eraserMode, setEraserMode] = useState<EraserMode>('stroke');
    const [color, setColor] = useState<string>(WHITEBOARD_COLORS[0].hex);
    const [size, setSize] = useState<WhiteboardSize>('medium');
    const [editingText, setEditingText] = useState<TextObject | null>(null);
    const [pageRect, setPageRect] = useState<DOMRect | null>(null);
    const [lassoPoints, setLassoPoints] = useState<Point[] | null>(null);
    const eraseQueueRef = useRef<Set<string>>(new Set());
    const activePointerRef = useRef<number | null>(null);
    const pinchingRef = useRef(false);
    // Mirrors the stack depth so the recorder only logs undo/redo that applied.
    const historyRef = useRef({ past: 0, future: 0 });

    const recorderRef = useRef(recorder);
    const onChangeRef = useRef(onObjectsChange);
    useLayoutEffect(() => {
      recorderRef.current = recorder;
      onChangeRef.current = onObjectsChange;
    });

    const writeObjects = useCallback((next: DrawableObject[]) => {
      objectsRef.current = next;
      setObjects(next);
      onChangeRef.current?.(next);
    }, []);

    const stack = useCommandStack({
      pageKey: 'whiteboard',
      objects,
      onObjectsChange: writeObjects,
    });

    const push = useCallback(
      (cmd: DrawingCommand, meta?: { pointTimes?: number[] }) => {
        stack.push(cmd);
        historyRef.current = {
          past: Math.min(historyRef.current.past + 1, MAX_UNDO_DEPTH),
          future: 0,
        };
        recorderRef.current?.push(cmd, meta);
      },
      [stack]
    );

    const undo = useCallback(() => {
      if (historyRef.current.past === 0) return;
      stack.undo();
      historyRef.current = {
        past: historyRef.current.past - 1,
        future: historyRef.current.future + 1,
      };
      recorderRef.current?.undo();
    }, [stack]);

    const redo = useCallback(() => {
      if (historyRef.current.future === 0) return;
      stack.redo();
      historyRef.current = {
        past: Math.min(historyRef.current.past + 1, MAX_UNDO_DEPTH),
        future: historyRef.current.future - 1,
      };
      recorderRef.current?.redo();
    }, [stack]);

    const commitTextEdit = useCallback(
      (next: TextObject) => {
        const existing = objectsRef.current.find((o) => o.id === next.id);
        const isEmpty = next.content.trim() === '';
        if (existing) {
          if (isEmpty) push({ kind: 'remove', object: existing });
          else push({ kind: 'update', before: existing, after: next });
        } else if (!isEmpty) {
          push({ kind: 'add', object: next });
        }
        setEditingText((prev) => (prev && prev.id !== next.id ? prev : null));
      },
      [push]
    );

    useImperativeHandle(
      ref,
      () => ({
        flush: () => {
          textEditorRef.current?.commit();
          return objectsRef.current;
        },
      }),
      []
    );

    // The starting page is its own canvas so no eraser can reach it.
    useEffect(() => {
      const canvas = backgroundRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      canvas.width = WHITEBOARD_PAGE.w * WHITEBOARD_PIXEL_RATIO;
      canvas.height = WHITEBOARD_PAGE.h * WHITEBOARD_PIXEL_RATIO;
      paintWhiteboardStartingPage(ctx, startingPage, startingImage);
    }, [startingPage, startingImage]);

    // The text box is fixed-positioned, so it follows the page on resize.
    useEffect(() => {
      const node = pageRef.current;
      if (!editingText || !node) return undefined;
      const measure = () => setPageRect(node.getBoundingClientRect());
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(node);
      window.addEventListener('scroll', measure, true);
      return () => {
        ro.disconnect();
        window.removeEventListener('scroll', measure, true);
      };
    }, [editingText]);

    useEffect(() => {
      if (disabled) return undefined;
      const onKey = (e: KeyboardEvent) => {
        if (editingText) return;
        const { target } = e;
        if (
          target instanceof Element &&
          target.closest('input, textarea, select, [contenteditable="true"]')
        )
          return;
        if (!(e.metaKey || e.ctrlKey)) return;
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        } else if (key === 'y') {
          e.preventDefault();
          redo();
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [disabled, editingText, undo, redo]);

    const handleTextSpawn = useCallback(
      (obj: TextObject) => {
        if (editingText) return;
        setEditingText({
          ...obj,
          fontSize: TEXT_FONT_SIZE,
          w: TEXT_FONT_SIZE * 8,
          h: Math.round(TEXT_FONT_SIZE * 1.6),
        });
      },
      [editingText]
    );

    const strokeWidth =
      tool === 'eraser' ? ERASER_WIDTHS[size] : PEN_WIDTHS[size];

    const { handleStart, handleMove, handleEnd, cancel } = useDrawingCanvas({
      canvasRef,
      color,
      width: strokeWidth,
      objects,
      onObjectComplete: (obj, meta) => push({ kind: 'add', object: obj }, meta),
      onTextSpawn: handleTextSpawn,
      disabled,
      canvasSize: PAGE_SIZE,
      pixelRatio: WHITEBOARD_PIXEL_RATIO,
      nextZ: nextZ(objects),
      activeTool: tool,
    });

    const toPage = (e: React.PointerEvent): Point => {
      const rect = e.currentTarget.getBoundingClientRect();
      return {
        x:
          rect.width > 0
            ? ((e.clientX - rect.left) * PAGE_SIZE.width) / rect.width
            : 0,
        y:
          rect.height > 0
            ? ((e.clientY - rect.top) * PAGE_SIZE.height) / rect.height
            : 0,
      };
    };

    const queueEraseHits = (p: Point) => {
      for (const obj of objectsRef.current) {
        if (isEraserStroke(obj) || eraseQueueRef.current.has(obj.id)) continue;
        if (hitTestObject(obj, p)) eraseQueueRef.current.add(obj.id);
      }
    };

    const pickedEraser =
      tool === 'eraser' && eraserMode !== 'stroke' ? eraserMode : null;

    // Two fingers zoom the page, so the first finger's stroke never lands.
    const handlePinchStart = () => {
      activePointerRef.current = null;
      eraseQueueRef.current = new Set();
      setLassoPoints(null);
      cancel();
    };

    const handlePointerDown = (e: React.PointerEvent) => {
      if (disabled || pinchingRef.current) return;
      // One finger or pen at a time; a resting palm can't start a second stroke.
      if (activePointerRef.current !== null) return;
      activePointerRef.current = e.pointerId;
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        // A pointer that already ended can't be captured.
      }
      if (pickedEraser) {
        const p = toPage(e);
        if (pickedEraser === 'object') {
          eraseQueueRef.current = new Set();
          queueEraseHits(p);
        } else {
          setLassoPoints([p]);
        }
        return;
      }
      handleStart(e);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      if (
        disabled ||
        pinchingRef.current ||
        activePointerRef.current !== e.pointerId
      )
        return;
      if (pickedEraser === 'object') {
        queueEraseHits(toPage(e));
        return;
      }
      if (pickedEraser === 'lasso') {
        const p = toPage(e);
        setLassoPoints((prev) => (prev ? [...prev, p] : [p]));
        return;
      }
      handleMove(e);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
      if (activePointerRef.current !== e.pointerId) return;
      activePointerRef.current = null;
      if (pickedEraser === 'object') {
        const ids = eraseQueueRef.current;
        eraseQueueRef.current = new Set();
        const removed = objectsRef.current.filter((o) => ids.has(o.id));
        if (removed.length > 0) push({ kind: 'bulkRemove', objects: removed });
        return;
      }
      if (pickedEraser === 'lasso') {
        const poly = lassoPoints;
        setLassoPoints(null);
        if (!poly || poly.length < 3) return;
        const enclosed = objectsRef.current.filter(
          (o) => !isEraserStroke(o) && isObjectEnclosedByPolygon(o, poly)
        );
        if (enclosed.length > 0)
          push({ kind: 'bulkRemove', objects: enclosed });
        return;
      }
      handleEnd();
    };

    const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (disabled || tool !== 'text') return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const p = {
        x: ((e.clientX - rect.left) * PAGE_SIZE.width) / rect.width,
        y: ((e.clientY - rect.top) * PAGE_SIZE.height) / rect.height,
      };
      const hit = objectsRef.current
        .filter((o): o is TextObject => o.kind === 'text')
        .sort((a, b) => b.z - a.z)
        .find((o) => hitTestObject(o, p));
      if (hit) setEditingText(hit);
    };

    const selectTool = (next: WhiteboardTool) => {
      textEditorRef.current?.commit();
      setTool(next);
    };

    const cursor =
      tool === 'text'
        ? 'cursor-text'
        : pickedEraser
          ? 'cursor-cell'
          : 'cursor-crosshair';

    return (
      <div
        className={`flex min-h-0 w-full min-w-0 items-center justify-center gap-3 [container-type:size] ${className}`}
        data-testid="whiteboard-canvas"
      >
        <WhiteboardToolbar
          tool={tool}
          eraserMode={eraserMode}
          color={color}
          size={size}
          canUndo={stack.canUndo}
          canRedo={stack.canRedo}
          disabled={disabled}
          onTool={selectTool}
          onEraserMode={setEraserMode}
          onColor={(hex) => {
            setColor(hex);
            if (tool === 'eraser') setTool('pen');
          }}
          onSize={setSize}
          onUndo={undo}
          onRedo={redo}
        />
        <WhiteboardZoomFrame
          ref={pageRef}
          disabled={disabled}
          pinchingRef={pinchingRef}
          onPinchStart={handlePinchStart}
          className={TOOLBAR_ROOM}
          style={{
            width: 'min(calc(100cqw - var(--rail)), calc(100cqh * 4 / 3))',
            aspectRatio: '4 / 3',
          }}
        >
          <canvas
            ref={backgroundRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
          <canvas
            ref={canvasRef}
            data-testid="whiteboard-ink"
            data-inking-surface="true"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onLostPointerCapture={handlePointerUp}
            onDoubleClick={handleDoubleClick}
            className={`absolute inset-0 h-full w-full ${
              disabled ? 'pointer-events-none' : cursor
            }`}
            style={{ touchAction: 'none' }}
          />
          {lassoPoints && lassoPoints.length > 0 && (
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 ${PAGE_SIZE.width} ${PAGE_SIZE.height}`}
              preserveAspectRatio="none"
            >
              <polygon
                points={lassoPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="rgba(45, 63, 137, 0.08)"
                stroke="#2d3f89"
                strokeWidth={3}
                strokeDasharray="12 8"
              />
            </svg>
          )}
        </WhiteboardZoomFrame>
        {editingText && pageRect && (
          <TextEditorOverlay
            ref={textEditorRef}
            object={editingText}
            canvasRect={pageRect}
            canvasSize={PAGE_SIZE}
            onCommit={commitTextEdit}
            onCancel={() => setEditingText(null)}
          />
        )}
      </div>
    );
  }
);

WhiteboardCanvas.displayName = 'WhiteboardCanvas';
