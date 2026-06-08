import React, { useState, useCallback } from 'react';

type CalcOp = '+' | '−' | '×' | '÷' | null;

interface CalcState {
  display: string;
  expression: string;
  operand1: number | null;
  operator: CalcOp;
  waitingForOperand: boolean;
  hasError: boolean;
}

const initState = (): CalcState => ({
  display: '0',
  expression: '',
  operand1: null,
  operator: null,
  waitingForOperand: false,
  hasError: false,
});

export const CalculatorTool: React.FC = () => {
  const [calc, setCalc] = useState<CalcState>(initState());

  const pressDigit = useCallback((digit: string) => {
    setCalc((prev) => {
      if (prev.hasError)
        return { ...initState(), display: digit, expression: digit };
      if (prev.waitingForOperand) {
        return {
          ...prev,
          display: digit,
          expression: prev.expression + digit,
          waitingForOperand: false,
        };
      }
      const newDisplay =
        prev.display === '0'
          ? digit
          : prev.display.length < 12
            ? prev.display + digit
            : prev.display;
      return {
        ...prev,
        display: newDisplay,
        expression:
          prev.expression === ''
            ? digit
            : prev.expression.slice(0, -prev.display.length) + newDisplay,
      };
    });
  }, []);

  const pressDecimal = useCallback(() => {
    setCalc((prev) => {
      if (prev.hasError) return initState();
      if (prev.waitingForOperand) {
        return {
          ...prev,
          display: '0.',
          expression: prev.expression + '0.',
          waitingForOperand: false,
        };
      }
      if (prev.display.includes('.')) return prev;
      const newDisplay = prev.display + '.';
      return {
        ...prev,
        display: newDisplay,
        // Mirror the strategy used in pressDigit: replace the old display
        // portion at the tail of the expression with the new display value.
        // Without this, pressing '.' on the initial '0' produces expression
        // "." while display shows "0." — they diverge until the next digit.
        expression:
          prev.expression === ''
            ? newDisplay
            : prev.expression.slice(0, -prev.display.length) + newDisplay,
      };
    });
  }, []);

  const pressOperator = useCallback((op: CalcOp) => {
    setCalc((prev) => {
      if (prev.hasError || !op) return prev;
      const current = parseFloat(prev.display);
      if (prev.operand1 !== null && !prev.waitingForOperand) {
        // Chain calculation
        let result = current;
        if (prev.operator === '+') result = prev.operand1 + current;
        else if (prev.operator === '−') result = prev.operand1 - current;
        else if (prev.operator === '×') result = prev.operand1 * current;
        else if (prev.operator === '÷') {
          if (current === 0) {
            return {
              ...initState(),
              display: 'Error',
              hasError: true,
              expression: 'Error',
            };
          }
          result = prev.operand1 / current;
        }
        const displayResult = Number.isInteger(result)
          ? String(result)
          : result.toPrecision(10).replace(/\.?0+$/, '');
        return {
          display: displayResult,
          expression: displayResult + ' ' + op + ' ',
          operand1: result,
          operator: op,
          waitingForOperand: true,
          hasError: false,
        };
      }
      return {
        ...prev,
        expression: prev.display + ' ' + op + ' ',
        operand1: current,
        operator: op,
        waitingForOperand: true,
      };
    });
  }, []);

  const pressEquals = useCallback(() => {
    setCalc((prev) => {
      if (prev.hasError || prev.operand1 === null || prev.operator === null)
        return prev;
      const current = parseFloat(prev.display);
      let result = current;
      const fullExpr = prev.expression.trimEnd() + ' =';
      if (prev.operator === '+') result = prev.operand1 + current;
      else if (prev.operator === '−') result = prev.operand1 - current;
      else if (prev.operator === '×') result = prev.operand1 * current;
      else if (prev.operator === '÷') {
        if (current === 0) {
          return {
            ...initState(),
            display: 'Error',
            hasError: true,
            expression: fullExpr,
          };
        }
        result = prev.operand1 / current;
      }
      const displayResult = Number.isInteger(result)
        ? String(result)
        : parseFloat(result.toPrecision(10)).toString();
      return {
        display: displayResult,
        expression: fullExpr,
        operand1: null,
        operator: null,
        waitingForOperand: true,
        hasError: false,
      };
    });
  }, []);

  const pressClear = () => setCalc(initState());

  const pressToggleSign = useCallback(() => {
    setCalc((prev) => {
      if (prev.hasError || prev.display === '0') return prev;
      const toggled = prev.display.startsWith('-')
        ? prev.display.slice(1)
        : '-' + prev.display;
      const expression = prev.waitingForOperand
        ? prev.expression
        : prev.expression.slice(0, -prev.display.length) + toggled;
      return { ...prev, display: toggled, expression };
    });
  }, []);

  const pressPercent = useCallback(() => {
    setCalc((prev) => {
      if (prev.hasError) return prev;
      const val = parseFloat(prev.display) / 100;
      const displayResult = val.toString();
      const expression = prev.waitingForOperand
        ? prev.expression
        : prev.expression.slice(0, -prev.display.length) + displayResult;
      return { ...prev, display: displayResult, expression };
    });
  }, []);

  const pressBackspace = useCallback(() => {
    setCalc((prev) => {
      if (prev.hasError || prev.waitingForOperand) return prev;
      const newDisplay =
        prev.display.length > 1 ? prev.display.slice(0, -1) : '0';
      const expression =
        prev.expression.slice(0, -prev.display.length) + newDisplay;
      return { ...prev, display: newDisplay, expression };
    });
  }, []);

  const rows = [
    [
      {
        label: 'AC',
        action: pressClear,
        style: 'bg-slate-200 text-slate-800 hover:bg-slate-300',
      },
      {
        label: '+/−',
        action: pressToggleSign,
        style: 'bg-slate-200 text-slate-800 hover:bg-slate-300',
      },
      {
        label: '%',
        action: pressPercent,
        style: 'bg-slate-200 text-slate-800 hover:bg-slate-300',
      },
      {
        label: '÷',
        action: () => pressOperator('÷'),
        style: 'bg-amber-400 text-white hover:bg-amber-500',
      },
    ],
    [
      {
        label: '7',
        action: () => pressDigit('7'),
        style: 'bg-slate-700 text-white hover:bg-slate-600',
      },
      {
        label: '8',
        action: () => pressDigit('8'),
        style: 'bg-slate-700 text-white hover:bg-slate-600',
      },
      {
        label: '9',
        action: () => pressDigit('9'),
        style: 'bg-slate-700 text-white hover:bg-slate-600',
      },
      {
        label: '×',
        action: () => pressOperator('×'),
        style: 'bg-amber-400 text-white hover:bg-amber-500',
      },
    ],
    [
      {
        label: '4',
        action: () => pressDigit('4'),
        style: 'bg-slate-700 text-white hover:bg-slate-600',
      },
      {
        label: '5',
        action: () => pressDigit('5'),
        style: 'bg-slate-700 text-white hover:bg-slate-600',
      },
      {
        label: '6',
        action: () => pressDigit('6'),
        style: 'bg-slate-700 text-white hover:bg-slate-600',
      },
      {
        label: '−',
        action: () => pressOperator('−'),
        style: 'bg-amber-400 text-white hover:bg-amber-500',
      },
    ],
    [
      {
        label: '1',
        action: () => pressDigit('1'),
        style: 'bg-slate-700 text-white hover:bg-slate-600',
      },
      {
        label: '2',
        action: () => pressDigit('2'),
        style: 'bg-slate-700 text-white hover:bg-slate-600',
      },
      {
        label: '3',
        action: () => pressDigit('3'),
        style: 'bg-slate-700 text-white hover:bg-slate-600',
      },
      {
        label: '+',
        action: () => pressOperator('+'),
        style: 'bg-amber-400 text-white hover:bg-amber-500',
      },
    ],
    [
      {
        label: '⌫',
        action: pressBackspace,
        style: 'bg-slate-700 text-white hover:bg-slate-600',
      },
      {
        label: '0',
        action: () => pressDigit('0'),
        style: 'bg-slate-700 text-white hover:bg-slate-600',
      },
      {
        label: '.',
        action: pressDecimal,
        style: 'bg-slate-700 text-white hover:bg-slate-600',
      },
      {
        label: '=',
        action: pressEquals,
        style: 'bg-amber-400 text-white hover:bg-amber-500',
      },
    ],
  ];

  return (
    <div className="flex flex-col w-full h-full rounded-2xl overflow-hidden bg-slate-900/80 shadow-lg border border-slate-700">
      {/* Display */}
      <div
        className="bg-slate-900/80 shrink-0 flex flex-col justify-end"
        style={{
          padding: 'min(16px, 4cqh) min(16px, 4cqw)',
          minHeight: '25%',
        }}
      >
        <div
          className="text-slate-500 text-right font-mono truncate"
          style={{
            fontSize: 'min(14px, 3.5cqmin)',
            height: 'min(18px, 4cqmin)',
          }}
        >
          {calc.expression.replace(/-/g, '−')}
        </div>
        <div
          className={`text-right font-mono font-bold text-white truncate ${
            calc.hasError ? 'text-red-400' : ''
          }`}
          style={{
            fontSize:
              calc.display.length > 10
                ? 'min(32px, 8cqmin)'
                : 'min(48px, 12cqmin)',
            marginTop: 'min(4px, 1cqmin)',
            lineHeight: 1,
          }}
        >
          {calc.display.replace('-', '−')}
        </div>
      </div>

      {/* Buttons */}
      <div
        className="flex-1 min-h-0 grid grid-cols-4"
        style={{
          padding: 'min(12px, 3cqmin)',
          gap: 'min(8px, 2cqmin)',
          gridTemplateRows: 'repeat(5, 1fr)',
        }}
      >
        {rows.flat().map((btn, idx) => (
          <button
            key={idx}
            onClick={btn.action}
            className={`${btn.style} rounded-xl font-black transition-all active:scale-95 select-none flex items-center justify-center`}
            style={{
              fontSize: 'min(18px, 4.5cqmin)',
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
};
