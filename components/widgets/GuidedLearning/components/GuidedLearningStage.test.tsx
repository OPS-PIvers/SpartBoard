import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningPublicStep, GuidedLearningSet } from '@/types';
import { mockStageLayout } from '@/tests/utils/mockStageLayout';
import { GuidedLearningStage } from './GuidedLearningStage';
import type { StageGeometry } from '../types/stage';
import { pointInRegion, regionRect } from '../utils/regionGeometry';
import { rectOverlapArea } from '../utils/calloutPlacement';

const STEPS: GuidedLearningPublicStep[] = [
  {
    id: 'zoom',
    xPct: 40,
    yPct: 60,
    imageIndex: 0,
    interactionType: 'pan-zoom',
    panZoomScale: 2.5,
    showOverlay: 'none',
  },
];

const SET: GuidedLearningSet = {
  id: 'set',
  schemaVersion: 2,
  title: 'Stage',
  imageUrls: ['https://example.com/slide.png'],
  steps: STEPS as GuidedLearningSet['steps'],
  mode: 'structured',
  createdAt: 0,
  updatedAt: 0,
};

function renderStage(
  zoomScale: number,
  extra: Partial<React.ComponentProps<typeof GuidedLearningStage>> = {}
) {
  return render(
    <GuidedLearningStage
      set={SET}
      steps={STEPS}
      imageIndex={0}
      activeStepId="zoom"
      authorMode="structured"
      answeredStepIds={new Set()}
      teacherMode
      zoomScale={zoomScale}
      onPinClick={vi.fn()}
      onAdvance={vi.fn()}
      onDismiss={vi.fn()}
      {...extra}
    />
  );
}

let restore: (() => void) | null = null;
afterEach(() => {
  cleanup();
  restore?.();
  restore = null;
});

// 1600x900 in 800x600 letterboxes to 800x450, 75px from the top.
function layout() {
  const handle = mockStageLayout({
    container: { w: 800, h: 600 },
    image: { w: 1600, h: 900 },
    origin: { x: 100, y: 50 },
  });
  restore = handle.restore;
  return handle;
}

describe('GuidedLearningStage geometry', () => {
  it.each([1, 2.5])(
    'round-trips clientToImagePct and imagePctToContainerPx at zoom %s',
    (zoom) => {
      const handle = layout();
      let g: StageGeometry | null = null;
      renderStage(zoom, { onGeometry: (next) => (g = next) });
      act(() => handle.fireResize());
      expect(g).not.toBeNull();
      const geometry = g as unknown as StageGeometry;
      expect(geometry.renderedTransform.scale).toBe(zoom);
      expect(geometry.imgOffset.top).toBeCloseTo(12.5);

      for (const p of [
        { xPct: 30, yPct: 70 },
        { xPct: 40, yPct: 60 },
        { xPct: 0, yPct: 100 },
      ]) {
        const px = geometry.imagePctToContainerPx(p);
        const back = geometry.clientToImagePct(100 + px.x, 50 + px.y);
        expect(back.xPct).toBeCloseTo(p.xPct, 6);
        expect(back.yPct).toBeCloseTo(p.yPct, 6);
        const inverse = geometry.containerPxToImagePct(px.x, px.y);
        expect(inverse.xPct).toBeCloseTo(p.xPct, 6);
        expect(inverse.yPct).toBeCloseTo(p.yPct, 6);
      }
      // At zoom the focused step paints at the container centre.
      if (zoom > 1) {
        const focus = geometry.imagePctToContainerPx({ xPct: 40, yPct: 60 });
        expect(focus.x).toBeCloseTo(400);
        expect(focus.y).toBeCloseTo(300);
      }
    }
  );

  it('passes the geometry to renderEditLayer', () => {
    const handle = layout();
    renderStage(1, {
      renderEditLayer: (g) => (
        <div data-testid="edit-layer">
          {g.containerSize.w}x{g.containerSize.h}:
          {Math.round(g.regionFor(STEPS[0]).w)}
        </div>
      ),
    });
    expect(screen.queryByTestId('edit-layer')).toBeNull();
    act(() => handle.fireResize());
    // Default region is the pin footprint: min(32, 8% of 600).
    expect(screen.getByTestId('edit-layer').textContent).toBe('800x600:32');
  });

  it('fires onGeometry only after measurement, and again on resize', () => {
    const handle = layout();
    const onGeometry = vi.fn<(g: StageGeometry) => void>();
    renderStage(1, { onGeometry });
    expect(onGeometry).not.toHaveBeenCalled();
    act(() => handle.fireResize());
    expect(onGeometry).toHaveBeenCalledTimes(1);
    expect(onGeometry.mock.calls[0][0].containerSize).toEqual({
      w: 800,
      h: 600,
    });
    act(() => handle.resize({ w: 400, h: 300 }));
    expect(onGeometry).toHaveBeenLastCalledWith(
      expect.objectContaining({ containerSize: { w: 400, h: 300 } })
    );
  });
});

