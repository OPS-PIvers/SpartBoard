import React, { useState } from 'react';

/**
 * Accepts the three CSS-valid hex forms an HTML color picker / Tailwind
 * palette may emit: 3-digit shortform, 6-digit standard, 8-digit alpha.
 * Matches the server-side `isHexColor` validator in
 * `utils/adminBuildingConfig.ts` so the panel and validator agree on what
 * counts as a valid persistable color.
 */
const isValidHex = (color?: string): boolean =>
  typeof color === 'string' &&
  /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color);

// Bare hex digits (3/6/8) without the leading '#', for the forgiving on-blur path.
const BARE_HEX_RE = /^([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Normalise a stored hex colour to the 6-digit lowercase form that the native
 * `<input type="color">` swatch requires. The text field and the server
 * validator also accept 3-digit (`#abc`) and 8-digit alpha (`#aabbccdd`) hex,
 * but the swatch silently renders those as black — so expand shortform and
 * drop the alpha byte before handing the value to the swatch. `fallback` is
 * always a valid 6-digit colour supplied by the panel.
 */
const toStandardHex = (color: string | undefined, fallback: string): string => {
  const hex = (color && isValidHex(color) ? color : fallback).replace('#', '');
  if (hex.length === 3) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase();
  }
  if (hex.length === 8) {
    return `#${hex.slice(0, 6)}`.toLowerCase();
  }
  return `#${hex}`.toLowerCase();
};

interface HexColorFieldProps {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  /** Swatch/placeholder shown when no valid value is set yet. */
  fallback: string;
  ariaLabel: string;
  /**
   * Optional id applied to the hex text input so a surrounding `<label htmlFor>`
   * can be programmatically associated with the control (WCAG 1.3.1). The
   * native colour swatch keeps its own `aria-label` for its accessible name.
   */
  id?: string;
  swatchClassName?: string;
  inputClassName?: string;
}

/**
 * Reusable admin colour control: a native colour swatch paired with a
 * debounced hex text input and a Clear button. The text input keeps the
 * user's keystrokes in local state and only commits the (validated,
 * non-empty) value on blur — without this, every character of "#334155"
 * would trigger a Firestore write AND persist intermediate invalid values
 * ("#3", "#33", …) that the downstream validator then has to paper over.
 * Cost-conscious for school-district Firestore budgets.
 *
 * Surrounding label/section styling is left to each ConfigurationPanel so
 * the control matches that panel's local visual language.
 */
export const HexColorField: React.FC<HexColorFieldProps> = ({
  value,
  onChange,
  fallback,
  ariaLabel,
  id,
  swatchClassName = 'w-10 h-8 rounded border border-slate-300 cursor-pointer p-0.5 bg-white shrink-0',
  inputClassName = 'flex-1 px-2 py-1.5 text-xs font-mono border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none',
}) => {
  const [draft, setDraft] = useState(value ?? '');
  // Resync when the committed value changes externally (e.g. the colour
  // picker writes a new value, or the admin switches buildings). Uses the
  // "adjust state during render" pattern with useState rather than
  // useEffect (extra commit) or useRef (react-hooks/refs lint).
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setDraft(value ?? '');
  }

  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={toStandardHex(value, fallback)}
        onChange={(e) => onChange(e.target.value)}
        className={swatchClassName}
        aria-label={ariaLabel}
      />
      <input
        id={id}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          let next = draft.trim();
          // Be forgiving: a bare hex string ("334155") gets its '#' prepended
          // rather than being rejected as invalid.
          if (next !== '' && !next.startsWith('#') && BARE_HEX_RE.test(next)) {
            next = `#${next}`;
          }
          // Empty → clear the field; valid hex → commit (and snap the draft to
          // the normalised value); invalid (e.g. `#banana`, `#12`) → revert to
          // the last committed value rather than persisting garbage downstream
          // consumers would have to defensively re-validate.
          if (next === '') {
            onChange(undefined);
          } else if (isValidHex(next)) {
            onChange(next);
            setDraft(next);
          } else {
            setDraft(value ?? '');
          }
        }}
        placeholder={fallback}
        className={inputClassName}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-xs text-slate-500 hover:text-red-500 font-semibold transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
};
