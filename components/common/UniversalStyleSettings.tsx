import React, { useId } from 'react';
import { WidgetData } from '@/types';
import {
  FRAME_BACKGROUND_PRESETS,
  resolveWindowBackgroundHex,
} from '@/config/widgetAppearance';
import { ColorPresetPicker } from './ColorPresetPicker';

interface UniversalStyleSettingsProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

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

// Frame tint for the widget window; shown on every Style tab, even when a widget has custom appearance settings.
export const WidgetBackgroundSettings: React.FC<
  UniversalStyleSettingsProps
> = ({ widget, updateWidget }) => {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2 bg-slate-50/80 px-4 py-3 rounded-xl border border-slate-100">
      <span
        id={labelId}
        className="text-xxs font-bold text-slate-400 uppercase tracking-widest"
      >
        Background Color
      </span>
      <ColorPresetPicker
        hideLabel
        labelId={labelId}
        label="Background color"
        presets={FRAME_BACKGROUND_PRESETS}
        value={resolveWindowBackgroundHex(widget.backgroundColor)}
        fallback="#ffffff"
        onChange={(hex) => updateWidget(widget.id, { backgroundColor: hex })}
        onClear={() => updateWidget(widget.id, { backgroundColor: undefined })}
        clearLabel="Default"
      />
    </div>
  );
};

export const UniversalStyleSettings: React.FC<UniversalStyleSettingsProps> = ({
  widget,
  updateWidget,
}) => {
  return (
    <div className="flex flex-col gap-4">
      <WidgetBackgroundSettings widget={widget} updateWidget={updateWidget} />

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
              className="text-xxs font-black text-brand-blue-primary hover:text-brand-blue-dark uppercase"
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
                className={`px-3 py-2 rounded-lg text-sm transition-[color,background-color,border-color,box-shadow] text-center ${
                  isSelected
                    ? 'bg-brand-blue-primary text-white font-bold shadow-md'
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
              className="text-xxs font-black text-brand-blue-primary hover:text-brand-blue-dark uppercase"
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
          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary focus:border-brand-blue-primary"
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
