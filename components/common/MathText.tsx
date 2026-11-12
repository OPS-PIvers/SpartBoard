// Question text with its ⟦equations⟧ drawn and **bold**, *italic*, ++underline++ marks applied; plain text renders as-is.
import React, { useEffect, useState } from 'react';
import { hasPromptMath, splitPromptMath } from '@/utils/promptMath';
import {
  mayHavePromptFormat,
  parsePromptInline,
  type PromptFormatNode,
} from '@/utils/promptFormat';
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

const FORMAT_TAG = { b: 'strong', i: 'em', u: 'u' } as const;

export const MathText: React.FC<{
  text: string;
  /** Makes each equation a button, e.g. to edit it in the question editor. */
  onEquationClick?: (index: number) => void;
  equationLabel?: string;
  /** Equations drawn before this text, so click indexes count across lines. */
  equationOffset?: number;
}> = ({ text, onEquationClick, equationLabel, equationOffset = 0 }) => {
  const needed = hasPromptMath(text);
  const ml = useMathLive(needed);
  const formatted = mayHavePromptFormat(text);
  if (!needed && !formatted) return <>{text}</>;
  let mathCount = equationOffset;
  const renderRun = (run: string, key: string): React.ReactNode => {
    if (!hasPromptMath(run))
      return <React.Fragment key={key}>{run}</React.Fragment>;
    return (
      <React.Fragment key={key}>
        {splitPromptMath(run).map((part, i) => {
          if (part.kind === 'text') {
            return <React.Fragment key={i}>{part.text}</React.Fragment>;
          }
          const index = mathCount++;
          return (
            <Equation
              key={i}
              math={part.math}
              ml={ml}
              label={equationLabel}
              onClick={
                onEquationClick ? () => onEquationClick(index) : undefined
              }
            />
          );
        })}
      </React.Fragment>
    );
  };
  const renderNodes = (
    nodes: PromptFormatNode[],
    path: string
  ): React.ReactNode[] =>
    nodes.map((node, i) => {
      const key = `${path}.${i}`;
      if (typeof node === 'string') return renderRun(node, key);
      const Tag = FORMAT_TAG[node.tag];
      return <Tag key={key}>{renderNodes(node.children, key)}</Tag>;
    });
  if (!formatted) return <>{renderRun(text, 'r')}</>;
  return (
    <>
      {text.split('\n').map((line, i) => (
        <React.Fragment key={i}>
          {i > 0 && '\n'}
          {renderNodes(parsePromptInline(line), String(i))}
        </React.Fragment>
      ))}
    </>
  );
};