// ─── P1-2b: regions, callout placement, rich text ───────────────────────────

const v3 = (
  steps: GuidedLearningPublicStep[],
  mode: GuidedLearningSet['mode']
) =>
  ({
    ...SET,
    schemaVersion: 3,
    mode,
    steps: steps as GuidedLearningSet['steps'],
  }) as GuidedLearningSet;

function renderV3(
  steps: GuidedLearningPublicStep[],
  opts: {
    mode?: GuidedLearningSet['mode'];
    activeStepId?: string | null;
    onPinClick?: (id: string) => void;
    onGeometry?: (g: StageGeometry) => void;
  } = {}
) {
  const mode = opts.mode ?? 'structured';
  return render(
    <GuidedLearningStage
      set={v3(steps, mode)}
      steps={steps}
      imageIndex={0}
      activeStepId={
        opts.activeStepId === undefined ? steps[0].id : opts.activeStepId
      }
      authorMode={mode}
      answeredStepIds={new Set()}
      teacherMode
      zoomScale={1}
      onPinClick={opts.onPinClick ?? vi.fn()}
      onAdvance={vi.fn()}
      onDismiss={vi.fn()}
      onGeometry={opts.onGeometry}
    />
  );
}

const step = (
  over: Partial<GuidedLearningPublicStep>
): GuidedLearningPublicStep => ({
  id: 'r',
  xPct: 25,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'tooltip',
  label: 'Target',
  text: 'Press **Save**.',
  ...over,
});

const cardRect = () => {
  const el = screen.getByTestId('gl-tooltip-card');
  return {
    x: parseFloat(el.style.left),
    y: parseFloat(el.style.top),
    // jsdom fallback size: min(340, 50% w) x max(76, 16% h)
    w: 340,
    h: 96,
  };
};

