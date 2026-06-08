import React, { forwardRef } from 'react';

export type IconButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'brand-ghost'
  | 'danger'
  | 'brand-danger-ghost'
  | 'glass';

export type IconButtonSize = 'sm' | 'md' | 'lg' | 'xl';
export type IconButtonShape = 'circle' | 'square';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string; // Required for accessibility
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  shape?: IconButtonShape;
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      label,
      variant = 'ghost',
      size = 'md',
      shape = 'circle',
      active = false,
      className = '',
      type = 'button',
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'relative touch-target-expand flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed';

    const variantStyles: Record<IconButtonVariant, string> = {
      primary:
        'bg-brand-blue-primary text-white hover:bg-brand-blue-dark shadow-sm',
      secondary: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
      ghost: 'text-slate-400 hover:bg-slate-100 hover:text-slate-600',
      'brand-ghost':
        'text-brand-blue-primary bg-brand-blue-lighter/50 hover:bg-brand-blue-primary hover:text-white shadow-sm',
      danger: 'text-red-500 hover:bg-red-50 hover:text-red-600',
      'brand-danger-ghost':
        'text-brand-red-primary bg-brand-red-lighter/50 hover:bg-brand-red-primary hover:text-white shadow-sm',
      glass: 'text-slate-600 hover:bg-slate-800/10',
    };

    const activeStyles: Record<IconButtonVariant, string> = {
      primary:
        'ring-2 ring-white ring-offset-2 ring-offset-brand-blue-primary bg-brand-blue-dark text-white shadow-sm',
      secondary: 'bg-slate-200 text-slate-800',
      ghost: 'bg-slate-100 text-slate-800',
      'brand-ghost': 'bg-brand-blue-primary text-white shadow-md',
      danger: 'bg-red-50 text-red-700',
      'brand-danger-ghost': 'bg-brand-red-primary text-white shadow-md',
      glass: 'bg-slate-800/10 text-slate-800',
    };

    const sizeStyles: Record<IconButtonSize, string> = {
      sm: 'p-1.5',
      md: 'p-2',
      lg: 'p-3',
      xl: 'p-4',
    };

    const shapeStyles: Record<IconButtonShape, string> = {
      circle: 'rounded-full',
      square: 'rounded-lg',
    };

    const computedClass = `
      ${baseStyles}
      ${active ? activeStyles[variant] : variantStyles[variant]}
      ${sizeStyles[size]}
      ${shapeStyles[shape]}
      ${className}
    `;

    return (
      <button
        ref={ref}
        type={type}
        className={computedClass}
        aria-label={label}
        title={label}
        disabled={disabled}
        {...props}
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
