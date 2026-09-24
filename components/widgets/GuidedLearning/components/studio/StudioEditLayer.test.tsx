import React, { Profiler, useEffect } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { mockStageLayout, rect } from '@/tests/utils/mockStageLayout';
import { manualFrames } from '@/tests/utils/manualFrames';
import {
  useGuidedLearningEditorState,
  type GuidedLearningEditorController,
} from '../useGuidedLearningEditorState';
import { StudioCanvas } from './StudioCanvas';
import { useCanvasTools } from './useCanvasTools';
import { useStudioShortcuts } from './useStudioShortcuts';
import { presetById } from './devicePresets';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'test-user' }, isAdmin: true }),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    uploading: false,
    uploadHotspotImage: vi.fn(),
    uploadGuidedLearningMedia: vi.fn(),
    deleteFile: vi.fn(),
    deleteDriveFile: vi.fn(),
  }),
}));

const stageRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock('../GuidedLearningStage', async (importOriginal) => {
  const real = await importOriginal<typeof import('../GuidedLearningStage')>();
  const Counted: typeof real.GuidedLearningStage = (props) => (
    <Profiler id="gl-stage" onRender={() => stageRenders.count++}>
      <real.GuidedLearningStage {...props} />
    </Profiler>
  );
  return { ...real, GuidedLearningStage: Counted };
});

const BOARD = presetById('board');
// The stage is 720×520 at the page origin showing a same-aspect image, so 1% = 7.2px × 5.2px.
const at = (xPct: number, yPct: number) => ({
  clientX: xPct * 7.2,
  clientY: yPct * 5.2,
});
// The selected step's callout box, well clear of every hotspot.
const CALLOUT = rect(600, 400, 100, 60);

const STEPS: GuidedLearningStep[] = [
  {
    id: 'rect-1',
    xPct: 25,
    yPct: 25,
    imageIndex: 0,
    interactionType: 'tooltip',
    showOverlay: 'tooltip',
    text: 'First',
    region: { shape: 'rect', wPct: 20, hPct: 20 },
  },
  {
    id: 'rect-2',
    xPct: 30,
    yPct: 30,
    imageIndex: 0,
    interactionType: 'tooltip',
    showOverlay: 'tooltip',
    text: 'Second',
    region: { shape: 'rect', wPct: 20, hPct: 20 },
  },
  {
    id: 'poly-1',
    xPct: 70,
    yPct: 70,
    imageIndex: 0,
    interactionType: 'tooltip',
    showOverlay: 'tooltip',
    text: 'Third',
    region: {
      shape: 'polygon',
      wPct: 20,
      hPct: 20,
      points: [
        { x: 60, y: 60 },
        { x: 80, y: 60 },
        { x: 70, y: 80 },
      ],
    },
  },
  {
    id: 'pin-1',
    xPct: 80,
    yPct: 20,
    imageIndex: 0,
    interactionType: 'tooltip',
    showOverlay: 'tooltip',
    text: 'Fourth',
  },
];

const buildSet = (): GuidedLearningSet => ({
  id: 'set-1',
  schemaVersion: 3,
  title: 'Canvas',
  imageUrls: ['https://example.com/slide.png'],
  steps: STEPS,
  mode: 'structured',
  createdAt: 1,
  updatedAt: 1,
});

const latest: { current: GuidedLearningEditorController | null } = {
  current: null,
};
const Harness: React.FC = () => {
  const state = useGuidedLearningEditorState({
    existingSet: buildSet(),
    existingMeta: null,
  });
  const tools = useCanvasTools(state, BOARD);
  useStudioShortcuts(tools.rows);
  useEffect(() => {
    latest.current = state;
  });
  return (
    <StudioCanvas state={state} tools={tools} setId="set-1" preset={BOARD} />
  );
};

const editor = () => {
  if (!latest.current) throw new Error('editor not mounted');
  return latest.current;
};
const stepById = (id: string) => {
  const s = editor().steps.find((x) => x.id === id);
  if (!s) throw new Error(`no step ${id}`);
  return s;
};
const layer = () => screen.getByTestId('gl-studio-edit-layer');

