import React, { useEffect } from 'react';
import {
  act,
  cleanup,
  within,
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
import { calloutArrowPaths } from '../interactions/CalloutArrow';
import { connectorFor } from '../../utils/calloutPlacement';
import type { GuidedLearningStageProps as StageProps } from '../../types/stage';

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
// Counts the stage body itself, not the edit layer rendered inside it.
vi.mock('../GuidedLearningStage', async (importOriginal) => {
  const real = await importOriginal<typeof import('../GuidedLearningStage')>();
  const memo = real.GuidedLearningStage as unknown as {
    type: (props: StageProps) => React.ReactNode;
    compare: (a: StageProps, b: StageProps) => boolean;
  };
  const Counted = (props: StageProps) => {
    stageRenders.count++;
    return memo.type(props);
  };
  return { ...real, GuidedLearningStage: React.memo(Counted, memo.compare) };
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
  const tools = useCanvasTools(state, BOARD, { calloutEditing: true });
  useStudioShortcuts([...tools.typeRows, ...tools.rows], {
    editing: tools.editingStepId !== null,
  });
  useEffect(() => {
    latest.current = state;
  });
  return (
    <StudioCanvas
      state={state}
      tools={tools}
      setId="set-1"
      preset={BOARD}
      onDeleteStep={(id) => state.deleteStep(id)}
    />
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

describe('Studio callout editing (gl-callout-editing)', () => {
  const canvas = () => document.querySelector('[data-gl-studio-canvas]');
  // Selects rect-1, then its callout with a click inside the callout box.
  const selectCallout = () => {
    click([18, 18]);
    fireEvent.pointerDown(layer(), {
      button: 0,
      pointerId: 1,
      clientX: 620,
      clientY: 420,
    });
    fireEvent.pointerUp(layer(), { pointerId: 1, clientX: 620, clientY: 420 });
  };
  const dragHandle = (
    id: string,
    from: Pt,
    to: Pt,
    init: Record<string, unknown> = {}
  ) => {
    const el = screen.getByTestId(`gl-callout-handle-${id}`);
    fireEvent.pointerDown(el, {
      button: 0,
      pointerId: 1,
      clientX: from[0],
      clientY: from[1],
    });
    fireEvent.pointerMove(layer(), {
      pointerId: 1,
      clientX: to[0],
      clientY: to[1],
      ctrlKey: true,
      ...init,
    });
    frames.step();
    fireEvent.pointerUp(layer(), {
      pointerId: 1,
      clientX: to[0],
      clientY: to[1],
      ctrlKey: true,
      ...init,
    });
  };

  it('outlines the callout on hover with a move cursor', () => {
    click([18, 18]);
    moveTo([18, 18]);
    frames.step();
    expect(screen.queryByTestId('gl-callout-hover')).toBeNull();
    fireEvent.pointerMove(layer(), {
      pointerId: 1,
      clientX: 620,
      clientY: 420,
    });
    frames.step();
    expect(screen.getByTestId('gl-callout-hover')).toBeInTheDocument();
    expect(layer()).toHaveClass('cursor-move');
  });

  it('selects the callout with a click, showing eight handles and the anchor dot', () => {
    selectCallout();
    expect(screen.getByTestId('gl-callout-selection')).toBeInTheDocument();
    for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      expect(screen.getByTestId(`gl-callout-handle-${h}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('gl-callout-anchor-dot')).toBeInTheDocument();
    // The region's own handles step aside while its callout is selected.
    expect(document.querySelector('[data-gl-handle]')).toBeNull();
    expect(stepById('rect-1').calloutBox).toBeUndefined();
  });

  it('moves the frame, handles and card together during a callout drag', () => {
    selectCallout();
    fireEvent.pointerDown(layer(), {
      button: 0,
      pointerId: 1,
      clientX: 620,
      clientY: 420,
    });
    fireEvent.pointerMove(layer(), {
      pointerId: 1,
      clientX: 600,
      clientY: 380,
      ctrlKey: true,
    });
    frames.step();
    const card = document.querySelector<HTMLElement>(
      '[data-gl-callout="rect-1"]'
    );
    expect(card?.style.translate).toBe('-20px -40px');
    const frame = screen.getByTestId('gl-callout-selection');
    expect(parseFloat(frame.style.left)).toBeCloseTo(580);
    expect(parseFloat(frame.style.top)).toBeCloseTo(360);
    const handle = screen.getByTestId('gl-callout-handle-nw');
    expect(
      parseFloat(handle.style.left) + parseFloat(handle.style.width) / 2
    ).toBeCloseTo(580);
    expect(stepById('rect-1').calloutBox).toBeUndefined();
    fireEvent.pointerUp(layer(), {
      pointerId: 1,
      clientX: 600,
      clientY: 380,
      ctrlKey: true,
    });
    expect(card?.style.translate).toBe('');
    expect(stepById('rect-1').calloutBox).toEqual({
      xPct: expect.closeTo(580 / 7.2) as number,
      yPct: expect.closeTo(360 / 5.2) as number,
      wPct: expect.closeTo(100 / 7.2) as number,
      hPct: expect.closeTo(60 / 5.2) as number,
    });
  });

  it('returns to region selection on Escape or a click on the region', () => {
    selectCallout();
    press('Escape');
    expect(screen.queryByTestId('gl-callout-selection')).toBeNull();
    expect(editor().selectedStepId).toBe('rect-1');
    selectCallout();
    click([20, 20]);
    expect(screen.queryByTestId('gl-callout-selection')).toBeNull();
  });

  it('drops the callout selection when another step is selected by any route', () => {
    selectCallout();
    act(() => editor().setSelectedStepId('rect-2'));
    expect(screen.queryByTestId('gl-callout-selection')).toBeNull();
    act(() => editor().setSelectedStepId('rect-1'));
    expect(screen.queryByTestId('gl-callout-selection')).toBeNull();
  });

  // The stored box in container px (1% = 7.2px × 5.2px).
  const pxBox = (id: string) => {
    const b = stepById(id).calloutBox;
    if (!b) throw new Error('no box');
    return {
      x: b.xPct * 7.2,
      y: b.yPct * 5.2,
      w: b.wPct * 7.2,
      h: b.hPct * 5.2,
    };
  };
  const expectBox = (
    id: string,
    r: { x: number; y: number; w: number; h: number }
  ) => {
    const b = pxBox(id);
    expect(b.x).toBeCloseTo(r.x);
    expect(b.y).toBeCloseTo(r.y);
    expect(b.w).toBeCloseTo(r.w);
    expect(b.h).toBeCloseTo(r.h);
  };

  it('resizes from a side handle as one undo step, keeping the far edge', () => {
    selectCallout();
    dragHandle('e', [700, 430], [710, 430]);
    expectBox('rect-1', { x: 600, y: 400, w: 110, h: 60 });
    act(() => editor().undo());
    expect(stepById('rect-1').calloutBox).toBeUndefined();
  });

  it('resizes the height from the top handle', () => {
    selectCallout();
    dragHandle('n', [650, 400], [650, 380]);
    expectBox('rect-1', { x: 600, y: 380, w: 100, h: 80 });
  });

  it('keeps the aspect with Shift and resizes about the centre with Alt', () => {
    selectCallout();
    dragHandle('se', [700, 460], [710, 470], { shiftKey: true });
    // The larger of 1.1× and 1.17× wins.
    expectBox('rect-1', { x: 600, y: 400, w: (100 * 70) / 60, h: 70 });
    act(() => editor().undo());
    selectCallout();
    dragHandle('e', [700, 430], [720, 430], { altKey: true });
    expectBox('rect-1', { x: 580, y: 400, w: 140, h: 60 });
  });

  it('snaps a handle to another callout box unless Ctrl is held', () => {
    act(() =>
      editor().updateStep({
        ...stepById('rect-2'),
        calloutBox: { xPct: 90, yPct: 10, wPct: 5, hPct: 5 },
      })
    );
    selectCallout();
    // rect-2's box ends at 684px, 2px from the pointer.
    dragHandle('e', [700, 430], [686, 430], { ctrlKey: false });
    expect(pxBox('rect-1').w).toBeCloseTo(84);
    act(() => editor().undo());
    selectCallout();
    dragHandle('e', [700, 430], [686, 430]);
    expect(pxBox('rect-1').w).toBeCloseTo(86);
  });

  it('turns a pinned, sized callout into a box that keeps its place on screen', () => {
    selectCallout();
    act(() =>
      editor().updateStep({
        ...stepById('rect-1'),
        calloutPin: { xPct: 90, yPct: 83 },
        calloutWidthPct: 14,
        calloutScale: 1.25,
        tooltipPosition: 'left',
      })
    );
    dragHandle('w', [600, 430], [560, 430]);
    expectBox('rect-1', { x: 560, y: 400, w: 140, h: 60 });
    const step = stepById('rect-1');
    for (const key of [
      'calloutPin',
      'calloutWidthPct',
      'calloutScale',
      'tooltipPosition',
      'tooltipOffset',
    ] as const) {
      expect(step[key]).toBeUndefined();
    }
  });

  it('re-routes the connector from the box being dragged', () => {
    selectCallout();
    const line = () =>
      document.querySelector(
        '[data-gl-connector="rect-1"] [data-gl-connector-line]'
      );
    const before = line()?.getAttribute('d');
    expect(before).toBeTruthy();
    fireEvent.pointerDown(layer(), {
      button: 0,
      pointerId: 1,
      clientX: 620,
      clientY: 420,
    });
    fireEvent.pointerMove(layer(), {
      pointerId: 1,
      clientX: 420,
      clientY: 420,
      ctrlKey: true,
    });
    frames.step();
    // rect-1's region is 108,78 144×104; the box is now at 400,400.
    const arrow = connectorFor(
      { x: 400, y: 400, w: 100, h: 60 },
      { x: 108, y: 78, w: 144, h: 104 }
    );
    const paths =
      arrow && calloutArrowPaths(arrow.from, arrow.to, arrow.normal);
    const nums = (d: string | null | undefined) =>
      (d ?? '')
        .split(/[^\d.-]+/)
        .filter(Boolean)
        .map(Number);
    const want = nums(paths?.d);
    const got = nums(line()?.getAttribute('d'));
    expect(got).toHaveLength(want.length);
    got.forEach((n, i) => expect(n).toBeCloseTo(want[i]));
    expect(before).not.toBe(line()?.getAttribute('d'));
    fireEvent.pointerUp(layer(), {
      pointerId: 1,
      clientX: 420,
      clientY: 420,
      ctrlKey: true,
    });
  });

  it('keeps a boxed callout still while its hotspot moves', () => {
    act(() =>
      editor().updateStep({
        ...stepById('pin-1'),
        calloutBox: {
          xPct: 100 / 7.2,
          yPct: 300 / 5.2,
          wPct: 100 / 7.2,
          hPct: 60 / 5.2,
        },
      })
    );
    click([80, 20]);
    const card = document.querySelector<HTMLElement>(
      '[data-gl-callout="pin-1"]'
    );
    const dot = document.querySelector<HTMLElement>('[data-gl-anchor="pin-1"]');
    const line = () =>
      document.querySelector(
        '[data-gl-connector="pin-1"] [data-gl-connector-line]'
      );
    const before = line()?.getAttribute('d');
    down([80, 20]);
    moveTo([70, 25], { ctrlKey: true });
    frames.step();
    expect(card?.style.translate ?? '').toBe('');
    expect(dot?.style.translate).toBe(`${-10 * 7.2}px ${5 * 5.2}px`);
    expect(line()?.getAttribute('d')).not.toBe(before);
    up([70, 25], { ctrlKey: true });
    expect(dot?.style.translate ?? '').toBe('');
    expect(stepById('pin-1').calloutBox?.xPct).toBeCloseTo(100 / 7.2);
    expect(stepById('pin-1').xPct).toBeCloseTo(70);
  });

  it('sizes with Alt+arrows', () => {
    selectCallout();
    canvas()?.dispatchEvent(new Event('focus'));
    fireEvent.keyDown(canvas() as Element, { key: 'ArrowRight', altKey: true });
    // The measured 100×60px box, one point wider.
    expect(pxBox('rect-1').w).toBeCloseTo(107.2);
    expect(pxBox('rect-1').h).toBeCloseTo(60);
    fireEvent.keyDown(canvas() as Element, { key: 'ArrowUp', altKey: true });
    // Larger keeps the shape.
    const { w, h } = pxBox('rect-1');
    expect(w).toBeCloseTo(114.4);
    expect(h).toBeCloseTo((60 * 114.4) / 107.2);
  });

  it('opens inline editing when a character is typed, keeping the character', () => {
    selectCallout();
    fireEvent.keyDown(canvas() as Element, { key: 'a' });
    expect(canvas()).toHaveAttribute('data-editing-step', 'rect-1');
    expect(stepById('rect-1').text).toBe('Firsta');
    // The add-step tool key did not fire.
    expect(editor().addingStep).toBe(false);
  });

  it('opens inline editing with Enter', () => {
    selectCallout();
    fireEvent.keyDown(canvas() as Element, { key: 'Enter' });
    expect(canvas()).toHaveAttribute('data-editing-step', 'rect-1');
  });

  describe('toolbar', () => {
    const toolbar = () => screen.getByTestId('gl-callout-toolbar');
    const button = (name: string) =>
      within(toolbar()).getByRole('button', { name });

    it('shows over a selected callout and leaves the canvas gesture alone', () => {
      selectCallout();
      expect(toolbar()).toBeInTheDocument();
      expect(button('Reset position')).toBeDisabled();
      expect(button('Reset size')).toBeDisabled();
      fireEvent.pointerDown(button('Reset size'), { button: 0, pointerId: 1 });
      expect(screen.getByTestId('gl-callout-selection')).toBeInTheDocument();
    });

    it('resets size and position', () => {
      selectCallout();
      act(() =>
        editor().updateStep({
          ...stepById('rect-1'),
          calloutPin: { xPct: 90, yPct: 83 },
          calloutWidthPct: 40,
          calloutScale: 1.5,
          calloutTone: 'light',
        })
      );
      fireEvent.click(button('Reset size'));
      expect(stepById('rect-1').calloutWidthPct).toBeUndefined();
      expect(stepById('rect-1').calloutScale).toBeUndefined();
      expect(stepById('rect-1').calloutPin).toBeDefined();
      fireEvent.click(button('Reset position'));
      expect(stepById('rect-1').calloutPin).toBeUndefined();
      expect(stepById('rect-1').calloutTone).toBe('light');
    });

    it('switches a tooltip to a text box and back, keeping its text and style', () => {
      selectCallout();
      act(() =>
        editor().updateStep({ ...stepById('rect-1'), calloutScale: 1.25 })
      );
      fireEvent.click(button('Change to text box'));
      expect(stepById('rect-1')).toMatchObject({
        interactionType: 'text-popover',
        text: 'First',
        calloutScale: 1.25,
      });
      fireEvent.click(button('Change to tooltip'));
      expect(stepById('rect-1').interactionType).toBe('tooltip');
    });

    it('picks a colour and marks the one in use', () => {
      selectCallout();
      expect(button('Dark')).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(button('Accent'));
      expect(stepById('rect-1').calloutTone).toBe('accent');
      expect(button('Accent')).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(button('Dark'));
      expect(stepById('rect-1').calloutTone).toBeUndefined();
    });

    it('opens inline editing', () => {
      selectCallout();
      fireEvent.click(button('Edit text'));
      expect(canvas()).toHaveAttribute('data-editing-step', 'rect-1');
    });

    it('deletes the step', () => {
      selectCallout();
      fireEvent.click(button('Delete step'));
      expect(editor().steps.some((s) => s.id === 'rect-1')).toBe(false);
    });
  });

  describe('inline editing keys', () => {
    const openEditor = () => {
      selectCallout();
      fireEvent.keyDown(canvas() as Element, { key: 'Enter' });
    };

    it('moves from the title to the body on Enter', () => {
      openEditor();
      const title = screen.getByLabelText('Callout title');
      title.focus();
      fireEvent.keyDown(title, { key: 'Enter' });
      expect(document.activeElement).toHaveAttribute('data-gl-inline', 'text');
    });

    it('keeps blank lines in the body and finishes on Ctrl+Enter', () => {
      openEditor();
      const body = screen.getByLabelText('Callout text');
      fireEvent.change(body, { target: { value: 'a\n\nb\n' } });
      fireEvent.keyDown(body, { key: 'Enter' });
      expect(canvas()).toHaveAttribute('data-editing-step', 'rect-1');
      fireEvent.keyDown(body, { key: 'Enter', ctrlKey: true });
      expect(canvas()).not.toHaveAttribute('data-editing-step');
      expect(stepById('rect-1').text).toBe('a\n\nb\n');
    });
  });
});
