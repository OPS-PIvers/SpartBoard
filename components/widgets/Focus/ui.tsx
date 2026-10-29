import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { SIZES } from './uiSizes';

const VARIANTS = {
  primary:
    'bg-brand-blue-primary text-white hover:bg-brand-blue-light active:bg-brand-blue-dark disabled:bg-slate-300',
  secondary:
    'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 active:bg-slate-100 disabled:text-slate-400',
  ghost:
    'text-brand-blue-primary hover:bg-slate-100 active:bg-slate-200 disabled:text-slate-400',
  danger:
    'bg-white text-red-700 border border-red-300 hover:bg-red-50 active:bg-red-100 disabled:text-slate-400',
} as const;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  icon?: LucideIcon;
  /** Font size cap in px; the rest scales with the widget. */
  size?: 'sm' | 'md' | 'lg';
};

export const FocusButton: React.FC<ButtonProps> = ({
  variant = 'secondary',
  icon: Icon,
  size = 'md',
  className = '',
  style,
  children,
  type = 'button',
  ...rest
}) => {
  const s = SIZES[size];
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-lg font-semibold transition-colors disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${VARIANTS[variant]} ${className}`}
      style={{
        fontSize: s.font,
        padding: s.pad,
        minHeight: s.h,
        minWidth: s.h,
        gap: 'min(6px, 1.6cqmin)',
        ...style,
      }}
      {...rest}
    >
      {Icon && (
        <Icon
          aria-hidden="true"
          className="shrink-0"
          style={{ width: s.icon, height: s.icon }}
        />
      )}
      {children}
    </button>
  );
};

export const SectionLabel: React.FC<{
  children: React.ReactNode;
  htmlFor?: string;
  id?: string;
}> = ({ children, htmlFor, id }) => (
  <label
    id={id}
    htmlFor={htmlFor}
    className="block font-bold text-slate-600"
    style={{
      fontSize: 'min(15px, 4.6cqmin)',
      marginBottom: 'min(4px, 1.2cqmin)',
    }}
  >
    {children}
  </label>
);
