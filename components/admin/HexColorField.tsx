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

interface HexColorFieldProps {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  /** Swatch/placeholder shown when no valid value is set yet. */
  fallback: string;
  ariaLabel: string;
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
        value={isValidHex(value) ? value : fallback}
        onChange={(e) => onChange(e.target.value)}
        className={swatchClassName}
        aria-label={ariaLabel}
      />
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const trimmed = draft.trim();
          // Empty → clear the field; valid hex → commit; invalid
          // (e.g. `#banana`, `#12`) → revert to the last committed value
          // rather than persisting garbage downstream consumers would have
          // to defensively re-validate.
          if (trimmed === '') {
            onChange(undefined);
          } else if (isValidHex(trimmed)) {
            onChange(trimmed);
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
