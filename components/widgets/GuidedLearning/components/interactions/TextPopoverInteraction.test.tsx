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
