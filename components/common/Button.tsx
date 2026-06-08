import React, { ButtonHTMLAttributes } from 'react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger'
  | 'ghost-danger'
  | 'ghost'
  | 'hero'
  | 'dark';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';
export type ButtonShape = 'default' | 'pill' | 'square';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  shape = 'default',
  isLoading = false,
  className = '',
  children,
  icon,
  disabled,
  ...props
}) => {
  const baseStyles =
    'transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantStyles: Record<ButtonVariant, string> = {
    primary:
      'bg-brand-blue-primary text-white shadow-sm hover:bg-brand-blue-light',
    secondary: 'bg-slate-200 text-slate-600 hover:bg-slate-300',
    success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100',
    'ghost-danger': 'text-red-500 hover:bg-red-50 hover:text-red-600',
    ghost:
      'text-slate-600 hover:text-brand-blue-primary hover:bg-brand-blue-lighter',
    hero: 'bg-brand-blue-primary text-white shadow-lg shadow-brand-blue-primary/30 hover:bg-brand-blue-dark active:scale-95 hover:-translate-y-1',
    dark: 'bg-brand-gray-dark text-white shadow-sm hover:bg-brand-gray-darkest',
  };

  const sizeStyles: Record<ButtonSize, string> = {
    sm: 'px-3 py-1.5 text-xxs font-black uppercase tracking-widest',
    md: 'px-4 py-2 text-xxs font-black uppercase tracking-widest',
    lg: 'px-6 py-4 text-xs font-black uppercase tracking-widest',
    icon: 'p-2',
  };

  const shapeStyles: Record<ButtonShape, string> = {
    default: 'rounded-lg',
    pill: 'rounded-full',
    square: 'rounded-none',
  };

  const computedClass = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${shapeStyles[shape]} ${className}`;

  return (
    <button
      className={computedClass}
      disabled={(disabled ?? false) || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg
          className="animate-spin h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
};
