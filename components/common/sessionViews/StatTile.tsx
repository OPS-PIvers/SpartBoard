import React from 'react';

type StatTone = 'blue' | 'amber' | 'green' | 'violet';

const ICON_TONE: Record<StatTone, string> = {
  blue: 'text-brand-blue-primary',
  amber: 'text-amber-600',
  green: 'text-emerald-600',
  violet: 'text-violet-600',
};

interface StatTileProps {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  tone?: StatTone;
  /** Interactive tiles get hover affordance + optional selected ring. */
  interactive?: boolean;
  selected?: boolean;
  onClick?: () => void;
  /** Expandable content (e.g. a student-name list) shown below the value. */
  children?: React.ReactNode;
}

/**
 * KPI / overview stat tile on a glass surface matching the library card
 * language. Replaces the bespoke StatBox / InteractiveStatBox / StatTile copies
 * across the monitor and results views.
 */
export const StatTile: React.FC<StatTileProps> = ({
  icon,
  value,
  label,
  tone = 'blue',
  interactive = false,
  selected,
  onClick,
  children,
}) => {
  const surface =
    'bg-white/70 border border-slate-200/60 rounded-2xl backdrop-blur-sm shadow-sm transition-all';
  const interactiveClass = interactive
    ? `cursor-pointer hover:bg-white/85 hover:shadow-md ${
        selected ? 'ring-2 ring-brand-blue-primary/40' : ''
      }`
    : '';
  const inner = (
    <>
      <div
        className={`flex items-center justify-center ${ICON_TONE[tone]}`}
        style={{ gap: 'min(4px, 1cqmin)', marginBottom: 'min(4px, 1cqmin)' }}
      >
        {icon}
      </div>
      <div
        className={`font-black leading-none ${ICON_TONE[tone]}`}
        style={{ fontSize: 'min(22px, 7cqmin)' }}
      >
        {value}
      </div>
      <div
        className="font-bold uppercase tracking-wider text-slate-500"
        style={{
          fontSize: 'min(10px, 3cqmin)',
          marginTop: 'min(3px, 0.8cqmin)',
        }}
      >
        {label}
      </div>
      {children}
    </>
  );
  const style: React.CSSProperties = { padding: 'min(10px, 2.5cqmin)' };
  if (interactive) {
    return (
      <button
        type="button"
        data-testid="stat-tile"
        onClick={onClick}
        aria-pressed={selected}
        className={`block w-full text-center ${surface} ${interactiveClass}`}
        style={style}
      >
        {inner}
      </button>
    );
  }
  return (
    <div
      data-testid="stat-tile"
      className={`text-center ${surface}`}
      style={style}
    >
      {inner}
    </div>
  );
};
