import React, { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface SettingsLabelProps {
  children: ReactNode;
  icon?: LucideIcon | React.ElementType;
  className?: string;
  htmlFor?: string;
}

export const SettingsLabel: React.FC<SettingsLabelProps> = ({
  children,
  icon: Icon,
  className = '',
  htmlFor,
}) => {
  const baseClasses =
    'text-xxs font-black text-slate-400 uppercase tracking-widest block mb-2';
  const layoutClasses = Icon ? 'flex items-center gap-2' : '';
  const combinedClasses = [baseClasses, layoutClasses, className]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </>
  );

  // Always render as a <label>: HTML allows label without `for=`, and the
  // element still provides implicit nesting-based association with any
  // contained input — a semantic that a <div> drops, silently
  // downgrading accessibility for screen-reader users. React strips
  // `htmlFor={undefined}` from the rendered DOM automatically, so the
  // bare prop pass works for both with-`for` and without-`for` callers.
  return (
    <label htmlFor={htmlFor} className={combinedClasses}>
      {content}
    </label>
  );
};
