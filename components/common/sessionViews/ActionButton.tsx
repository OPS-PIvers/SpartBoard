import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface ActionButtonProps {
  variant: 'primary' | 'secondary' | 'danger';
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  /** Collapse to icon-only (tooltip shows the label). */
  labelHidden?: boolean;
}

const VARIANT: Record<ActionButtonProps['variant'], string> = {
  primary: 'bg-brand-blue-primary hover:bg-brand-blue-dark text-white',
  secondary:
    'bg-white/70 backdrop-blur-sm hover:bg-brand-blue-lighter/40 text-brand-blue-primary border border-brand-blue-primary/20',
  danger: 'bg-brand-red-primary hover:bg-brand-red-dark text-white',
};

/**
 * Action button matching the library header buttons. Primary/secondary mirror
 * LibraryShell; danger adds the brand-red destructive variant for End-session.
 */
export const ActionButton: React.FC<ActionButtonProps> = ({
  variant,
  label,
  icon: Icon,
  onClick,
  disabled = false,
  disabledReason,
  labelHidden = false,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={disabled ? disabledReason : labelHidden ? label : undefined}
    aria-label={label}
    className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT[variant]}`}
    style={{
      paddingInline: labelHidden ? '0' : 'min(14px, 3cqmin)',
      paddingBlock: 'min(8px, 1.8cqmin)',
      fontSize: 'min(14px, 4cqmin)',
      minWidth: labelHidden ? 'min(36px, 10cqmin)' : undefined,
      height: labelHidden ? 'min(36px, 10cqmin)' : undefined,
    }}
  >
    {Icon && (
      <Icon
        style={{ width: 'min(16px, 4.5cqmin)', height: 'min(16px, 4.5cqmin)' }}
        className="shrink-0"
      />
    )}
    {!labelHidden && <span className="truncate">{label}</span>}
  </button>
);
