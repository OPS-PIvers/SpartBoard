import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipInteraction } from './TooltipInteraction';
import { calloutArrowPaths } from './CalloutArrow';
import { arrowBetween } from '../../utils/calloutPlacement';
import type { GuidedLearningPublicStep } from '@/types';

const baseStep: GuidedLearningPublicStep = {
  id: 's1',
  xPct: 2,
  yPct: 6,
  imageIndex: 0,
  interactionType: 'tooltip',
  label: 'Open the menu',
  text: 'Click the **menu** button.',
};

// jsdom reports 0 for offsetWidth/Height, so the component falls back to its
// size estimates: width min(340, 50% of container), height max(76, 16%).
// Without a target the keep-out is the 32px pin footprint.
const card = () => screen.getByTestId('gl-tooltip-card');

describe('TooltipInteraction', () => {
  it('keeps a card near the top-left corner inside the container and off the pin', () => {
    render(
      <TooltipInteraction
        step={{ ...baseStep, tooltipPosition: 'right' }}
        containerWidth={800}
        containerHeight={400}
      />
    );
    expect(card().style.top).toBe('12px');
    expect(card().style.left).toBe(`${32 + 16}px`);
    expect(card().dataset.side).toBe('right');
  });

  it('flips away from the far edges instead of clamping over the target', () => {
    render(
      <TooltipInteraction
        step={{ ...baseStep, xPct: 98, yPct: 96, tooltipPosition: 'below' }}
        containerWidth={800}
        containerHeight={400}
      />
    );
    expect(card().dataset.side).toBe('top');
    expect(card().style.left).toBe(`${800 - 340 - 12}px`);
    expect(card().style.top).toBe(`${384 - 16 - 16 - 76}px`);
  });

  it('places the card outside a spotlight target rect', () => {
    render(
      <TooltipInteraction
        step={{ ...baseStep, xPct: 50, yPct: 50, tooltipPosition: 'below' }}
        containerWidth={800}
        containerHeight={400}
        target={{ x: 340, y: 140, w: 120, h: 120 }}
      />
    );
    expect(card().style.top).toBe('276px');
  });

  it('auto placement prefers below when there is room', () => {
    render(
      <TooltipInteraction
        step={{ ...baseStep, xPct: 50, yPct: 20 }}
        containerWidth={800}
        containerHeight={400}
      />
    );
    expect(card().style.top).toBe(`${80 + 16 + 16}px`);
    expect(card().className).toContain('items-start');
  });

  it('renders a pinned card centred on the pin with an arrow to the target', () => {
    render(
      <TooltipInteraction
        step={{ ...baseStep, xPct: 75, yPct: 25 }}
        containerWidth={800}
        containerHeight={400}
        pinned={{ x: 200, y: 300 }}
      />
    );
    expect(card().style.left).toBe(`${200 - 170}px`);
    expect(card().style.top).toBe(`${300 - 38}px`);
    expect(screen.getByTestId('gl-callout-arrow')).toBeInTheDocument();
  });

  it('keeps line breaks and blank lines while still wrapping at the max width', () => {
    render(
      <TooltipInteraction
        step={{ ...baseStep, text: 'a\n\nb' }}
        containerWidth={800}
        containerHeight={400}
      />
    );
    const body = screen.getByText(
      (_, el) => el?.textContent === 'a\n\nb' && el.children.length === 0
    );
    expect(body).toHaveClass('whitespace-pre-wrap');
    expect(card().style.width).toBe('max-content');
    expect(card().style.maxWidth).not.toBe('');
  });

  it('marks the card for Studio hit-testing and renders rich text', () => {
    render(
      <TooltipInteraction
        step={{ ...baseStep, xPct: 50, yPct: 50 }}
        containerWidth={800}
        containerHeight={400}
      />
    );
    expect(card().getAttribute('data-gl-callout')).toBe('s1');
    expect(card().querySelector('strong')?.textContent).toBe('menu');
  });
});

