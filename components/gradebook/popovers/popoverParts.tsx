import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type {
  ActiveFlag,
  GradebookFlagDef,
} from '@/utils/gradebook/gradebookCore';
import { flagSwatch } from './popoverFormat';

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary';

export const INPUT_CLASS =
  'h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] text-slate-800 focus:border-brand-blue-primary focus:outline-none focus:ring-[3px] focus:ring-brand-blue-primary/30';

/** A flag's one-letter mark, as the grid cell draws it; auto flags are outlined. */
export const FlagChip: React.FC<{ flag: GradebookFlagDef; auto?: boolean }> = ({
  flag,
  auto,
}) => {
  const sw = flagSwatch(flag.color);
  return (
    <span
      aria-hidden
      className={`inline-grid h-4 min-w-4 flex-none place-items-center rounded px-[3px] text-[9.5px] font-bold leading-none ${
        auto ? `bg-white ring-[1.5px] ring-inset ${sw.ring}` : sw.solid
      }`}
    >
      {flag.key}
    </span>
  );
};

type BtnTone = 'default' | 'primary' | 'danger';

export const Btn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: BtnTone;
    size?: 'md' | 'sm';
  }
> = ({ tone = 'default', size = 'md', className = '', ...rest }) => {
  const tones: Record<BtnTone, string> = {
    default: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    primary:
      'border-brand-blue-primary bg-brand-blue-primary text-white hover:bg-brand-blue-dark',
    danger:
      'border-brand-red-primary bg-brand-red-primary text-white hover:bg-brand-red-dark',
  };
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-semibold shadow-sm transition-colors disabled:pointer-events-none disabled:opacity-50 ${
        size === 'sm' ? 'h-[30px] px-3 text-xs' : 'h-[34px] px-3.5 text-[13px]'
      } ${tones[tone]} ${FOCUS} ${className}`}
    />
  );
};

export const IconBtn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }
> = ({ danger, className = '', ...rest }) => (
  <button
    type="button"
    {...rest}
    className={`inline-grid h-[30px] w-[30px] place-items-center rounded-md text-slate-500 transition-colors aria-pressed:bg-brand-blue-lighter aria-pressed:text-brand-blue-primary ${
      danger
        ? 'hover:bg-rose-50 hover:text-brand-red-primary'
        : 'hover:bg-slate-100 hover:text-slate-800'
    } ${FOCUS} ${className}`}
  />
);

export const LinkBtn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { warn?: boolean }
> = ({ warn, className = '', ...rest }) => (
  <button
    type="button"
    {...rest}
    className={`text-xs font-semibold hover:underline disabled:opacity-50 ${
      warn
        ? 'text-amber-700'
        : 'text-brand-blue-primary hover:text-brand-blue-dark'
    } ${FOCUS} ${className}`}
  />
);

/** Switch-style checkbox used for Share with student and Counts toward overall. */
export const Toggle: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  disabled?: boolean;
  small?: boolean;
}> = ({ checked, onChange, children, disabled, small }) => (
  <label
    className={`relative inline-flex cursor-pointer select-none items-center gap-2 text-slate-600 ${
      small ? 'text-xs' : 'text-[13px]'
    }`}
  >
    <input
      type="checkbox"
      className="peer absolute h-px w-px opacity-0"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span
      aria-hidden
      className="relative h-[18px] w-8 flex-none rounded-full bg-slate-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-3.5 after:w-3.5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-brand-blue-primary peer-checked:after:translate-x-3.5 peer-focus-visible:ring-[3px] peer-focus-visible:ring-brand-blue-primary/30"
    />
    {children}
  </label>
);

/** Flag checklist menu: check, chip, name, auto marker and the flag's key (D14, D15). */
export const FlagMenuList: React.FC<{
  flags: GradebookFlagDef[];
  active: ActiveFlag[];
  onToggle: (flagId: string) => void;
  disabled?: boolean;
}> = ({ flags, active, onToggle, disabled }) => (
  <div role="menu" className="flex flex-col">
    {flags.map((f) => {
      const on = active.find((a) => a.id === f.id);
      return (
        <button
          key={f.id}
          type="button"
          role="menuitemcheckbox"
          aria-checked={!!on}
          disabled={disabled}
          onClick={() => onToggle(f.id)}
          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none ${
            on ? 'font-semibold text-slate-900' : 'text-slate-700'
          }`}
        >
          <span className="grid h-4 w-4 flex-none place-items-center text-brand-blue-primary">
            {on && <Check size={16} aria-hidden />}
          </span>
          <FlagChip flag={f} auto={on?.auto} />
          <span className="flex-1">{f.name}</span>
          {on?.auto && <span className="text-[11px] text-slate-400">auto</span>}
          <kbd className="rounded border border-slate-200 px-[5px] font-sans text-[11px] leading-4 text-slate-400">
            {f.key}
          </kbd>
        </button>
      );
    })}
  </div>
);

/** Native select drawn like the prototype's: no OS arrow, a slate chevron at the right. */
export const Select: React.FC<
  React.SelectHTMLAttributes<HTMLSelectElement>
> = ({ className = '', ...rest }) => (
  <div className={`relative min-w-0 ${className}`}>
    <select
      {...rest}
      className={`${INPUT_CLASS} w-full appearance-none pr-8`}
    />
    <ChevronDown
      size={16}
      aria-hidden
      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
    />
  </div>
);
