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
  text: 'Click the menu button.',
};

// jsdom reports 0 for offsetWidth/Height, so the component falls back to its
// size estimates: width min(340, 50% of container), height max(76, 16%).
const card = () => screen.getByTestId('gl-tooltip-card');

describe('TooltipInteraction', () => {
  it('clamps a card anchored near the top-left corner inside the container', () => {
    render(
      <TooltipInteraction
        step={{ ...baseStep, tooltipPosition: 'right' }}
        containerWidth={800}
        containerHeight={400}
      />
    );
    // Unclamped top would be 24 - 38 = -14; clamped to the 12px edge padding.
    expect(card().style.top).toBe('12px');
    expect(card().style.left).toBe('32px');
  });

  it('keeps the card fully inside the container on the far edges', () => {
    render(
      <TooltipInteraction
        step={{ ...baseStep, xPct: 98, yPct: 96, tooltipPosition: 'below' }}
        containerWidth={800}
        containerHeight={400}
      />
    );
    expect(card().style.left).toBe(`${800 - 340 - 12}px`);
    expect(card().style.top).toBe(`${400 - 76 - 12}px`);
  });

  it('places the card outside a spotlight keep-out radius', () => {
    render(
      <TooltipInteraction
        step={{ ...baseStep, xPct: 50, yPct: 50, tooltipPosition: 'below' }}
        containerWidth={800}
        containerHeight={400}
        keepOutRadius={60}
      />
    );
    expect(card().style.top).toBe('272px');
  });

  it('auto placement prefers below when there is room', () => {
    render(
      <TooltipInteraction
        step={{ ...baseStep, xPct: 50, yPct: 20 }}
        containerWidth={800}
        containerHeight={400}
      />
    );
    expect(card().style.top).toBe(`${80 + 16}px`);
    expect(card().className).toContain('items-start');
  });
});
