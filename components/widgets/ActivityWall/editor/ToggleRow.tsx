import React, { useId } from 'react';
import type { tourAttr } from '@/config/tourAnchors';
import { Toggle } from '@/components/common/Toggle';

interface ToggleRowProps {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  /** Live-tour anchor attrs from `tourAttr`. */
  anchor?: ReturnType<typeof tourAttr>;
}

/** Shared on/off switch row for the wall editor; parents stack rows with `divide-y` hairlines. */
export const ToggleRow: React.FC<ToggleRowProps> = ({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
  anchor,
}) => {
  const switchId = useId();
  const hintId = useId();
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <label
          htmlFor={switchId}
          className="block cursor-pointer text-sm font-semibold text-slate-700"
        >
          {label}
        </label>
        {hint && (
          <span id={hintId} className="block text-xs text-slate-600">
            {hint}
          </span>
        )}
      </span>
      <Toggle
        id={switchId}
        anchor={anchor}
        size="sm"
        checked={checked}
        disabled={disabled}
        describedBy={hint ? hintId : undefined}
        onChange={onChange}
      />
    </div>
  );
};
