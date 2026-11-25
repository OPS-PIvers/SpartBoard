import React from 'react';
import { Search, X } from 'lucide-react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';

type SearchFieldSize = 'sm' | 'md' | 'scaled';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Defaults to the placeholder. */
  ariaLabel?: string;
  anchor?: TourAnchorAttrs;
  /** Tour anchor for the clear button, where a tour points at it. */
  clearAnchor?: TourAnchorAttrs;
  clearLabel?: string;
  /** sm for dense panels, md for dialogs, scaled for widget faces. */
  size?: SearchFieldSize;
  /** Layout classes for the wrapper, e.g. flex-1 or max-w-md. */
  className?: string;
  style?: React.CSSProperties;
  /** Extra classes for the input, e.g. a rounder corner. */
  inputClassName?: string;
  autoFocus?: boolean;
  id?: string;
  testId?: string;
  disabled?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

const BASE =
  'w-full border border-slate-200 bg-white font-medium text-slate-700 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/30 focus:border-brand-blue-primary/40 disabled:bg-slate-50 [&::-webkit-search-cancel-button]:appearance-none';

const SIZES: Record<
  Exclude<SearchFieldSize, 'scaled'>,
  { input: string; icon: string; left: string; clear: string }
> = {
  sm: {
    input: 'rounded-lg py-1.5 pl-8 pr-8 text-xs',
    icon: 'h-3.5 w-3.5',
    left: 'left-2.5',
    clear: 'right-1.5',
  },
  md: {
    input: 'rounded-xl py-2 pl-9 pr-9 text-sm',
    icon: 'h-4 w-4',
    left: 'left-3',
    clear: 'right-2',
  },
};

const SCALED_ICON: React.CSSProperties = {
  width: 'min(14px, 5.5cqmin)',
  height: 'min(14px, 5.5cqmin)',
};

/** The app's one search box: icon, clear button, and Escape clears before it closes anything. */
export const SearchField: React.FC<SearchFieldProps> = ({
  value,
  onChange,
  placeholder,
  ariaLabel,
  anchor,
  clearAnchor,
  clearLabel = 'Clear search',
  size = 'md',
  className = '',
  style,
  inputClassName = '',
  autoFocus,
  id,
  testId,
  disabled,
  inputRef,
  onKeyDown,
  onFocus,
  onBlur,
}) => {
  const scaled = size === 'scaled';
  const sz = scaled ? null : SIZES[size];
  return (
    <div className={`relative ${className}`} style={style}>
      <Search
        aria-hidden
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ${sz ? `${sz.icon} ${sz.left}` : ''}`}
        style={
          scaled ? { ...SCALED_ICON, left: 'min(12px, 3cqmin)' } : undefined
        }
      />
      <input
        ref={inputRef}
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented || e.key !== 'Escape' || value === '') return;
          // A full box clears first, so the dialog or widget behind stays open.
          e.preventDefault();
          e.stopPropagation();
          onChange('');
        }}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        data-testid={testId}
        {...anchor}
        className={`${BASE} ${sz ? sz.input : 'rounded-xl shadow-xs'} ${inputClassName}`}
        style={
          scaled
            ? {
                paddingLeft: 'min(36px, 9cqmin)',
                paddingRight: 'min(32px, 8cqmin)',
                paddingBlock: 'min(6px, 1.5cqmin)',
                fontSize: 'min(14px, 5.5cqmin)',
              }
            : undefined
        }
      />
      {value && !disabled && (
        <button
          // no-tour-anchor: clear control inside the anchored search box
          type="button"
          {...clearAnchor}
          onClick={() => onChange('')}
          aria-label={clearLabel}
          title={clearLabel}
          className={`absolute top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 ${sz ? sz.clear : ''}`}
          style={scaled ? { right: 'min(6px, 1.5cqmin)' } : undefined}
        >
          <X
            aria-hidden
            className={sz ? sz.icon : ''}
            style={scaled ? SCALED_ICON : undefined}
          />
        </button>
      )}
    </div>
  );
};