type Pt = [number, number];
const down = (p: Pt, init: Record<string, unknown> = {}) =>
  fireEvent.pointerDown(layer(), {
    button: 0,
    pointerId: 1,
    ...at(...p),
    ...init,
  });
const moveTo = (p: Pt, init: Record<string, unknown> = {}) =>
  fireEvent.pointerMove(layer(), { pointerId: 1, ...at(...p), ...init });
const up = (p: Pt, init: Record<string, unknown> = {}) =>
  fireEvent.pointerUp(layer(), { pointerId: 1, ...at(...p), ...init });
const click = (p: Pt, init: Record<string, unknown> = {}) => {
  down(p, init);
  up(p, init);
};
/** Drags without snapping (Ctrl held), through a midpoint so the gesture spans several moves. */
const drag = (from: Pt, to: Pt) => {
  down(from);
  moveTo([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], { ctrlKey: true });
  moveTo(to, { ctrlKey: true });
  up(to, { ctrlKey: true });
};
const press = (key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(window, { key, ...init });

let restore: (() => void) | null = null;
let frames: ReturnType<typeof manualFrames>;
beforeEach(() => {
  frames = manualFrames();
  const handle = mockStageLayout({
    container: { w: 720, h: 520 },
    image: { w: 1440, h: 1040 },
    rectFor: (el) => (el.hasAttribute('data-gl-callout') ? CALLOUT : null),
  });
  restore = handle.restore;
  render(<Harness />);
  act(() => handle.fireResize());
});
afterEach(() => {
  cleanup();
  frames.restore();
  restore?.();
  restore = null;
  latest.current = null;
});

describe('Studio edit layer', () => {
  it('places a default point step with a click in add mode and selects it', () => {
    press('a');
    expect(layer()).toHaveAttribute('data-adding', 'true');
    click([50, 45]);
    const added = editor().steps[4];
    expect(added).toMatchObject({ xPct: 50, yPct: 45 });
    expect(added.region).toBeUndefined();
    expect(editor().selectedStepId).toBe(added.id);
    expect(editor().addingStep).toBe(false);
  });

  it('draws a rect region by dragging with the rectangle tool', () => {
    press('r');
    drag([50, 40], [60, 55]);
    const added = editor().steps[4];
    expect(added.xPct).toBeCloseTo(55);
    expect(added.yPct).toBeCloseTo(47.5);
    expect(added.region).toMatchObject({ shape: 'rect' });
    expect(added.region?.wPct).toBeCloseTo(10);
    expect(added.region?.hPct).toBeCloseTo(15);
  });

  it('draws a polygon from clicks and closes it with Enter', () => {
    press('p');
    click([50, 40]);
    click([60, 40]);
    click([55, 50]);
    expect(screen.getByTestId('gl-studio-polygon-draft')).toBeInTheDocument();
    press('Enter');
    const added = editor().steps[4];
    expect(added.region?.shape).toBe('polygon');
    expect(added.region?.points).toHaveLength(3);
    expect(added.xPct).toBeCloseTo(55);
  });

  it('selects an unselected hotspot on click without moving it', () => {
    const before = stepById('poly-1');
    down([70, 68]);
    // 3px of travel is under the 6px it takes to move an unselected hotspot.
    fireEvent.pointerMove(layer(), {
      pointerId: 1,
      clientX: 70 * 7.2 + 3,
      clientY: 68 * 5.2,
    });
    up([70, 68]);
    expect(editor().selectedStepId).toBe('poly-1');
    expect(stepById('poly-1')).toEqual(before);
  });

  it('cycles through overlapping hotspots with Alt-click', () => {
    click([32, 32]);
    expect(editor().selectedStepId).toBe('rect-2');
    click([32, 32], { altKey: true });
    expect(editor().selectedStepId).toBe('rect-1');
    click([32, 32], { altKey: true });
    expect(editor().selectedStepId).toBe('rect-2');
  });

  it('moves every vertex when a selected polygon is dragged', () => {
    click([70, 68]);
    drag([70, 68], [75, 70]);
    const moved = stepById('poly-1');
    expect(moved.region?.points?.[0].x).toBeCloseTo(65);
    expect(moved.region?.points?.[0].y).toBeCloseTo(62);
    expect(moved.region?.points?.[2].x).toBeCloseTo(75);
    expect(moved.region?.points?.[2].y).toBeCloseTo(82);
    expect(moved.xPct).toBeCloseTo(75);
  });

  it('pins the callout where it is dragged and Reset returns it to auto', () => {
    click([18, 18]);
    expect(editor().selectedStepId).toBe('rect-1');
    fireEvent.pointerDown(layer(), {
      button: 0,
      pointerId: 1,
      clientX: 620,
      clientY: 420,
    });
    fireEvent.pointerMove(layer(), {
      pointerId: 1,
      clientX: 630,
      clientY: 425,
    });
    fireEvent.pointerMove(layer(), {
      pointerId: 1,
      clientX: 640,
      clientY: 430,
    });
    fireEvent.pointerUp(layer(), { pointerId: 1, clientX: 640, clientY: 430 });
    const pin = stepById('rect-1').calloutPin;
    // The callout centre (650, 430) plus the 20×10px drag.
    expect(pin?.xPct).toBeCloseTo(670 / 7.2);
    expect(pin?.yPct).toBeCloseTo(440 / 5.2);
    fireEvent.click(screen.getByRole('button', { name: 'Reset to auto' }));
    expect(stepById('rect-1').calloutPin).toBeUndefined();
  });

  it('treats a 3px callout wiggle and a double-click as editing, not pinning', () => {
    click([18, 18]);
    fireEvent.pointerDown(layer(), {
      button: 0,
      pointerId: 1,
      clientX: 620,
      clientY: 420,
    });
    fireEvent.pointerMove(layer(), {
      pointerId: 1,
      clientX: 623,
      clientY: 420,
    });
    fireEvent.pointerUp(layer(), { pointerId: 1, clientX: 623, clientY: 420 });
    fireEvent.doubleClick(layer(), { clientX: 623, clientY: 420 });
    expect(stepById('rect-1').calloutPin).toBeUndefined();
    expect(document.querySelector('[data-gl-studio-canvas]')).toHaveAttribute(
      'data-editing-step',
      'rect-1'
    );
  });

  it('nudges the selected region by 0.25% with ArrowRight and 2% with Shift', () => {
    click([80, 20]);
    expect(editor().selectedStepId).toBe('pin-1');
    press('ArrowRight');
    expect(stepById('pin-1').xPct).toBeCloseTo(80.25);
    press('ArrowDown', { shiftKey: true });
    expect(stepById('pin-1').yPct).toBeCloseTo(22);
  });

  it('undoes a whole drag in one step', () => {
    click([18, 18]);
    drag([18, 18], [28, 22]);
    expect(stepById('rect-1').xPct).toBeCloseTo(35);
    act(() => editor().undo());
    expect(stepById('rect-1')).toEqual(STEPS[0]);
  });

  it('resizes a rect from a corner handle', () => {
    click([18, 18]);
    const se = document.querySelector('[data-gl-handle="se"]');
    if (!se) throw new Error('no handle');
    fireEvent.pointerDown(se, { button: 0, pointerId: 1, ...at(35, 35) });
    moveTo([45, 40], { ctrlKey: true });
    up([45, 40], { ctrlKey: true });
    const r = stepById('rect-1');
    expect(r.region?.wPct).toBeCloseTo(30);
    expect(r.region?.hPct).toBeCloseTo(25);
    expect(r.xPct).toBeCloseTo(30);
  });

  it('snaps a moved region to another region and shows a guide', () => {
    click([70, 68]);
    down([70, 68]);
    // 0.4% left puts poly-1's right edge at 79.6, within snapping range of pin-1 at 80.
    moveTo([69.6, 68]);
    frames.step();
    expect(screen.getByTestId('gl-studio-guide-x')).toBeInTheDocument();
    up([69.6, 68]);
    expect(stepById('poly-1').xPct).toBeCloseTo(70);
    expect(screen.queryByTestId('gl-studio-guide-x')).toBeNull();
  });

  it('cycles the selection through the slide with Tab', () => {
    press('Tab');
    expect(editor().selectedStepId).toBe('rect-1');
    press('Tab');
    expect(editor().selectedStepId).toBe('rect-2');
    press('Tab', { shiftKey: true });
    expect(editor().selectedStepId).toBe('rect-1');
  });

  it('applies only the latest pointer move once per animation frame', () => {
    click([18, 18]);
    down([18, 18]);
    moveTo([20, 19], { ctrlKey: true });
    moveTo([24, 20], { ctrlKey: true });
    moveTo([28, 22], { ctrlKey: true });
    expect(frames.pending()).toBe(1);
    expect(stepById('rect-1')).toEqual(STEPS[0]);
    frames.step();
    expect(stepById('rect-1').xPct).toBeCloseTo(35);
    expect(stepById('rect-1').yPct).toBeCloseTo(29);
    up([28, 22], { ctrlKey: true });
    act(() => editor().undo());
    expect(stepById('rect-1')).toEqual(STEPS[0]);
  });

  it('renders the stage at most once per frame across a 60-move drag, as one undo step', () => {
    click([18, 18]);
    // Hovering first lets the newly selected callout settle before frames are counted.
    moveTo([38, 38]);
    frames.step();
    fireEvent.pointerLeave(layer());
    down([18, 18]);
    const perFrame: number[] = [];
    for (let i = 1; i <= 60; i++) {
      if (i % 3 === 1) stageRenders.count = 0;
      moveTo([18 + i * 0.2, 18 + i * 0.1], { ctrlKey: true });
      if (i % 3 === 0) {
        frames.step();
        perFrame.push(stageRenders.count);
      }
    }
    up([30, 24], { ctrlKey: true });
    expect(perFrame).toHaveLength(20);
    expect(Math.max(...perFrame)).toBe(1);
    expect(stepById('rect-1').xPct).toBeCloseTo(37);
    act(() => editor().undo());
    expect(stepById('rect-1')).toEqual(STEPS[0]);
    expect(editor().canUndo).toBe(false);
  });

  it('flushes a move still waiting for its frame on pointerup', () => {
    click([18, 18]);
    down([18, 18]);
    moveTo([23, 20], { ctrlKey: true });
    moveTo([28, 22], { ctrlKey: true });
    up([28, 22], { ctrlKey: true });
    expect(frames.pending()).toBe(0);
    expect(stepById('rect-1').xPct).toBeCloseTo(35);
    expect(editor().canUndo).toBe(true);
    act(() => editor().undo());
    expect(stepById('rect-1')).toEqual(STEPS[0]);
    expect(editor().canUndo).toBe(false);
  });

  it('keeps the last drawn box when pointerup lands before its frame', () => {
    press('r');
    down([50, 40]);
    moveTo([60, 55], { ctrlKey: true });
    up([60, 55], { ctrlKey: true });
    const added = editor().steps[4];
    expect(added.region?.wPct).toBeCloseTo(10);
    expect(added.region?.hPct).toBeCloseTo(15);
  });

  it('cancels a pending frame on unmount', () => {
    click([18, 18]);
    down([18, 18]);
    moveTo([28, 22], { ctrlKey: true });
    expect(frames.pending()).toBe(1);
    cleanup();
    expect(frames.pending()).toBe(0);
  });

  it('zooms the canvas around the pointer with Ctrl+wheel and fits with 0', () => {
    const root = document.querySelector('[data-gl-studio-canvas]');
    if (!root) throw new Error('no canvas');
    fireEvent.wheel(root, {
      deltaY: -100,
      ctrlKey: true,
      clientX: 100,
      clientY: 100,
    });
    expect(screen.getByTestId('gl-studio-zoom').textContent).not.toBe('100%');
    expect(screen.getByTestId('gl-studio-viewport').style.transform).toContain(
      'scale('
    );
    press('0');
    expect(screen.getByTestId('gl-studio-zoom').textContent).toBe('100%');
  });
});

describe('Studio canvas on touch', () => {
  const touch = (id: number, p: Pt, primary = id === 1) => ({
    pointerId: id,
    pointerType: 'touch',
    isPrimary: primary,
    button: 0,
    ...at(...p),
  });
  const zoomText = () => screen.getByTestId('gl-studio-zoom').textContent;
  const transform = () =>
    screen.getByTestId('gl-studio-viewport').style.transform;

  it('drags a step with one finger as with a mouse', () => {
    click([18, 18]);
    fireEvent.pointerDown(layer(), touch(1, [18, 18]));
    fireEvent.pointerMove(layer(), { ...touch(1, [23, 20]), ctrlKey: true });
    fireEvent.pointerMove(layer(), { ...touch(1, [28, 22]), ctrlKey: true });
    fireEvent.pointerUp(layer(), { ...touch(1, [28, 22]), ctrlKey: true });
    expect(stepById('rect-1').xPct).toBeCloseTo(35);
    expect(zoomText()).toBe('100%');
  });

  it('pinch-zooms without moving the step under the first finger', () => {
    click([18, 18]);
    const before = stepById('rect-1');
    fireEvent.pointerDown(layer(), touch(1, [18, 18]));
    fireEvent.pointerDown(layer(), touch(2, [48, 18]));
    fireEvent.pointerMove(layer(), touch(1, [8, 18]));
    fireEvent.pointerMove(layer(), touch(2, [58, 18]));
    expect(zoomText()).not.toBe('100%');
    fireEvent.pointerUp(layer(), touch(2, [58, 18]));
    fireEvent.pointerMove(layer(), touch(1, [4, 30]));
    fireEvent.pointerUp(layer(), touch(1, [4, 30]));
    expect(stepById('rect-1')).toEqual(before);
    expect(editor().canUndo).toBe(false);
  });

  it('a second finger ends a drag already under way as one undo step', () => {
    click([18, 18]);
    fireEvent.pointerDown(layer(), touch(1, [18, 18]));
    fireEvent.pointerMove(layer(), { ...touch(1, [28, 22]), ctrlKey: true });
    frames.step();
    expect(stepById('rect-1').xPct).toBeCloseTo(35);
    fireEvent.pointerDown(layer(), touch(2, [60, 60]));
    fireEvent.pointerMove(layer(), touch(2, [70, 70]));
    fireEvent.pointerUp(layer(), touch(2, [70, 70]));
    fireEvent.pointerUp(layer(), touch(1, [28, 22]));
    // A later hover must not keep dragging the step.
    moveTo([60, 60]);
    expect(stepById('rect-1').xPct).toBeCloseTo(35);
    act(() => editor().undo());
    expect(stepById('rect-1')).toEqual(STEPS[0]);
  });

  it('pans with two fingers at a steady spread', () => {
    fireEvent.pointerDown(layer(), touch(1, [40, 40]));
    fireEvent.pointerDown(layer(), touch(2, [60, 40]));
    fireEvent.pointerMove(layer(), touch(1, [45, 45]));
    fireEvent.pointerMove(layer(), touch(2, [65, 45]));
    expect(zoomText()).toBe('100%');
    expect(transform()).toBe(`translate(${5 * 7.2}px, ${5 * 5.2}px) scale(1)`);
    fireEvent.pointerUp(layer(), touch(1, [45, 45]));
    fireEvent.pointerUp(layer(), touch(2, [65, 45]));
    expect(editor().steps).toHaveLength(STEPS.length);
  });

  it('never adds a step when a pinch starts in draw mode', () => {
    press('r');
    fireEvent.pointerDown(layer(), touch(1, [50, 40]));
    fireEvent.pointerMove(layer(), touch(1, [55, 45]));
    fireEvent.pointerDown(layer(), touch(2, [70, 60]));
    fireEvent.pointerMove(layer(), touch(2, [80, 70]));
    fireEvent.pointerUp(layer(), touch(1, [55, 45]));
    fireEvent.pointerUp(layer(), touch(2, [80, 70]));
    expect(editor().steps).toHaveLength(STEPS.length);
  });

  it('opens the callout for typing on a double tap', () => {
    click([18, 18]);
    const tap = () => {
      const t = {
        pointerId: 1,
        pointerType: 'touch',
        button: 0,
        clientX: 620,
        clientY: 420,
      };
      fireEvent.pointerDown(layer(), t);
      fireEvent.pointerUp(layer(), t);
    };
    const root = document.querySelector('[data-gl-studio-canvas]');
    tap();
    expect(root).not.toHaveAttribute('data-editing-step');
    tap();
    expect(root).toHaveAttribute('data-editing-step', 'rect-1');
    expect(stepById('rect-1').calloutPin).toBeUndefined();
  });
});
