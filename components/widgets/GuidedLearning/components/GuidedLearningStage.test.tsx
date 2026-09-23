import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningPublicStep, GuidedLearningSet } from '@/types';
import { mockStageLayout } from '@/tests/utils/mockStageLayout';
import { GuidedLearningStage } from './GuidedLearningStage';
import type { StageGeometry } from '../types/stage';

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
