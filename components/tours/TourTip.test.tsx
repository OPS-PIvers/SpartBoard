import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TourTip } from './TourTip';

const rect = (x: number, y: number, w: number, h: number) =>
  ({
    x,
    y,
    width: w,
    height: h,
    left: x,
    top: y,
    right: x + w,
    bottom: y + h,
    toJSON: () => ({}),
  }) as DOMRect;

// The bar spans the phone's width just above where the tip sits.
let barBox = rect(6, 12, 378, 44);
let sparty = rect(0, 24, 64, 64);
let chip: Element | null = null;
const chipBox = rect(40, 60, 300, 40);

const renderTip = (props: Partial<React.ComponentProps<typeof TourTip>>) =>
  render(
    <>
      <div data-tour-bar="" data-testid="bar" />
      <TourTip
        boxRef={null}
        headingRef={null}
        left={16}
        top={80}
        width={300}
        tether={null}
        plain={false}
        animate={false}
        title="Open Boards"
        looking={false}
        status={null}
        sparty="think"
        {...props}
      />
    </>
  );

describe('TourTip Sparty', () => {
  beforeEach(() => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        if (this.hasAttribute('data-tour-bar')) return barBox;
        if (this === chip) return chipBox;
        if (this.getAttribute('data-perch') === 'left') return sparty;
        return rect(0, 0, 0, 0);
      }
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    barBox = rect(6, 12, 378, 44);
    sparty = rect(0, 24, 64, 64);
    chip?.remove();
    chip = null;
  });

  it('sits beside the title when, floating, he would cover the step bar', () => {
    renderTip({ clearOfChrome: true });
    expect(screen.getByTestId('tour-tip-sparty')).toHaveAttribute(
      'data-perch',
      'inline'
    );
  });

  it('sits beside the title when he would cover the waiting chip', () => {
    barBox = rect(0, 0, 0, 0);
    chip = document.createElement('div');
    chip.setAttribute('data-tour-waiting-chip', '');
    document.body.appendChild(chip);
    renderTip({ clearOfChrome: true });
    expect(screen.getByTestId('tour-tip-sparty')).toHaveAttribute(
      'data-perch',
      'inline'
    );
  });

  it('sits beside the title when he would leave the screen', () => {
    barBox = rect(0, 0, 0, 0);
    sparty = rect(-12, 24, 64, 64);
    renderTip({ clearOfChrome: true });
    expect(screen.getByTestId('tour-tip-sparty')).toHaveAttribute(
      'data-perch',
      'inline'
    );
  });

  it('keeps floating on the corner when the bar is clear of him', () => {
    barBox = rect(200, 760, 180, 44);
    renderTip({ clearOfChrome: true });
    expect(screen.getByTestId('tour-tip-sparty')).toHaveAttribute(
      'data-perch',
      'left'
    );
  });

  it('is unchanged without the rule, as with pacing off', () => {
    renderTip({});
    expect(screen.getByTestId('tour-tip-sparty')).toHaveAttribute(
      'data-perch',
      'left'
    );
  });
});
