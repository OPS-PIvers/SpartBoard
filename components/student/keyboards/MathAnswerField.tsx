// A MathLive equation box whose value is plain math text, e.g. "(x+1)/2".
import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { MathfieldElement } from 'mathlive';
import { tidyAsciiMath } from '@/utils/mathAnswer';
import type { TourAnchorAttrs } from '@/config/tourAnchors';
import { loadMathLive } from './loadMathLive';

export interface MathAnswerFieldProps {
  /** Plain math text; read once on mount (remount with a `key` to reload). */
  value: string;
  /** LaTeX to start from instead of `value`, when the caller kept it. */
  initialLatex?: string;
  onChange: (plain: string, latex: string) => void;
  onEnter?: () => void;
  disabled?: boolean;
  ariaLabel: string;
  autoFocus?: boolean;
  className?: string;
  /** Re-emits a typed-in value in the box's own spelling once loaded, so keys match student answers. */
  normalize?: boolean;
  /** Extra attributes for the outer box, e.g. a live-tour anchor. */
  anchor?: TourAnchorAttrs;
}

const MathAnswerField: React.FC<MathAnswerFieldProps> = ({
  value,
  initialLatex,
  onChange,
  onEnter,
  disabled = false,
  ariaLabel,
  autoFocus = false,
  className = '',
  normalize = false,
  anchor,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<MathfieldElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const emitChange = useEffectEvent((mf: MathfieldElement) => {
    const latex = mf.getValue('latex');
    onChange(tidyAsciiMath(mf.getValue('ascii-math')), latex);
  });
  const emitEnter = useEffectEvent(() => onEnter?.());
  // Mount-time seed only; later `value` changes come from this field itself.
  const seed = useEffectEvent(() => ({
    value,
    initialLatex,
    autoFocus,
    normalize,
  }));

  useEffect(() => {
    let cancelled = false;
    let mf: MathfieldElement | null = null;
    loadMathLive()
      .then((ml) => {
        const host = hostRef.current;
        if (cancelled || !host) return;
        const start = seed();
        mf = new ml.MathfieldElement();
        mf.mathVirtualKeyboardPolicy = 'auto';
        mf.style.width = '100%';
        mf.style.fontSize = '1.25rem';
        mf.style.background = 'transparent';
        mf.style.border = 'none';
        mf.style.outline = 'none';
        // Light colors on dark-mode devices, and no shading behind the fraction being typed.
        mf.style.setProperty(
          '--contains-highlight-background-color',
          'transparent'
        );
        mf.style.setProperty(
          '--selection-background-color',
          'hsl(212, 70%, 85%)'
        );
        mf.style.setProperty('--selection-color', '#000');
        mf.style.setProperty('--caret-color', 'hsl(212, 40%, 49%)');
        mf.style.setProperty('--smart-fence-color', 'currentColor');
        mf.value =
          start.initialLatex ?? ml.convertAsciiMathToLatex(start.value);
        const current = mf;
        current.addEventListener('input', () => emitChange(current));
        current.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            emitEnter();
          }
        });
        host.append(current);
        // Hide the formatting menu: its colors, fonts and text mode don't grade.
        current.menuItems = [];
        fieldRef.current = current;
        setReady(true);
        if (
          start.normalize &&
          start.value &&
          tidyAsciiMath(current.getValue('ascii-math')) !== start.value
        ) {
          emitChange(current);
        }
        if (start.autoFocus) current.focus();
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      mf?.remove();
      fieldRef.current = null;
    };
  }, []);

  useEffect(() => {
    const mf = fieldRef.current;
    if (!ready || !mf) return;
    mf.disabled = disabled;
    mf.setAttribute('aria-label', ariaLabel);
  }, [ready, disabled, ariaLabel]);

  return (
    <div
      {...anchor}
      className={`relative flex items-center min-h-[3.5rem] px-4 py-2 border-2 rounded-2xl ${
        disabled ? 'opacity-50' : ''
      } ${className}`}
    >
      <div ref={hostRef} className="flex-1 min-w-0" />
      {!ready && !failed && (
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      )}
      {failed && (
        <span className="text-sm text-red-600">
          The math keyboard did not load. Refresh the page to try again.
        </span>
      )}
    </div>
  );
};

export default MathAnswerField;
