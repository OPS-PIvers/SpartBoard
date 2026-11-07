// Question text with its ⟦equations⟧ drawn; text without equations renders as-is and loads nothing.
import React, { useEffect, useState } from 'react';
import { hasPromptMath, splitPromptMath } from '@/utils/promptMath';
import { loadMathLive } from '@/components/student/keyboards/loadMathLive';
import { sanitizeMathMarkup } from '@/components/student/keyboards/mathChips';

type MathLive = Awaited<ReturnType<typeof loadMathLive>>;

let loaded: MathLive | null = null;

function useMathLive(needed: boolean): MathLive | null {
  const [ml, setMl] = useState<MathLive | null>(loaded);
  useEffect(() => {
    if (!needed || ml) return;
    let cancelled = false;
    void loadMathLive()
      .then((lib) => {
        loaded = lib;
        if (!cancelled) setMl(lib);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [needed, ml]);
  return ml;
}

const Equation: React.FC<{
  math: string;
  ml: MathLive | null;
  onClick?: () => void;
  label?: string;
}> = ({ math, ml, onClick, label }) => {
  const drawn = ml
    ? sanitizeMathMarkup(
        ml.convertLatexToMarkup(ml.convertAsciiMathToLatex(math))
      )
    : null;
  const body = drawn ? (
    <span
      className="inline-block align-middle"
      // Sanitized MathLive markup: span, svg, path and line only.
      dangerouslySetInnerHTML={{ __html: drawn }}
    />
  ) : (
    <span>{math}</span>
  );
  if (!onClick) {
    return (
      <span role="math" aria-label={math} className="inline">
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? math}
      // no-tour-anchor: one per equation in the preview, tours point at the Equation link instead
      className="inline rounded px-0.5 hover:bg-brand-blue-primary/10 focus-visible:outline-2 focus-visible:outline-brand-blue-primary"
    >
      {body}
    </button>
  );
};

export const MathText: React.FC<{
  text: string;
  /** Makes each equation a button, e.g. to edit it in the question editor. */
  onEquationClick?: (index: number) => void;
  equationLabel?: string;
}> = ({ text, onEquationClick, equationLabel }) => {
  const needed = hasPromptMath(text);
  const ml = useMathLive(needed);
  if (!needed) return <>{text}</>;
  const parts = splitPromptMath(text);
  const mathIndex = parts.map(
    (_, i) => parts.slice(0, i).filter((p) => p.kind === 'math').length
  );
  return (
    <>
      {parts.map((part, i) =>
        part.kind === 'text' ? (
          <React.Fragment key={i}>{part.text}</React.Fragment>
        ) : (
          <Equation
            key={i}
            math={part.math}
            ml={ml}
            label={equationLabel}
            onClick={
              onEquationClick
                ? () => onEquationClick(mathIndex[i] ?? 0)
                : undefined
            }
          />
        )
      )}
    </>
  );
};