describe('TooltipInteraction callout style', () => {
  it('renders the default dark card at auto width and scale 1', () => {
    render(
      <TooltipInteraction
        step={{ ...baseStep, xPct: 50, yPct: 80 }}
        containerWidth={800}
        containerHeight={400}
      />
    );
    expect(card().style.width).toBe('max-content');
    expect(card().style.getPropertyValue('--gl-callout-scale')).toBe('1');
    expect(card().className).toContain('bg-slate-900/90');
  });

  it('uses the authored width as % of the stage, clamped and capped to fit', () => {
    render(
      <TooltipInteraction
        step={{ ...baseStep, xPct: 50, yPct: 80, calloutWidthPct: 40 }}
        containerWidth={800}
        containerHeight={400}
      />
    );
    expect(card().style.width).toBe('320px');
  });

  it('caps an out-of-range width at 95% and never wider than the stage', () => {
    render(
      <TooltipInteraction
        step={{ ...baseStep, xPct: 50, yPct: 80, calloutWidthPct: 400 }}
        containerWidth={200}
        containerHeight={400}
      />
    );
    expect(card().style.width).toBe(`${200 - 24}px`);
  });

  it('clamps the scale and applies the tone to card and line', () => {
    render(
      <TooltipInteraction
        step={{
          ...baseStep,
          xPct: 50,
          yPct: 80,
          calloutScale: 9,
          calloutTone: 'light',
        }}
        containerWidth={800}
        containerHeight={400}
      />
    );
    expect(card().style.getPropertyValue('--gl-callout-scale')).toBe('2');
    expect(card().className).toContain('bg-white');
    expect(
      screen.getByTestId('gl-callout-arrow-line').getAttribute('stroke')
    ).toBe('rgb(15,23,42)');
  });

  it('ignores an unknown tone', () => {
    render(
      <TooltipInteraction
        step={{
          ...baseStep,
          xPct: 50,
          yPct: 80,
          calloutTone: 'neon' as unknown as 'dark',
        }}
        containerWidth={800}
        containerHeight={400}
      />
    );
    expect(card().className).toContain('bg-slate-900/90');
  });

  it('draws a curved leader, not a straight segment', () => {
    render(
      <TooltipInteraction
        step={{ ...baseStep, xPct: 50, yPct: 80 }}
        containerWidth={800}
        containerHeight={400}
      />
    );
    expect(
      screen.getByTestId('gl-callout-arrow-line').getAttribute('d')
    ).toMatch(/^M [\d.-]+ [\d.-]+ C /);
  });
});

describe('TooltipInteraction explicit box', () => {
  it('renders at the stored box and ignores pin, width and position', () => {
    render(
      <TooltipInteraction
        step={{
          ...baseStep,
          xPct: 50,
          yPct: 50,
          tooltipPosition: 'right',
          calloutWidthPct: 80,
          calloutScale: 2,
        }}
        containerWidth={800}
        containerHeight={400}
        pinned={{ x: 400, y: 300 }}
        box={{ x: 40, y: 30, w: 200, h: 90 }}
      />
    );
    expect(card().style.left).toBe('40px');
    expect(card().style.top).toBe('30px');
    expect(card().style.width).toBe('200px');
    expect(card().style.minHeight).toBe('90px');
  });

  it('draws the connector from the box edge nearest the hotspot', () => {
    render(
      <TooltipInteraction
        step={{ ...baseStep, xPct: 50, yPct: 50 }}
        containerWidth={800}
        containerHeight={400}
        target={{ x: 380, y: 180, w: 40, h: 40 }}
        box={{ x: 40, y: 30, w: 200, h: 90 }}
      />
    );
    const d =
      screen
        .getByTestId('gl-callout-arrow')
        .querySelector('path')
        ?.getAttribute('d') ?? '';
    expect(d.startsWith('M 240 120')).toBe(true);
  });
});

