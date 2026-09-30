import React from 'react';
import { useGradebook } from './GradebookContext';

/** Blurs a name or score while privacy is on (D23). */
export const Private: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => {
  const { privacy } = useGradebook();
  return (
    <span
      className={`${privacy ? 'blur-[6px] select-none' : ''} ${className}`}
      aria-hidden={privacy || undefined}
    >
      {children}
    </span>
  );
};