describe('GuidedLearningStage regions and callouts', () => {
  it('cuts the spotlight to the drawn region instead of the radius circle', () => {
    const handle = layout();
    renderV3([
      step({
        interactionType: 'spotlight',
        spotlightRadius: 40,
        region: { shape: 'rect', wPct: 10, hPct: 20 },
      }),
    ]);
    act(() => handle.fireResize());
    const rim = screen.getByTestId('gl-spotlight-rim');
    expect(rim.tagName.toLowerCase()).toBe('path');
    // 10% x 20% of an 800x450 image at (25%, 50%) → 80x90 centred on (200, 300).
    expect(rim.getAttribute('d')).toBe('M160,255 H240 V345 H160 Z');
  });

  it('keeps the radius circle for a spotlight without a region', () => {
    const handle = layout();
    renderV3([step({ interactionType: 'spotlight', spotlightRadius: 10 })]);
    act(() => handle.fireResize());
    expect(screen.getByTestId('gl-spotlight-rim').tagName.toLowerCase()).toBe(
      'circle'
    );
  });

  it('hit-tests explore zones inside and outside an ellipse and a polygon', () => {
    const handle = layout();
    const onPinClick = vi.fn();
    let g: StageGeometry | null = null;
    const ellipse = step({
      id: 'ellipse',
      xPct: 30,
      yPct: 30,
      region: { shape: 'ellipse', wPct: 20, hPct: 20 },
    });
    const polygon = step({
      id: 'poly',
      xPct: 70,
      yPct: 70,
      region: {
        shape: 'polygon',
        wPct: 20,
        hPct: 20,
        points: [
          { x: 60, y: 60 },
          { x: 80, y: 60 },
          { x: 80, y: 80 },
          { x: 70, y: 66 },
          { x: 60, y: 80 },
        ],
      },
    });
    renderV3([ellipse, polygon], {
      mode: 'explore',
      activeStepId: null,
      onPinClick,
      onGeometry: (next) => (g = next),
    });
    act(() => handle.fireResize());
    const geometry = g as unknown as StageGeometry;

    const e = geometry.regionFor(ellipse);
    const centre = geometry.imagePctToContainerPx({ xPct: 30, yPct: 30 });
    const corner = geometry.imagePctToContainerPx({ xPct: 21, yPct: 21 });
    expect(pointInRegion(centre, e)).toBe(true);
    expect(pointInRegion(corner, e)).toBe(false);

    const p = geometry.regionFor(polygon);
    const inArm = geometry.imagePctToContainerPx({ xPct: 62, yPct: 75 });
    const inNotch = geometry.imagePctToContainerPx({ xPct: 70, yPct: 75 });
    expect(pointInRegion(inArm, p)).toBe(true);
    expect(pointInRegion(inNotch, p)).toBe(false);

    const zones = document.querySelectorAll('[data-gl-region]');
    expect(zones).toHaveLength(2);
    const polyZone = document.querySelector(
      '[data-gl-region="poly"]'
    ) as HTMLElement;
    expect(polyZone.style.clipPath).toContain('polygon(');
    fireEvent.click(polyZone);
    expect(onPinClick).toHaveBeenCalledWith('poly');
  });

  it('makes a hidden hotspot with a region clickable, still without a pin', () => {
    const handle = layout();
    const onPinClick = vi.fn();
    renderV3(
      [
        step({
          id: 'hidden',
          hotspotAlwaysHidden: true,
          region: { shape: 'rect', wPct: 10, hPct: 10 },
        }),
      ],
      { mode: 'explore', activeStepId: null, onPinClick }
    );
    act(() => handle.fireResize());
    expect(screen.getAllByRole('button', { name: 'Target' })).toHaveLength(1);
    fireEvent.click(
      document.querySelector('[data-gl-region="hidden"]') as HTMLElement
    );
    expect(onPinClick).toHaveBeenCalledWith('hidden');
  });

  it.each([
    ['top', 50, 8],
    ['bottom', 50, 92],
    ['left', 6, 50],
    ['right', 94, 50],
  ])('keeps the tooltip off a region at the %s edge', (_edge, x, y) => {
    const handle = layout();
    let g: StageGeometry | null = null;
    const s = step({
      xPct: x,
      yPct: y,
      region: { shape: 'rect', wPct: 12, hPct: 16 },
    });
    renderV3([s], { onGeometry: (next) => (g = next) });
    act(() => handle.fireResize());
    const target = regionRect((g as unknown as StageGeometry).regionFor(s));
    expect(rectOverlapArea(cardRect(), target)).toBe(0);
  });

  it('renders a pinned callout centred on its pin', () => {
    const handle = layout();
    renderV3([
      step({ xPct: 50, yPct: 50, calloutPin: { xPct: 75, yPct: 25 } }),
    ]);
    act(() => handle.fireResize());
    // (75%, 25%) of the letterboxed image → (600, 187.5); card 340x96.
    const c = cardRect();
    expect(c.x).toBe(600 - 170);
    expect(c.y).toBe(187.5 - 48);
  });

  it('moves a banner to the bottom when its target sits near the top', () => {
    const handle = layout();
    renderV3([
      step({
        interactionType: 'spotlight',
        showOverlay: 'banner',
        yPct: 10,
        region: { shape: 'rect', wPct: 10, hPct: 10 },
      }),
    ]);
    act(() => handle.fireResize());
    const banner = document.querySelector(
      '[data-gl-callout="r"][data-position]'
    );
    expect(banner?.getAttribute('data-position')).toBe('bottom');
  });

  it('renders rich text in the tooltip', () => {
    const handle = layout();
    renderV3([
      step({ text: 'Open [help](https://example.com) then **Save**' }),
    ]);
    act(() => handle.fireResize());
    const card = screen.getByTestId('gl-tooltip-card');
    expect(card.querySelector('strong')?.textContent).toBe('Save');
    expect(card.querySelector('a')?.getAttribute('href')).toBe(
      'https://example.com'
    );
  });
});
