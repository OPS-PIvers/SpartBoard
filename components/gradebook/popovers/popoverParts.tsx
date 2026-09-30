import React from 'react';
import type {
  ActiveFlag,
  GradebookFlagDef,
} from '@/utils/gradebook/gradebookCore';
import { flagSwatch } from './popoverFormat';

/** The one-letter mark a cell and a flag row share; auto flags draw as an outline. */
export const FlagKey: React.FC<{ flag: GradebookFlagDef; auto?: boolean }> = ({
  flag,
  auto,
}) => {
  const sw = flagSwatch(flag.color);
  return (
    <span
      aria-hidden
      className={`inline-grid h-5 min-w-5 place-items-center rounded px-1 text-[11px] font-bold ${
        auto ? `bg-white ring-[1.5px] ring-inset ${sw.ring}` : sw.solid
      }`}
    >
      {flag.key}
    </span>
  );
};

export const SectionLabel: React.FC<{
  children: React.ReactNode;
  htmlFor?: string;
}> = ({ children, htmlFor }) =>
  htmlFor ? (
    <label htmlFor={htmlFor} className="text-xs font-semibold text-slate-600">
      {children}
    </label>
  ) : (
    <span className="text-xs font-semibold text-slate-600">{children}</span>
  );

type BtnTone = 'default' | 'primary' | 'quiet';

export const PopButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: BtnTone }
> = ({ tone = 'default', className = '', ...rest }) => {
  const tones: Record<BtnTone, string> = {
    default:
      'border border-slate-300 bg-white px-3 text-slate-800 hover:bg-slate-50',
    primary: 'bg-brand-blue-primary px-3 text-white hover:bg-brand-blue-dark',
    quiet: 'text-brand-blue-primary hover:underline',
  };
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}
    />
  );
};

/** Inline confirm row for bulk actions: states the count, then Confirm / Cancel. */
export const ConfirmRow: React.FC<{
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  disabled?: boolean;
}> = ({ message, confirmLabel, onConfirm, onCancel, busy, disabled }) => (
  <div className="flex flex-col gap-2 rounded-lg bg-slate-100 p-3">
    <p className="text-sm text-slate-800">{message}</p>
    <div className="flex gap-2">
      <PopButton
        tone="primary"
        onClick={onConfirm}
        disabled={(busy ?? false) || disabled}
      >
        {confirmLabel}
      </PopButton>
      <PopButton onClick={onCancel} disabled={busy}>
        Cancel
      </PopButton>
    </div>
  </div>
);

/** Result of a bulk write with its one-step Undo (D24). */
export const DoneRow: React.FC<{
  message: string;
  onUndo: () => void;
  busy?: boolean;
}> = ({ message, onUndo, busy }) => (
  <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-100 px-3 py-2">
    <span className="text-sm text-slate-800" role="status">
      {message}
    </span>
    <PopButton tone="quiet" onClick={onUndo} disabled={busy}>
      Undo
    </PopButton>
  </div>
);

/** Flag checklist: one row per enabled flag, auto flags labelled (D14, D15). */
export const FlagChecklist: React.FC<{
  flags: GradebookFlagDef[];
  active: ActiveFlag[];
  onToggle: (flagId: string) => void;
  disabled?: boolean;
}> = ({ flags, active, onToggle, disabled }) => (
  <div className="grid grid-cols-2 gap-1" role="group" aria-label="Flags">
    {flags.map((f) => {
      const on = active.find((a) => a.id === f.id);
      return (
        <button
          key={f.id}
          type="button"
          role="checkbox"
          aria-checked={!!on}
          disabled={disabled}
          onClick={() => onToggle(f.id)}
          title={`${f.name} (${f.key})`}
          className={`flex min-h-9 items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue-primary disabled:opacity-50 ${
            on
              ? 'bg-slate-100 font-medium text-slate-900'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <FlagKey flag={f} auto={on?.auto} />
          <span className="truncate">{f.name}</span>
          {on?.auto && (
            <span className="ml-auto text-xs text-slate-500">Auto</span>
          )}
        </button>
      );
    })}
  </div>
);
