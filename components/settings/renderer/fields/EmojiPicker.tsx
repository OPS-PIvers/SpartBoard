import React from 'react';
import type { FieldProps } from '../FieldProps';
import type { EmojiPickerField as EmojiPickerFieldSchema } from '@/components/settings/schema/types';
import { handleRadioGroupKeyDown } from '@/components/common/radioGroupKeyNav';
import { resolveLabel } from '../resolveLabel';
import {
  CURATED_EMOJI_GROUPS,
  firstGrapheme,
  type EmojiGroup,
} from './emojiCatalog';

export const EmojiPicker: React.FC<
  FieldProps<EmojiPickerFieldSchema<string>>
> = ({ field, value, onChange, id, describedBy, labelId, disabled, ctx }) => {
  const current = typeof value === 'string' ? value : '';
  const groups: ReadonlyArray<EmojiGroup> = field.emoji
    ? [{ leaf: '', emoji: field.emoji }]
    : CURATED_EMOJI_GROUPS;
  const all = groups.flatMap((group) => group.emoji);
  const selectedIndex = all.indexOf(current);
  const t = (leaf: string) => resolveLabel(ctx.t, ctx.widget.type, leaf);

  const renderButton = (emoji: string) => {
    const index = all.indexOf(emoji);
    const selected = emoji === current;
    const tabbable = selected || (selectedIndex < 0 && index === 0);
    return (
      <button
        key={emoji}
        type="button"
        role="radio"
        aria-checked={selected}
        tabIndex={tabbable ? 0 : -1}
        disabled={disabled}
        onClick={() => onChange(emoji)}
        className={`flex items-center justify-center text-lg leading-none p-1 rounded-md transition-colors cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary disabled:opacity-50 disabled:cursor-not-allowed ${
          selected
            ? 'bg-brand-blue-primary/15 ring-1 ring-brand-blue-primary'
            : 'hover:bg-slate-100'
        }`}
      >
        {emoji}
      </button>
    );
  };

  return (
    <div
      id={id}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      className="flex flex-col gap-1.5"
    >
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={(e) => {
          if (!(e.target as HTMLElement).matches('[role="radio"]')) return;
          handleRadioGroupKeyDown(e, all, onChange);
        }}
        className="flex flex-col gap-1.5 max-h-52 overflow-y-auto custom-scrollbar p-1.5 bg-white border border-slate-200 rounded-lg"
      >
        {groups.map((group, groupIndex) => (
          <div key={group.leaf || groupIndex} className="flex flex-col gap-1">
            {group.leaf && (
              <span className="text-xxs font-semibold uppercase tracking-wide text-slate-600">
                {t(group.leaf)}
              </span>
            )}
            <div className="grid grid-cols-8 gap-0.5">
              {group.emoji.map(renderButton)}
            </div>
          </div>
        ))}
      </div>
      <input
        type="text"
        value={current}
        disabled={disabled}
        onChange={(e) => onChange(firstGrapheme(e.target.value))}
        aria-label={t('emojiCustom')}
        placeholder={t('emojiCustom')}
        className="w-16 text-center text-base bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 placeholder:text-xxs placeholder:text-slate-600 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary disabled:opacity-50"
      />
    </div>
  );
};
