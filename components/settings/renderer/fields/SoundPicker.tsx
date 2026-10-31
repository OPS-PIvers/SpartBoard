import React from 'react';
import { Play } from 'lucide-react';
import type { FieldProps } from '../FieldProps';
import type { SoundPickerField as SoundPickerFieldSchema } from '@/components/settings/schema/types';
import { handleRadioGroupKeyDown } from '@/components/common/radioGroupKeyNav';
import { resolveLabel } from '../resolveLabel';

// Radiogroup of sound options (TimeTool's 4-up grid) with an optional per-option preview button.
export const SoundPicker: React.FC<
  FieldProps<SoundPickerFieldSchema<string>>
> = ({ field, value, onChange, id, describedBy, labelId, disabled, ctx }) => {
  const options = field.options;
  const values = options.map((option) => option.value);
  const selectedIndex = values.indexOf(typeof value === 'string' ? value : '');
  const previewText = resolveLabel(ctx.t, ctx.widget.type, 'previewSound');

  return (
    <div
      id={id}
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      onKeyDown={(e) => {
        if (!(e.target as HTMLElement).matches('[role="radio"]')) return;
        handleRadioGroupKeyDown(e, values, onChange);
      }}
      className="grid grid-cols-2 gap-1.5"
    >
      {options.map((option, index) => {
        const label = resolveLabel(ctx.t, ctx.widget.type, option.label);
        const selected = value === option.value;
        const tabbable = selected || (selectedIndex < 0 && index === 0);
        return (
          <div
            key={option.value}
            className={`flex items-stretch rounded-lg border-2 overflow-hidden transition-colors ${
              selected
                ? 'border-brand-blue-primary bg-brand-blue-primary/10'
                : 'border-slate-200 bg-white'
            }`}
          >
            <button // no-tour-anchor: covered by the settings.field row anchor
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={tabbable ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`flex-1 min-w-0 truncate text-xs font-semibold px-2 py-1.5 text-left cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue-primary disabled:opacity-50 disabled:cursor-not-allowed ${
                selected ? 'text-brand-blue-dark' : 'text-slate-700'
              }`}
            >
              {label}
            </button>
            {field.preview && (
              <button // no-tour-anchor: covered by the settings.field row anchor
                type="button"
                aria-label={`${previewText} ${label}`}
                disabled={disabled}
                onClick={() => field.preview?.(option.value)}
                className="flex items-center justify-center px-2 border-l border-slate-200 text-slate-600 hover:text-brand-blue-primary hover:bg-blue-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play size={12} aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
