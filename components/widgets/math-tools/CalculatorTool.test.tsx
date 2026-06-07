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

/**
 * Return the small expression preview line above the main display.
 * Uses the distinctive text-slate-500 + font-mono combination.
 */
function getExpression(container: HTMLElement): HTMLElement {
  return container.querySelector('.text-slate-500.font-mono') as HTMLElement;
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

  // -------------------------------------------------------------------
  // Expression preview sync
  //
  // The small expression line above the display must always reflect the
  // current operand value, including after +/−, %, and ⌫.  Before this
  // fix these operations updated only display, leaving expression stale.
  // -------------------------------------------------------------------
  describe('expression preview sync', () => {
    it('expression matches display after typing digits', () => {
      const { container } = render(<CalculatorTool />);
      clickBtn('4');
      clickBtn('2');
      expect(getExpression(container).textContent).toBe('42');
    });

    it('expression updates when sign is toggled', () => {
      const { container } = render(<CalculatorTool />);
      clickBtn('7');
      clickBtn('+/−');
      // Expression should reflect the negated value with Unicode minus
      expect(getExpression(container).textContent).toBe('−7');
    });

    it('expression reverts when sign is toggled back', () => {
      const { container } = render(<CalculatorTool />);
      clickBtn('7');
      clickBtn('+/−');
      clickBtn('+/−');
      expect(getExpression(container).textContent).toBe('7');
    });

    it('expression updates when percent is applied', () => {
      const { container } = render(<CalculatorTool />);
      clickBtn('5');
      clickBtn('0');
      clickBtn('%');
      expect(getExpression(container).textContent).toBe('0.5');
    });

    it('expression updates when backspace removes a digit', () => {
      const { container } = render(<CalculatorTool />);
      clickBtn('5');
      clickBtn('3');
      clickBtn('⌫');
      // display and expression should both be '5'
      expect(getDisplay(container).textContent).toBe('5');
      expect(getExpression(container).textContent).toBe('5');
    });

    it('expression shows correct second operand after an operator', () => {
      const { container } = render(<CalculatorTool />);
      clickBtn('3');
      clickBtn('+');
      clickBtn('4');
      // expression should be '3 + 4' at this point
      expect(getExpression(container).textContent).toBe('3 + 4');
    });

    it('expression correctly reflects negated second operand', () => {
      const { container } = render(<CalculatorTool />);
      clickBtn('3');
      clickBtn('+');
      clickBtn('4');
      clickBtn('+/−');
      // The second operand was toggled, expression tail should update
      expect(getExpression(container).textContent).toBe('3 + −4');
    });

    it('expression shows stale-free result history after equals', () => {
      const { container } = render(<CalculatorTool />);
      clickBtn('5');
      clickBtn('+/−');
      clickBtn('+');
      clickBtn('3');
      clickBtn('=');
      // fullExpr built from expression at press-equals time: '−5 + 3 ='
      expect(getExpression(container).textContent).toBe('−5 + 3 =');
    });

    // -------------------------------------------------------------------
    // Decimal entry — expression must mirror the display.
    //
    // Before the fix: pressDecimal simply appended '.' to `expression`
    // (`expression: prev.expression + '.'`).  When the display was "0"
    // (initial state), the expression became "." while the display was
    // "0." — they were out of sync.  Subsequent digit entry corrected the
    // expression on the next pressDigit call, but during the window when
    // the user had only typed "." the expression preview was wrong.
    //
    // After the fix: pressDecimal replaces the display-portion of the
    // expression with newDisplay (same strategy as pressDigit).
    // -------------------------------------------------------------------
    it('expression matches display immediately after pressing decimal on a fresh calculator', () => {
      const { container } = render(<CalculatorTool />);
      clickBtn('.');
      // display = '0.' → expression must also be '0.', not '.'
      expect(getDisplay(container).textContent).toBe('0.');
      expect(getExpression(container).textContent).toBe('0.');
    });

    it('expression matches display after typing a digit then pressing decimal', () => {
      const { container } = render(<CalculatorTool />);
      clickBtn('5');
      clickBtn('.');
      // display = '5.' → expression must also be '5.'
      expect(getDisplay(container).textContent).toBe('5.');
      expect(getExpression(container).textContent).toBe('5.');
    });

    it('expression stays in sync after decimal then more digits', () => {
      const { container } = render(<CalculatorTool />);
      clickBtn('.');
      clickBtn('7');
      // display = '0.7' → expression must be '0.7'
      expect(getDisplay(container).textContent).toBe('0.7');
      expect(getExpression(container).textContent).toBe('0.7');
    });

    it('expression stays in sync for second operand decimal entry', () => {
      const { container } = render(<CalculatorTool />);
      clickBtn('3');
      clickBtn('+');
      clickBtn('.');
      // After the operator, waitingForOperand = true; decimal should start '0.'
      // expression must be '3 + 0.' not '3 + .'
      expect(getDisplay(container).textContent).toBe('0.');
      expect(getExpression(container).textContent).toBe('3 + 0.');
    });
  });
});
