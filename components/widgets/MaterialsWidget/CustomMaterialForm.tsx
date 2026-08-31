import React, { useId, useMemo, useState } from 'react';
import { Check, Search, Trash2, X } from 'lucide-react';
import { MaterialDefinition } from '@/types';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import {
  MATERIAL_COLOR_OPTIONS,
  MATERIAL_ICON_OPTIONS,
  MAX_MATERIAL_LABEL_LENGTH,
  getAllLucideIconNames,
  getContrastingTextColor,
  resolveMaterialIcon,
} from './constants';

const ICON_RESULT_LIMIT = 60;

interface CustomMaterialFormProps {
  /** The material being edited, or undefined when creating a new one. */
  material?: MaterialDefinition;
  onSave: (draft: Omit<MaterialDefinition, 'id'>) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

export const CustomMaterialForm: React.FC<CustomMaterialFormProps> = ({
  material,
  onSave,
  onDelete,
  onCancel,
}) => {
  const labelInputId = useId();
  const iconSearchId = useId();
  const iconGroupId = useId();
  const colorGroupId = useId();

  const [label, setLabel] = useState(material?.label ?? '');
  const [icon, setIcon] = useState(material?.icon ?? MATERIAL_ICON_OPTIONS[0]);
  const [color, setColor] = useState(
    material?.color ?? MATERIAL_COLOR_OPTIONS[0]
  );
  const [iconQuery, setIconQuery] = useState('');

  // Curated icons first; the full Lucide set fills in behind them when searching.
  const iconResults = useMemo(() => {
    const query = iconQuery.trim().toLowerCase();
    if (!query) return [...MATERIAL_ICON_OPTIONS];

    const curated = MATERIAL_ICON_OPTIONS.filter((name) =>
      name.toLowerCase().includes(query)
    );
    const curatedSet = new Set<string>(curated);
    const fallback = getAllLucideIconNames().filter(
      (name) => !curatedSet.has(name) && name.toLowerCase().includes(query)
    );
    return [...curated, ...fallback].slice(0, ICON_RESULT_LIMIT);
  }, [iconQuery]);

  const trimmedLabel = label.trim();
  const canSave = trimmedLabel.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      label: trimmedLabel,
      icon,
      color,
      textColor: getContrastingTextColor(color),
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-4">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: color,
            color: getContrastingTextColor(color),
          }}
        >
          {React.createElement(resolveMaterialIcon(icon), {
            className: 'h-5 w-5',
          })}
        </div>
        <div className="min-w-0 flex-1">
          <SettingsLabel htmlFor={labelInputId} className="mb-1">
            {material ? 'Edit Material' : 'New Material'}
          </SettingsLabel>
          <input
            id={labelInputId}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={MAX_MATERIAL_LABEL_LENGTH}
            placeholder="Glue sticks"
            autoFocus
            className="w-full p-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
      </div>

      <div>
        <SettingsLabel htmlFor={iconSearchId}>Icon</SettingsLabel>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            id={iconSearchId}
            type="text"
            value={iconQuery}
            onChange={(e) => setIconQuery(e.target.value)}
            placeholder="Search icons..."
            className="w-full py-2 pl-9 pr-3 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <span id={iconGroupId} className="sr-only">
          Material icon
        </span>
        {iconResults.length === 0 ? (
          <p className="text-xxs text-slate-400 italic py-2">
            No icons match “{iconQuery.trim()}”.
          </p>
        ) : (
          <div
            className="grid grid-cols-7 gap-1.5 max-h-[140px] overflow-y-auto pr-1"
            role="group"
            aria-labelledby={iconGroupId}
          >
            {iconResults.map((iconName) => {
              const Icon = resolveMaterialIcon(iconName);
              const isActive = icon === iconName;
              return (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setIcon(iconName)}
                  aria-pressed={isActive}
                  title={iconName}
                  className={`flex items-center justify-center rounded-lg border p-2 transition-colors ${
                    isActive
                      ? 'border-blue-500 bg-blue-50 text-blue-600'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <SettingsLabel as="span" id={colorGroupId}>
          Color
        </SettingsLabel>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-labelledby={colorGroupId}
        >
          {MATERIAL_COLOR_OPTIONS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => setColor(swatch)}
              aria-pressed={color === swatch}
              title={swatch}
              className={`w-6 h-6 rounded-full border-2 transition-all ${
                color === swatch
                  ? 'border-slate-800 scale-125 shadow-md'
                  : 'border-transparent hover:scale-110'
              }`}
              style={{ backgroundColor: swatch }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <Check className="h-3.5 w-3.5" />
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${material?.label ?? 'material'}`}
            className="rounded-lg border border-red-200 bg-white p-2 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
