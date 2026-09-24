import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipInteraction } from './TooltipInteraction';
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
