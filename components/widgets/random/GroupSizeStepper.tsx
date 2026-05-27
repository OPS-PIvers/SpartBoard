import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface GroupSizeStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  /** Short label rendered above the value (e.g. "HOME", "EXPERT", "SIZE"). */
  label?: string;
  /** Tooltip + accessible name for the whole control. */
  title: string;
}

export const GroupSizeStepper: React.FC<GroupSizeStepperProps> = ({
  value,
  onChange,
  min = 2,
  max = 20,
  label,
  title,
}) => {
  const { t } = useTranslation();
  const decrement = () => onChange(Math.max(min, value - 1));
  const increment = () => onChange(Math.min(max, value + 1));
  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <div
      role="group"
      aria-label={title}
      title={title}
      className="flex items-stretch bg-white/80 border border-slate-200 rounded-full overflow-hidden shadow-sm flex-shrink-0"
      style={{ height: 'clamp(40px, 9cqmin, 72px)' }}
    >
      <button
        type="button"
        onClick={decrement}
        disabled={atMin}
        className="flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        style={{
          width: 'clamp(28px, 7cqmin, 48px)',
        }}
        aria-label={t('widgets.random.stepperDecrease', {
          name: title,
          defaultValue: 'Decrease {{name}}',
        })}
      >
        <Minus
          style={{
            width: 'clamp(12px, 3.5cqmin, 22px)',
            height: 'clamp(12px, 3.5cqmin, 22px)',
          }}
        />
      </button>
      <div
        className="flex flex-col items-center justify-center"
        style={{
          paddingLeft: 'clamp(4px, 0.5cqmin, 8px)',
          paddingRight: 'clamp(4px, 0.5cqmin, 8px)',
          minWidth: 'clamp(28px, 6cqmin, 44px)',
        }}
      >
        {label && (
          <span
            className="uppercase tracking-wider text-slate-400 font-bold leading-none"
            style={{ fontSize: 'clamp(9px, 1.8cqmin, 12px)' }}
          >
            {label}
          </span>
        )}
        <span
          className="font-bold font-mono text-slate-700 tabular-nums leading-tight"
          style={{ fontSize: 'clamp(14px, 3.5cqmin, 22px)' }}
        >
          {value}
        </span>
      </div>
      <button
        type="button"
        onClick={increment}
        disabled={atMax}
        className="flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        style={{
          width: 'clamp(28px, 7cqmin, 48px)',
        }}
        aria-label={t('widgets.random.stepperIncrease', {
          name: title,
          defaultValue: 'Increase {{name}}',
        })}
      >
        <Plus
          style={{
            width: 'clamp(12px, 3.5cqmin, 22px)',
            height: 'clamp(12px, 3.5cqmin, 22px)',
          }}
        />
      </button>
    </div>
  );
};
