import React from 'react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';

interface ChipSelectProps {
  /** What the chip shows; the select sits invisibly on top of it. */
  face: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  /** The `<option>` and `<optgroup>` rows. */
  children: React.ReactNode;
  ariaLabel: string;
  title?: string;
  disabled?: boolean;
  anchor?: TourAnchorAttrs;
  className?: string;
  style?: React.CSSProperties;
  selectRef?: React.Ref<HTMLSelectElement>;
  /** Extra data attributes for the select, such as a cell key. */
  dataAttrs?: Record<`data-${string}`, string>;
}

/** A custom-looking chip that opens the app's standard list through a native select. */
export const ChipSelect: React.FC<ChipSelectProps> = ({
  face,
  value,
  onChange,
  children,
  ariaLabel,
  title,
  disabled,
  anchor,
  className = '',
  style,
  selectRef,
  dataAttrs,
}) => (
  <span
    className={`relative has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-brand-blue-primary ${className}`}
    style={style}
    title={title}
  >
    {face}
    <select
      ref={selectRef}
      {...anchor}
      {...dataAttrs}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
    >
      {children}
    </select>
  </span>
);
