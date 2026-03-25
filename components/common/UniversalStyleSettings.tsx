import React from 'react';
import { WidgetData } from '@/types';

interface UniversalStyleSettingsProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

const COLORS = [
  { label: 'Default', value: '' },
  { label: 'White', value: 'bg-white' },
  { label: 'Slate', value: 'bg-slate-50' },
  { label: 'Blue', value: 'bg-blue-50' },
  { label: 'Indigo', value: 'bg-indigo-50' },
  { label: 'Purple', value: 'bg-purple-50' },
  { label: 'Rose', value: 'bg-rose-50' },
  { label: 'Amber', value: 'bg-amber-50' },
  { label: 'Emerald', value: 'bg-emerald-50' },
];

const FONTS = [
  { label: 'Default', value: '' },
  { label: 'Sans', value: 'sans' },
  { label: 'Serif', value: 'serif' },
  { label: 'Mono', value: 'mono' },
  { label: 'Handwritten', value: 'handwritten' },
  { label: 'Comic', value: 'comic' },
];

const SIZES = [
  { label: 'Default', value: '' },
  { label: 'Small', value: 'sm' },
  { label: 'Medium', value: 'base' },
  { label: 'Large', value: 'lg' },
  { label: 'Extra Large', value: 'xl' },
  { label: '2XL', value: '2xl' },
];

export const UniversalStyleSettings: React.FC<UniversalStyleSettingsProps> = ({
  widget,
  updateWidget,
}) => {
  return (
    <div className="flex flex-col gap-4">
      {/* Background Color */}
      <div className="flex flex-col gap-2 bg-slate-50/80 px-4 py-3 rounded-xl border border-slate-100">
        <div className="flex items-center justify-between">
          <span className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
            Background Color
          </span>
          {widget.backgroundColor && (
            <button
              type="button"
              onClick={() =>
                updateWidget(widget.id, { backgroundColor: undefined })
              }
              className="text-xxs font-black text-indigo-600 hover:text-indigo-700 uppercase"
            >
              Reset
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((color) => {
            const isSelected = (widget.backgroundColor ?? '') === color.value;
            return (
              <button
                key={color.label}
                type="button"
                onClick={() => {
                  const nextBackgroundColor =
                    color.value === ''
                      ? undefined
                      : (color.value as WidgetData['backgroundColor']);
                  updateWidget(widget.id, {
                    backgroundColor: nextBackgroundColor,
                  });
                }}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  color.value ? color.value : 'bg-transparent border-dashed'
                } ${
                  isSelected
                    ? 'border-indigo-500 scale-110 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 hover:scale-105'
                }`}
                title={color.label}
                aria-label={`Select ${color.label} background color`}
                aria-pressed={isSelected}
              />
            );
          })}
        </div>
      </div>

      {/* Typography */}
      <div className="flex flex-col gap-2 bg-slate-50/80 px-4 py-3 rounded-xl border border-slate-100">
        <div className="flex items-center justify-between">
          <span className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
            Typography
          </span>
          {widget.fontFamily && (
            <button
              type="button"
              onClick={() => updateWidget(widget.id, { fontFamily: undefined })}
              className="text-xxs font-black text-indigo-600 hover:text-indigo-700 uppercase"
            >
              Reset
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FONTS.map((font) => {
            const isSelected = (widget.fontFamily ?? '') === font.value;
            return (
              <button
                key={font.label}
                type="button"
                onClick={() => {
                  const nextFontFamily =
                    font.value === ''
                      ? undefined
                      : (font.value as WidgetData['fontFamily']);
                  updateWidget(widget.id, {
                    fontFamily: nextFontFamily,
                  });
                }}
                className={`px-3 py-2 rounded-lg text-sm transition-all text-center ${
                  isSelected
                    ? 'bg-indigo-500 text-white font-bold shadow-md'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                } ${font.value ? `font-${font.value}` : ''}`}
                aria-pressed={isSelected}
              >
                {font.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Text Size */}
      <div className="flex flex-col gap-2 bg-slate-50/80 px-4 py-3 rounded-xl border border-slate-100">
        <div className="flex items-center justify-between">
          <span className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
            Default Text Size
          </span>
          {widget.baseTextSize && (
            <button
              type="button"
              onClick={() =>
                updateWidget(widget.id, { baseTextSize: undefined })
              }
              className="text-xxs font-black text-indigo-600 hover:text-indigo-700 uppercase"
            >
              Reset
            </button>
          )}
        </div>
        <select
          value={widget.baseTextSize ?? ''}
          onChange={(e) => {
            const nextBaseTextSize =
              e.target.value === ''
                ? undefined
                : (e.target.value as WidgetData['baseTextSize']);
            updateWidget(widget.id, {
              baseTextSize: nextBaseTextSize,
            });
          }}
          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          aria-label="Select default text size"
        >
          {SIZES.map((size) => (
            <option key={size.label} value={size.value}>
              {size.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
