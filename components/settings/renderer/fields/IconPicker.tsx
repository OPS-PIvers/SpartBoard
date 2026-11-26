import React, { useState } from 'react';
import type { FieldProps } from '../FieldProps';
import type { IconPickerField as IconPickerFieldSchema } from '@/components/settings/schema/types';
import { COMMON_INSTRUCTIONAL_ICONS } from '@/config/instructionalIcons';
import { renderCatalystIcon } from '@/components/widgets/Catalyst/catalystHelpers';
import { handleRadioGroupKeyDown } from '@/components/common/radioGroupKeyNav';
import { resolveLabel } from '../resolveLabel';
import { SearchField } from '@/components/common/SearchField';

// Search box + lucide icon grid (radiogroup), extracted from the Stations icon tab.
export const IconPicker: React.FC<
  FieldProps<IconPickerFieldSchema<string>>
> = ({ field, value, onChange, id, describedBy, labelId, disabled, ctx }) => {
  const [search, setSearch] = useState('');
  const icons = field.icons ?? COMMON_INSTRUCTIONAL_ICONS;
  const current = typeof value === 'string' ? value : '';
  const query = search.trim().toLowerCase();
  const filtered = query
    ? icons.filter((name) => name.toLowerCase().includes(query))
    : icons;
  const selectedIndex = filtered.indexOf(current);
  const t = (leaf: string) => resolveLabel(ctx.t, ctx.widget.type, leaf);

  return (
    <div
      id={id}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      className="flex flex-col gap-1.5"
    >
      <SearchField // no-tour-anchor: covered by the settings.field row anchor
        value={search}
        disabled={disabled}
        onChange={setSearch}
        placeholder={t('searchIcons')}
        size="sm"
      />
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={(e) => {
          if (!(e.target as HTMLElement).matches('[role="radio"]')) return;
          handleRadioGroupKeyDown(e, filtered, onChange);
        }}
        className="grid grid-cols-8 gap-1 max-h-44 overflow-y-auto custom-scrollbar p-1 bg-white border border-slate-200 rounded-lg"
      >
        {filtered.map((name, index) => {
          const selected = name === current;
          const tabbable = selected || (selectedIndex < 0 && index === 0);
          return (
            <button // no-tour-anchor: covered by the settings.field row anchor
              key={name}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={name}
              title={name}
              tabIndex={tabbable ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(name)}
              className={`flex items-center justify-center p-1.5 rounded-md transition-colors cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary disabled:opacity-50 disabled:cursor-not-allowed ${
                selected
                  ? 'bg-brand-blue-primary text-white shadow-xs'
                  : 'text-slate-600 hover:bg-blue-50 hover:text-brand-blue-primary'
              }`}
            >
              {renderCatalystIcon(name, 16)}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-8 text-center text-xxs text-slate-600 py-3">
            {t('noMatchingIcons')}
          </p>
        )}
      </div>
    </div>
  );
};