describe('TooltipInteraction connector', () => {
  const target = { x: 380, y: 180, w: 40, h: 40 };
  const lineStart = () => {
    const m = /^M ([\d.-]+) ([\d.-]+) /.exec(
      screen.getByTestId('gl-callout-arrow-line').getAttribute('d') ?? ''
    );
    return { x: Number(m?.[1]), y: Number(m?.[2]) };
  };
  const boxes = [
    ['above', { x: 300, y: 20, w: 200, h: 90 }],
    ['below', { x: 300, y: 280, w: 200, h: 90 }],
    ['left', { x: 40, y: 150, w: 200, h: 90 }],
    ['right', { x: 560, y: 150, w: 200, h: 90 }],
  ] as const;

  it.each(boxes)(
    'starts the line on the box edge when the box is %s the hotspot',
    (_, box) => {
      render(
        <TooltipInteraction
          step={{ ...baseStep, xPct: 50, yPct: 50 }}
          containerWidth={800}
          containerHeight={400}
          target={target}
          box={box}
        />
      );
      const p = lineStart();
      const onVertical = p.x === box.x || p.x === box.x + box.w;
      const onHorizontal = p.y === box.y || p.y === box.y + box.h;
      expect(onVertical || onHorizontal).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(box.x);
      expect(p.x).toBeLessThanOrEqual(box.x + box.w);
      expect(p.y).toBeGreaterThanOrEqual(box.y);
      expect(p.y).toBeLessThanOrEqual(box.y + box.h);
    }
  );

  it('hides the connector when an explicit box covers the hotspot', () => {
    render(
      <TooltipInteraction
        step={{ ...baseStep, xPct: 50, yPct: 50 }}
        containerWidth={800}
        containerHeight={400}
        target={target}
        box={{ x: 300, y: 150, w: 200, h: 90 }}
      />
    );
    expect(screen.queryByTestId('gl-callout-arrow')).toBeNull();
  });

  it('hides the connector when a pinned card covers the hotspot', () => {
    render(
      <TooltipInteraction
        step={{ ...baseStep, xPct: 50, yPct: 50 }}
        containerWidth={800}
        containerHeight={400}
        pinned={{ x: 400, y: 200 }}
      />
    );
    expect(screen.queryByTestId('gl-callout-arrow')).toBeNull();
  });

  it('renders the same paths calloutArrowPaths computes', () => {
    const box = { x: 40, y: 30, w: 200, h: 90 };
    render(
      <TooltipInteraction
        step={{ ...baseStep, xPct: 50, yPct: 50 }}
        containerWidth={800}
        containerHeight={400}
        target={target}
        box={box}
      />
    );
    const a = arrowBetween(box, target);
    const expected = calloutArrowPaths(a.from, a.to, a.normal);
    const svg = screen.getByTestId('gl-callout-arrow');
    const lines = svg.querySelectorAll('[data-gl-connector-line]');
    const heads = svg.querySelectorAll('[data-gl-connector-head]');
    expect(lines).toHaveLength(2);
    expect(heads).toHaveLength(2);
    lines.forEach((l) => expect(l.getAttribute('d')).toBe(expected?.d));
    heads.forEach((h) => expect(h.getAttribute('points')).toBe(expected?.head));
  });

  it('marks the connector and anchor with the step id', () => {
    render(
      <TooltipInteraction
        step={{ ...baseStep, xPct: 50, yPct: 20 }}
        containerWidth={800}
        containerHeight={400}
      />
    );
    expect(
      screen.getByTestId('gl-callout-arrow').getAttribute('data-gl-connector')
    ).toBe('s1');
    expect(document.querySelector('[data-gl-anchor="s1"]')).not.toBeNull();
  });

  it('routes an auto card from its rendered height, not the estimate', () => {
    const spy = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockReturnValue(200);
    try {
      render(
        <TooltipInteraction
          step={{ ...baseStep, xPct: 50, yPct: 20, tooltipPosition: 'above' }}
          containerWidth={800}
          containerHeight={400}
          target={{ x: 390, y: 300, w: 20, h: 20 }}
        />
      );
      const top = parseFloat(card().style.top);
      expect(lineStart().y).toBe(top + 200);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('calloutArrowPaths', () => {
  it('is null for a line shorter than 3px', () => {
    expect(calloutArrowPaths({ x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });
});
