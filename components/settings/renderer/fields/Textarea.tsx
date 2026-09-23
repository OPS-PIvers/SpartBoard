import React from 'react';
import type { FieldProps } from '../FieldProps';
import type { TextareaField as TextareaFieldSchema } from '@/components/settings/schema/types';
import { resolveLabel } from '../resolveLabel';

const BASE_CLASS =
  'w-full text-xs border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50';
const PROSE_CLASS = 'bg-white border-slate-200';
const CODE_CLASS =
  'font-mono bg-slate-900 border-slate-700 text-emerald-200 placeholder:text-slate-400';

export const TextareaField: React.FC<
  FieldProps<TextareaFieldSchema<string>>
> = ({
  field,
  value,
  onChange,
  id,
  describedBy,
  disabled,
  ctx,
  updateConfig,
}) => {
  const placeholder = field.placeholder
    ? resolveLabel(ctx.t, ctx.widget.type, field.placeholder)
    : undefined;

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!field.pasteToPatch || !updateConfig) return;
    const pasted = event.clipboardData.getData('text/plain');
    if (!pasted) return;
    const target = event.currentTarget;
    const patch = field.pasteToPatch({
      pasted,
      value: typeof value === 'string' ? value : '',
      selectionStart: target.selectionStart ?? 0,
      selectionEnd: target.selectionEnd ?? 0,
      ctx,
    });
    if (!patch) return;
    event.preventDefault();
    updateConfig(patch);
  };

  return (
    <textarea
      id={id}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      onPaste={handlePaste}
      placeholder={placeholder}
      maxLength={field.maxLength}
      rows={field.rows ?? 3}
      disabled={disabled}
      spellCheck={field.monospace ? false : undefined}
      aria-describedby={describedBy}
      className={`${BASE_CLASS} ${field.monospace ? CODE_CLASS : PROSE_CLASS}`}
    />
  );
};
