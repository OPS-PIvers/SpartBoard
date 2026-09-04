import React, { useId, useState } from 'react';
import { Palette, LucideIcon } from 'lucide-react';
import { SettingsLabel } from './SettingsLabel';
import { handleRadioGroupKeyDown } from './radioGroupKeyNav';
import type { ColorPreset } from '@/config/widgetAppearance';

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const BARE_HEX_RE = /^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Native color inputs only accept 6-digit lowercase hex; expand shortform and reject anything else.
const toInputHex = (color: string | undefined, fallback: string): string => {
  const hex = color && HEX_RE.test(color) ? color.slice(1) : fallback.slice(1);
  const full =
    hex.length === 3
      ? `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
      : hex;
  return `#${full}`.toLowerCase();
};

// Near-white swatches get a hairline border so they stay visible on the pale settings surface.
const isNearWhite = (hex: string): boolean => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 225;
};

type Option = { name: string; hex: string | undefined };

interface ColorPresetPickerProps {
  /** Group heading; also seeds the swatch and custom-input accessible names. */
  label: string;
  /** Noun used inside per-control aria-labels, e.g. "text color". Defaults to lower-cased `label`. */
  subject?: string;
  presets: readonly ColorPreset[];
  /** Current hex, or undefined when the caller's default/fallback applies. */
  value: string | undefined;
  /** Hex painted when `value` is undefined. */
  fallback: string;
  onChange: (hex: string) => void;
  /** When set, a dashed "default" swatch leads the row and clears the value. */
  onClear?: () => void;
  clearLabel?: string;
  icon?: LucideIcon | React.ElementType;
  /** Skip the SettingsLabel heading when the caller renders its own. */
  hideLabel?: boolean;
  labelId?: string;
}

export const ColorPresetPicker: React.FC<ColorPresetPickerProps> = ({
  label,
  subject,
  presets,
  value,
  fallback,
  onChange,
  onClear,
  clearLabel = 'Default',
  icon = Palette,
  hideLabel = false,
  labelId: labelIdProp,
}) => {
  const generatedId = useId();
  const labelId = labelIdProp ?? generatedId;
  const noun = subject ?? label.toLowerCase();
  const current = toInputHex(value, fallback);
  const isCleared = value === undefined;
  const [draft, setDraft] = useState(current);
  const [prevCurrent, setPrevCurrent] = useState(current);
  if (prevCurrent !== current) {
    setPrevCurrent(current);
    setDraft(current);
  }

  const options: Option[] = [
    ...(onClear ? [{ name: clearLabel, hex: undefined }] : []),
    ...presets,
  ];
  const isChecked = (o: Option) =>
    o.hex === undefined
      ? isCleared
      : !isCleared && toInputHex(o.hex, o.hex) === current;
  const hasChecked = options.some(isChecked);

  const select = (o: Option) => {
    if (o.hex === undefined) onClear?.();
    else onChange(o.hex);
  };

  const commitDraft = () => {
    let next = draft.trim();
    if (BARE_HEX_RE.test(next)) next = `#${next}`;
    if (HEX_RE.test(next)) {
      const normalized = toInputHex(next, fallback);
      if (normalized !== current) onChange(normalized);
      setDraft(normalized);
    } else {
      setDraft(current);
    }
  };

  return (
    <div>
      {!hideLabel && (
        <SettingsLabel icon={icon} as="span" id={labelId}>
          {label}
        </SettingsLabel>
      )}
      <div
        className="flex flex-wrap items-center gap-2"
        role="radiogroup"
        aria-labelledby={hideLabel ? undefined : labelId}
        aria-label={hideLabel ? label : undefined}
        onKeyDown={(e) => handleRadioGroupKeyDown(e, options, select)}
      >
        {options.map((o, idx) => {
          const checked = isChecked(o);
          const tabbable = checked || (!hasChecked && idx === 0);
          const isClear = o.hex === undefined;
          const isLight = !isClear && isNearWhite(toInputHex(o.hex, o.hex));
          return (
            <button
              key={o.name}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={tabbable ? 0 : -1}
              onClick={() => select(o)}
              title={o.name}
              aria-label={isClear ? o.name : `Select ${noun} ${o.name}`}
              className={`h-7 w-7 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-1 ${
                checked
                  ? 'ring-2 ring-brand-blue-primary ring-offset-2 ring-offset-slate-50'
                  : 'hover:scale-110'
              } ${
                isClear
                  ? 'border-2 border-dashed border-slate-400 bg-transparent'
                  : isLight
                    ? 'border border-slate-300'
                    : 'border border-transparent'
              }`}
              style={isClear ? undefined : { backgroundColor: o.hex }}
            />
          );
        })}
        <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden="true" />
        <label
          title="Custom color"
          className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-full border border-slate-300 focus-within:ring-2 focus-within:ring-brand-blue-primary focus-within:ring-offset-1"
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'conic-gradient(from 90deg, #f87171, #fbbf24, #4ade80, #38bdf8, #a78bfa, #f87171)',
            }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-[5px] rounded-full border border-white/70"
            style={{ backgroundColor: current }}
          />
          <input
            type="color"
            value={current}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={`Custom ${noun}`}
          />
        </label>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitDraft();
            }
          }}
          spellCheck={false}
          maxLength={7}
          className="h-7 w-[4.75rem] rounded-md border border-slate-200 bg-white px-2 font-mono text-xs text-slate-700 focus:border-brand-blue-primary focus:outline-none focus:ring-1 focus:ring-brand-blue-primary"
          aria-label={`${label} hex value`}
        />
      </div>
    </div>
  );
};
