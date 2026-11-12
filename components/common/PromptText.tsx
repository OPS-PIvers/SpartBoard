// A question prompt with its formatting: list lines get a hanging indent, the rest renders like MathText.
import React from 'react';
import { MathText } from '@/components/common/MathText';
import { hasPromptMath, splitPromptMath } from '@/utils/promptMath';
import { classifyPromptLine, hasPromptList } from '@/utils/promptFormat';

const countMath = (line: string) =>
  hasPromptMath(line)
    ? splitPromptMath(line).filter((p) => p.kind === 'math').length
    : 0;

export const PromptText: React.FC<{
  text: string;
  onEquationClick?: (index: number) => void;
  equationLabel?: string;
}> = ({ text, onEquationClick, equationLabel }) => {
  if (!hasPromptList(text)) {
    return (
      <MathText
        text={text}
        onEquationClick={onEquationClick}
        equationLabel={equationLabel}
      />
    );
  }
  const lines = text.split('\n');
  const offsets = lines.map((_, i) =>
    lines.slice(0, i).reduce((sum, l) => sum + countMath(l), 0)
  );
  return (
    <>
      {lines.map((raw, i) => {
        const line = classifyPromptLine(raw);
        const equationOffset = offsets[i] ?? 0;
        const body = (
          <MathText
            text={line.text}
            onEquationClick={onEquationClick}
            equationLabel={equationLabel}
            equationOffset={equationOffset}
          />
        );
        if (line.kind === 'text') {
          return (
            <span key={i} className="block">
              {line.text ? body : '\u00a0'}
            </span>
          );
        }
        return (
          <span key={i} className="flex gap-[0.4em] pl-[0.25em]">
            <span
              className="shrink-0 tabular-nums"
              aria-hidden={line.kind === 'bullet' || undefined}
            >
              {line.kind === 'bullet' ? '•' : `${line.n}.`}
            </span>
            <span className="min-w-0">{body}</span>
          </span>
        );
      })}
    </>
  );
};
