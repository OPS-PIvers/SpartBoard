import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CalculatorTool } from './CalculatorTool';

/**
 * Return the calculator's main numeric display element.
 * Digits like '0', '7', etc. appear in BOTH the display div and button labels,
 * so all assertions about current value should use this helper, not getByText.
 */
function getDisplay(container: HTMLElement): HTMLElement {
  // The display is the only .font-bold.font-mono div; buttons are <button> elements
  return container.querySelector('.font-bold.font-mono') as HTMLElement;
}

/** Click a calculator button by its accessible label. */
function clickBtn(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('CalculatorTool', () => {
  it('renders with initial display of 0', () => {
    const { container } = render(<CalculatorTool />);
    expect(getDisplay(container).textContent).toBe('0');
  });

  it('shows digits on successive button presses', () => {
    const { container } = render(<CalculatorTool />);
    clickBtn('5');
    clickBtn('3');
    expect(getDisplay(container).textContent).toBe('53');
  });

  it('evaluates basic addition', () => {
    const { container } = render(<CalculatorTool />);
    clickBtn('4');
    clickBtn('+');
    clickBtn('3');
    clickBtn('=');
    expect(getDisplay(container).textContent).toBe('7');
  });

  it('evaluates basic multiplication', () => {
    const { container } = render(<CalculatorTool />);
    clickBtn('6');
    clickBtn('×');
    clickBtn('7');
    clickBtn('=');
    expect(getDisplay(container).textContent).toBe('42');
  });

  it('shows Error on divide by zero', () => {
    const { container } = render(<CalculatorTool />);
    clickBtn('5');
    clickBtn('÷');
    clickBtn('0');
    clickBtn('=');
    expect(getDisplay(container).textContent).toBe('Error');
  });

  it('clears state after AC', () => {
    const { container } = render(<CalculatorTool />);
    clickBtn('9');
    clickBtn('AC');
    expect(getDisplay(container).textContent).toBe('0');
  });

  it('applies percent — divides display value by 100', () => {
    const { container } = render(<CalculatorTool />);
    clickBtn('5');
    clickBtn('%');
    expect(getDisplay(container).textContent).toBe('0.05');
  });

  // -------------------------------------------------------------------
  // Sign toggle — the core Copilot bug fix
  //
  // Before the fix: pressToggleSign stored Unicode '−' in display.
  //   parseFloat('−5') === NaN, so all arithmetic after a sign toggle
  //   silently produced wrong results or 'Error'.
  // After the fix: display stores ASCII '-'; UI renders it as '−'.
  // -------------------------------------------------------------------
  describe('+/− (sign toggle)', () => {
    it('renders Unicode minus glyph (−) in the display, not ASCII (-)', () => {
      const { container } = render(<CalculatorTool />);
      clickBtn('7');
      clickBtn('+/−');
      // Display must show Unicode '−7', not ASCII '-7'
      expect(getDisplay(container).textContent).toBe('−7');
    });

    it('removes the negative sign on second toggle', () => {
      const { container } = render(<CalculatorTool />);
      clickBtn('7');
      clickBtn('+/−');
      clickBtn('+/−');
      expect(getDisplay(container).textContent).toBe('7');
    });

    it('does not toggle the sign of 0', () => {
      const { container } = render(<CalculatorTool />);
      clickBtn('+/−');
      // Should stay '0', not become '−0'
      expect(getDisplay(container).textContent).toBe('0');
    });

    it('produces the correct numeric result after toggling — not NaN', () => {
      // Before fix: parseFloat('−5') was NaN → result would be NaN or Error
      const { container } = render(<CalculatorTool />);
      // −5 + 3 = −2
      clickBtn('5');
      clickBtn('+/−');
      clickBtn('+');
      clickBtn('3');
      clickBtn('=');
      expect(getDisplay(container).textContent).toBe('−2');
      expect(getDisplay(container).textContent).not.toContain('NaN');
    });

    it('does not show Error after toggling sign and multiplying', () => {
      // Before fix: 4 +/− × 3 would result in NaN or Error
      const { container } = render(<CalculatorTool />);
      // −4 × 3 = −12
      clickBtn('4');
      clickBtn('+/−');
      clickBtn('×');
      clickBtn('3');
      clickBtn('=');
      expect(getDisplay(container).textContent).toBe('−12');
    });

    it('chains multiple operations correctly after a sign toggle', () => {
      const { container } = render(<CalculatorTool />);
      // −2 × 5 = −10
      clickBtn('2');
      clickBtn('+/−');
      clickBtn('×');
      clickBtn('5');
      clickBtn('=');
      expect(getDisplay(container).textContent).toBe('−10');
    });

    it('division after toggling sign produces correct result', () => {
      const { container } = render(<CalculatorTool />);
      // −10 ÷ 2 = −5
      clickBtn('1');
      clickBtn('0');
      clickBtn('+/−');
      clickBtn('÷');
      clickBtn('2');
      clickBtn('=');
      expect(getDisplay(container).textContent).toBe('−5');
    });
  });
});
