import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TextPopoverInteraction } from './TextPopoverInteraction';
import type { GuidedLearningPublicStep } from '@/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const step: GuidedLearningPublicStep = {
  id: 'p1',
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'text-popover',
  label: 'Title',
  text: 'Line one\n\nLine three',
};

const card = () =>
  document.querySelector('[data-gl-callout="p1"]') as HTMLElement;

describe('TextPopoverInteraction callout style', () => {
  it('keeps the dark card and auto width by default', () => {
    render(<TextPopoverInteraction step={step} onClose={() => undefined} />);
    expect(card().className).toContain('bg-slate-800/95');
    expect(card().style.width).toBe('');
    expect(card().style.getPropertyValue('--gl-callout-scale')).toBe('1');
  });

  it('sizes to the authored stage-% width', () => {
    render(
      <TextPopoverInteraction
        step={{ ...step, calloutWidthPct: 50, calloutScale: 1.5 }}
        onClose={() => undefined}
        containerWidth={600}
        containerHeight={400}
      />
    );
    expect(card().style.width).toBe('300px');
    expect(card().style.getPropertyValue('--gl-callout-scale')).toBe('1.5');
  });

  it('falls back to cqw when the stage size is unknown', () => {
    render(
      <TextPopoverInteraction
        step={{ ...step, calloutWidthPct: 30 }}
        onClose={() => undefined}
      />
    );
    expect(card().style.width).toBe('30cqw');
  });

  it('applies the accent tone', () => {
    render(
      <TextPopoverInteraction
        step={{ ...step, calloutTone: 'accent' }}
        onClose={() => undefined}
      />
    );
    expect(card().className).toContain('bg-[var(--spart-primary,#2d3f89)]');
    expect(screen.getByText(/Line one/).className).toContain('text-white');
  });
});

describe('TextPopoverInteraction explicit box', () => {
  const boxStep: GuidedLearningPublicStep = {
    id: 'p1',
    xPct: 50,
    yPct: 50,
    imageIndex: 0,
    interactionType: 'text-popover',
    label: 'Title',
    text: 'Body text',
    calloutWidthPct: 80,
  };
  const cardOf = (container: HTMLElement) =>
    container.querySelector('[data-gl-callout="p1"]') as HTMLElement;

  // Height grows 10px per body px, so a 100px box needs a 10px body: below the floor.
  const stubHeight = () =>
    vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockImplementation(function (this: HTMLElement) {
        const px = parseFloat(this.style.getPropertyValue('--gl-fit-body'));
        return Number.isFinite(px) ? px * 10 : 0;
      });

  it('renders at the box and fits the text', () => {
    const spy = stubHeight();
    const { container } = render(
      <TextPopoverInteraction
        step={boxStep}
        onClose={vi.fn()}
        containerWidth={800}
        containerHeight={600}
        box={{ x: 100, y: 50, w: 300, h: 200 }}
      />
    );
    const el = cardOf(container);
    expect(el.style.left).toBe('100px');
    expect(el.style.top).toBe('50px');
    expect(el.style.width).toBe('300px');
    expect(el.style.getPropertyValue('--gl-fit-body')).toBe('20px');
    expect(el.dataset.glCalloutOverflow).toBeUndefined();
    spy.mockRestore();
  });

  it('grows at the floor and outlines only when showFit is on', () => {
    const spy = stubHeight();
    const box = { x: 100, y: 50, w: 300, h: 100 };
    const { container, rerender } = render(
      <TextPopoverInteraction
        step={boxStep}
        onClose={vi.fn()}
        containerWidth={800}
        containerHeight={600}
        box={box}
      />
    );
    expect(cardOf(container).style.minHeight).toBe('120px');
    expect(cardOf(container).dataset.glCalloutOverflow).toBeUndefined();
    rerender(
      <TextPopoverInteraction
        step={boxStep}
        onClose={vi.fn()}
        containerWidth={800}
        containerHeight={600}
        box={box}
        showFit
      />
    );
    expect(cardOf(container).dataset.glCalloutOverflow).toBe('true');
    expect(cardOf(container).className).toContain('outline-amber-400');
    spy.mockRestore();
  });
});
