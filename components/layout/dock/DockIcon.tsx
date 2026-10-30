import React from 'react';

interface DockIconProps {
  children?: React.ReactNode;
  className?: string;
  color?: string;
  badgeCount?: number;
  title?: string;
}

export const DockIcon: React.FC<DockIconProps> = ({
  children,
  className = '',
  color = 'bg-slate-400',
  badgeCount,
  title,
}) => {
  const finalClassName = [
    'relative w-10 h-10 md:w-12 md:h-12 rounded-2xl text-white shadow-lg transition-[transform,background-color] duration-200',
    color,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={finalClassName} title={title}>
      {children}
      {badgeCount !== undefined && badgeCount > 0 && (
        <div className="absolute -top-1 -right-1 bg-brand-red-primary text-white text-xxs font-bold w-4 h-4 flex items-center justify-center rounded-full border-2 border-white shadow-xs">
          {badgeCount}
        </div>
      )}
    </div>
  );
};
