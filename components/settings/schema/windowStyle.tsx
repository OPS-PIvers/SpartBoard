import React, { useId } from 'react';
import type { GlobalStyle, WidgetData } from '@/types';
import { ColorPresetPicker } from '@/components/common/ColorPresetPicker';
import {
  WINDOW_BACKGROUND_PRESETS,
  resolveWindowBackgroundHex,
} from '@/config/widgetAppearance';
import { FontSelect } from '@/components/common/FontSelect';
import { StepSlider } from '@/components/common/StepSlider';
import type { AppearanceKey, TranslateFn } from './types';
import { contentTierOverrides } from './styleKeys';

// The four Window-tier labels the find-a-setting filter indexes; i18n leaves under `widgetSettings.common.*`, not schema fields.
export const WINDOW_STYLE_LABELS = [
  'style.windowBackground',
  'style.windowTransparency',
  'style.windowFont',
  'style.windowTextSize',
] as const;

type BaseTextSize = NonNullable<WidgetData['baseTextSize']>;

const WINDOW_TEXT_SIZES: ReadonlyArray<{ value: BaseTextSize; label: string }> =
  [
    { value: 'sm', label: 'Small' },
    { value: 'base', label: 'Medium' },
    { value: 'lg', label: 'Large' },
    { value: 'xl', label: 'X-Large' },
    { value: '2xl', label: '2X-Large' },
  ];

const cardClass =
  'flex flex-col gap-2 bg-slate-50/80 px-4 py-3 rounded-xl border border-slate-100';
const headingClass =
  'text-xxs font-bold text-slate-700 uppercase tracking-widest';
const resetClass =
  'text-xxs font-black text-brand-blue-primary hover:text-brand-blue-dark uppercase';

const CardHeader: React.FC<{
  id: string;
  title: string;
  onReset?: () => void;
  resetLabel: string;
  resetAriaLabel?: string;
  inheritedLabel: string;
}> = ({ id, title, onReset, resetLabel, resetAriaLabel, inheritedLabel }) => (
  <div className="flex items-center justify-between">
    <span id={id} className={headingClass}>
      {title}
    </span>
    {onReset ? (
      <button
        type="button"
        onClick={onReset}
        className={resetClass}
        aria-label={resetAriaLabel}
      >
        {resetLabel}
      </button>
    ) : (
      <span className="text-xxs text-slate-600">{inheritedLabel}</span>
    )}
  </div>
);

export type WindowStyleTierProps = {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
  globalStyle: GlobalStyle;
  t: TranslateFn;
  styleKeys?: ReadonlyArray<AppearanceKey>;
};

// Window tier (D18): frame background, window font and window text size, then transparency; font/size hide when the Content tier owns them.
export const WindowStyleTier: React.FC<WindowStyleTierProps> = ({
  widget,
  updateWidget,
  globalStyle,
  t,
  styleKeys,
}) => {
  const uid = useId();
  const overrides = contentTierOverrides(styleKeys);
  const transparency = widget.transparency ?? globalStyle.windowTransparency;
  const inherited = t('widgetSettings.common.style.boardDefault');
  const reset = t('widgetSettings.common.reset');

  return (
    <div className="flex flex-col gap-4" data-window-tier="">
      <div className={cardClass}>
        <CardHeader
          id={`${uid}-background`}
          title={t('widgetSettings.common.style.windowBackground')}
          resetLabel={reset}
          inheritedLabel={inherited}
          onReset={
            widget.backgroundColor
              ? () => updateWidget(widget.id, { backgroundColor: undefined })
              : undefined
          }
        />
        <ColorPresetPicker
          hideLabel
          labelId={`${uid}-background`}
          label={t('widgetSettings.common.style.windowBackground')}
          presets={WINDOW_BACKGROUND_PRESETS}
          value={resolveWindowBackgroundHex(widget.backgroundColor)}
          fallback="#ffffff"
          onChange={(hex) => updateWidget(widget.id, { backgroundColor: hex })}
          onClear={() =>
            updateWidget(widget.id, { backgroundColor: undefined })
          }
          clearLabel={inherited}
        />
      </div>

      {!overrides.font && (
        <div className={cardClass}>
          <CardHeader
            id={`${uid}-font`}
            title={t('widgetSettings.common.style.windowFont')}
            resetLabel={reset}
            inheritedLabel={inherited}
            onReset={
              widget.fontFamily
                ? () => updateWidget(widget.id, { fontFamily: undefined })
                : undefined
            }
          />
          <FontSelect
            labelId={`${uid}-font`}
            value={widget.fontFamily ? `font-${widget.fontFamily}` : 'global'}
            onChange={(fontId) =>
              updateWidget(widget.id, {
                fontFamily:
                  fontId === 'global'
                    ? undefined
                    : (fontId.replace(
                        /^font-/,
                        ''
                      ) as WidgetData['fontFamily']),
              })
            }
          />
        </div>
      )}

      {!overrides.textSize && (
        <div className={cardClass}>
          <CardHeader
            id={`${uid}-size`}
            title={t('widgetSettings.common.style.windowTextSize')}
            resetLabel={reset}
            inheritedLabel={inherited}
            onReset={
              widget.baseTextSize
                ? () => updateWidget(widget.id, { baseTextSize: undefined })
                : undefined
            }
          />
          <StepSlider
            labelId={`${uid}-size`}
            steps={WINDOW_TEXT_SIZES}
            value={widget.baseTextSize}
            unsetIndex={1}
            unsetLabel={inherited}
            onChange={(baseTextSize) =>
              updateWidget(widget.id, { baseTextSize })
            }
          />
        </div>
      )}

      <div className={cardClass}>
        <CardHeader
          id={`${uid}-transparency`}
          title={t('widgetSettings.common.style.windowTransparency')}
          resetLabel={reset}
          resetAriaLabel={t('widgetSettings.common.style.resetTransparency')}
          inheritedLabel={inherited}
          onReset={
            widget.transparency !== undefined
              ? () => updateWidget(widget.id, { transparency: undefined })
              : undefined
          }
        />
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={transparency}
            onChange={(e) =>
              updateWidget(widget.id, {
                transparency: parseFloat(e.target.value),
              })
            }
            className="flex-1 accent-brand-blue-primary h-1.5"
            aria-labelledby={`${uid}-transparency`}
            aria-valuetext={`${Math.round(transparency * 100)}%`}
          />
          <span className="text-xs font-mono font-bold text-slate-700 w-10 text-right">
            {Math.round(transparency * 100)}%
          </span>
        </div>
        {widget.backgroundColor && (
          <p className="text-xs text-slate-600 leading-snug">
            {t('widgetSettings.common.style.frameColorSolidHint')}
          </p>
        )}
      </div>
    </div>
  );
};
