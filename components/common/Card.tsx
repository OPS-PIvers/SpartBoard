import React, { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  rounded?: 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'none';
  hoverable?: boolean;
  shadow?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  padding = 'md',
  rounded = '2xl',
  hoverable = false,
  shadow = 'sm',
  ...props
}) => {
  const baseStyles = 'bg-white border border-slate-200';

  const shadowStyles = {
    none: 'shadow-none',
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
    xl: 'shadow-xl',
    '2xl': 'shadow-2xl',
  };

  const paddingStyles = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  const roundedStyles = {
    none: 'rounded-none',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    '3xl': 'rounded-3xl',
  };

  const computedClass = [
    baseStyles,
    paddingStyles[padding],
    shadowStyles[shadow],
    roundedStyles[rounded],
    hoverable && 'hover:shadow-md transition-all',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={computedClass} {...props}>
      {children}
    </div>
  );
};
