import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
} from 'lucide-react';

// Color palette for badges and role accents.
export type AccentColor =
  | 'emerald'
  | 'amber'
  | 'indigo'
  | 'violet'
  | 'rose'
  | 'sky'
  | 'cyan'
  | 'teal'
  | 'lime'
  | 'pink'
  | 'slate';

const ACCENT_BG: Record<AccentColor, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  teal: 'bg-teal-50 text-teal-700 ring-teal-200',
  lime: 'bg-lime-50 text-lime-700 ring-lime-200',
  pink: 'bg-pink-50 text-pink-700 ring-pink-200',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
};

const ACCENT_DOT: Record<AccentColor, string> = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  rose: 'bg-rose-500',
  sky: 'bg-sky-500',
  cyan: 'bg-cyan-500',
  teal: 'bg-teal-500',
  lime: 'bg-lime-500',
  pink: 'bg-pink-500',
  slate: 'bg-slate-400',
};

// Badge -------------------------------------------------------------

interface BadgeProps {
  color?: AccentColor;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  color = 'slate',
  dot,
  children,
  className = '',
}) => (
  <span
    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset ${ACCENT_BG[color]} ${className}`}
  >
    {dot && (
      <span
        className={`w-1.5 h-1.5 rounded-full ${ACCENT_DOT[color]}`}
        aria-hidden
      />
    )}
    {children}
  </span>
);

// StatusPill --------------------------------------------------------

export const StatusPill: React.FC<{
  status: 'active' | 'invited' | 'inactive' | 'verified' | 'pending' | 'trial';
}> = ({ status }) => {
  const map: Record<typeof status, { color: AccentColor; label: string }> = {
    active: { color: 'emerald', label: 'Active' },
    invited: { color: 'amber', label: 'Invited' },
    inactive: { color: 'slate', label: 'Inactive' },
    verified: { color: 'emerald', label: 'Verified' },
    pending: { color: 'amber', label: 'Pending' },
    trial: { color: 'amber', label: 'Trial' },
  };
  const { color, label } = map[status];
  return (
    <Badge color={color} dot>
      {label}
    </Badge>
  );
};

// ViewHeader --------------------------------------------------------

export const ViewHeader: React.FC<{
  title: string;
  blurb?: string;
  actions?: React.ReactNode;
}> = ({ title, blurb, actions }) => (
  <div className="flex items-start justify-between gap-4 mb-6">
    <div className="min-w-0">
      <h2 className="text-xl font-bold text-slate-900 leading-tight">
        {title}
      </h2>
      {blurb && (
        <p className="text-sm text-slate-500 mt-1 max-w-2xl">{blurb}</p>
      )}
    </div>
    {actions && (
      <div className="shrink-0 flex items-center gap-2">{actions}</div>
    )}
  </div>
);

// Button ------------------------------------------------------------

type BtnVariant =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'ghost'
  | 'danger'
  | 'dangerGhost';

const BTN_VARIANT: Record<BtnVariant, string> = {
  primary:
    'bg-brand-blue-primary hover:bg-brand-blue-dark active:translate-y-px text-white shadow-sm',
  secondary:
    'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 active:translate-y-px shadow-sm',
  tertiary:
    'bg-brand-blue-lighter text-brand-blue-dark hover:bg-indigo-100 active:translate-y-px',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100',
  danger:
    'bg-brand-red hover:bg-brand-red-dark text-white shadow-sm active:translate-y-px',
  dangerGhost:
    'bg-transparent text-brand-red hover:bg-rose-50 active:translate-y-px',
};

const BTN_SIZE: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-10 px-5 text-sm',
};

export const Btn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: BtnVariant;
    size?: 'sm' | 'md' | 'lg';
    icon?: React.ReactNode;
  }
> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className = '',
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30 disabled:opacity-50 disabled:pointer-events-none ${BTN_VARIANT[variant]} ${BTN_SIZE[size]} ${className}`}
    {...rest}
  >
    {icon}
    {children}
  </button>
);

// Card --------------------------------------------------------------

export const Card: React.FC<{
  children: React.ReactNode;
  className?: string;
  ruled?: boolean;
  ruledColor?: 'blue' | 'red';
}> = ({ children, className = '', ruled, ruledColor = 'blue' }) => (
  <div
    className={`relative bg-white rounded-xl border border-slate-200 shadow-[0_1px_2px_rgba(29,42,93,.06),0_1px_3px_rgba(29,42,93,.08)] ${
      ruled
        ? ruledColor === 'red'
          ? 'ring-1 ring-rose-200'
          : 'ring-1 ring-brand-blue-primary/20'
        : ''
    } ${className}`}
  >
    {ruled && (
      <div
        className={`absolute inset-x-0 top-0 h-1 rounded-t-xl ${
          ruledColor === 'red' ? 'bg-brand-red' : 'bg-brand-blue-primary'
        }`}
        aria-hidden
      />
    )}
    {children}
  </div>
);

// Field / Input -----------------------------------------------------

export const Field: React.FC<{
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ label, hint, error, required, htmlFor, children, className = '' }) => {
  const labelContent = (
    <>
      {label}
      {required && <span className="text-brand-red ml-0.5">*</span>}
    </>
  );
  return (
    <div className={`space-y-1.5 ${className}`}>
      {htmlFor ? (
        <label
          htmlFor={htmlFor}
          className="block text-xs font-semibold uppercase tracking-wide text-slate-700"
        >
          {labelContent}
        </label>
      ) : (
        <div className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
          {labelContent}
        </div>
      )}
      {children}
      {error ? (
        <p className="text-xs text-brand-red">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className = '',
  ...rest
}) => (
  <input
    className={`w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-blue-primary focus:ring-[3px] focus:ring-brand-blue-primary/30 disabled:bg-slate-50 disabled:text-slate-500 ${className}`}
    {...rest}
  />
);

export const Textarea: React.FC<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
> = ({ className = '', ...rest }) => (
  <textarea
    className={`w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-blue-primary focus:ring-[3px] focus:ring-brand-blue-primary/30 ${className}`}
    {...rest}
  />
);

export const Select: React.FC<
  React.SelectHTMLAttributes<HTMLSelectElement>
> = ({ className = '', children, ...rest }) => (
  <select
    className={`w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:border-brand-blue-primary focus:ring-[3px] focus:ring-brand-blue-primary/30 ${className}`}
    {...rest}
  >
    {children}
  </select>
);

// Toggle ------------------------------------------------------------

export const Toggle: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}> = ({ checked, onChange, disabled, ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30 ${
      checked ? 'bg-brand-blue-primary' : 'bg-slate-300'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    <span
      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-[18px]' : 'translate-x-0.5'
      } mt-0.5`}
    />
  </button>
);

// Checkbox ----------------------------------------------------------

export const Checkbox: React.FC<
  React.InputHTMLAttributes<HTMLInputElement>
> = ({ className = '', type: _type, ...rest }) => (
  <input
    {...rest}
    type="checkbox"
    className={`h-4 w-4 rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40 ${className}`}
  />
);

// Avatar ------------------------------------------------------------

const AVATAR_COLORS = [
  'bg-rose-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-sky-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-pink-500',
  'bg-teal-500',
];

export const Avatar: React.FC<{
  name: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ name, size = 'md' }) => {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  const s =
    size === 'sm'
      ? 'h-7 w-7 text-xs'
      : size === 'lg'
        ? 'h-10 w-10 text-sm'
        : 'h-8 w-8 text-xs';
  return (
    <div
      className={`${s} ${color} text-white rounded-full flex items-center justify-center font-semibold shrink-0 ring-2 ring-white`}
      aria-hidden
    >
      {initials}
    </div>
  );
};

// Segmented ---------------------------------------------------------

export const Segmented: <T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel?: string;
}) => React.ReactElement = ({ value, onChange, options, ariaLabel }) => (
  <div
    role="tablist"
    aria-label={ariaLabel}
    className="inline-flex p-1 bg-slate-100 rounded-lg"
  >
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        role="tab"
        aria-selected={value === opt.value}
        onClick={() => onChange(opt.value)}
        className={`h-8 px-3 rounded-md text-xs font-semibold transition-all ${
          value === opt.value
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

// RowMenu -----------------------------------------------------------

interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export const RowMenu: React.FC<{ items: MenuItem[]; label?: string }> = ({
  items,
  label = 'Row actions',
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="h-8 w-8 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden
          fill="currentColor"
        >
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-dropdown min-w-[200px] bg-white rounded-xl shadow-[0_10px_15px_-3px_rgba(29,42,93,.12),0_4px_6px_-4px_rgba(29,42,93,.08)] border border-slate-200 py-1"
        >
          {items.map((item, i) => (
            <button
              key={i}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                item.danger
                  ? 'text-brand-red hover:bg-rose-50'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// EmptyState --------------------------------------------------------

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  message?: string;
  cta?: React.ReactNode;
}> = ({ icon, title, message, cta }) => (
  <div className="border-2 border-dashed border-slate-200 rounded-xl p-10 flex flex-col items-center text-center">
    <div className="h-14 w-14 rounded-2xl bg-brand-blue-lighter text-brand-blue-dark flex items-center justify-center mb-4">
      {icon}
    </div>
    <h3 className="font-bold text-slate-900">{title}</h3>
    {message && (
      <p className="text-sm text-slate-500 mt-1 max-w-md">{message}</p>
    )}
    {cta && <div className="mt-4">{cta}</div>}
  </div>
);

// OrgLogoTile -------------------------------------------------------

export const OrgLogoTile: React.FC<{
  shortCode: string;
  seedColor: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ shortCode, seedColor, size = 'md' }) => {
  const cls =
    size === 'lg'
      ? 'h-12 w-12 text-sm rounded-xl'
      : size === 'sm'
        ? 'h-8 w-8 text-[10px] rounded-lg'
        : 'h-10 w-10 text-xs rounded-lg';
  return (
    <div
      className={`${cls} ${seedColor} text-white flex items-center justify-center font-bold shrink-0 shadow-sm`}
      aria-hidden
    >
      {shortCode}
    </div>
  );
};

// Cell Popover ------------------------------------------------------

// Rendered via a portal so it escapes any `overflow: hidden` ancestor (eg.
// scrollable tables, rounded cards). Positioning is computed from the
// anchor element's bounding rect. Callers pass `anchorRef` pointing at the
// trigger element (usually the button that toggles `open`).
export const CellPopover: React.FC<{
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  className?: string;
}> = ({ open, onClose, anchorRef, children, className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const measure = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Clamp within the viewport so triggers near the right/bottom edge don't
      // render the popover off-screen. Measure the popover's own rendered size
      // once it's mounted; fall back to the min-width (260) on the first pass.
      const margin = 8;
      const panelW = ref.current?.offsetWidth ?? 260;
      const panelH = ref.current?.offsetHeight ?? 0;
      const maxLeft = Math.max(margin, window.innerWidth - panelW - margin);
      const maxTop = Math.max(margin, window.innerHeight - panelH - margin);
      const left = Math.min(Math.max(margin, r.left), maxLeft);
      // If the panel would spill below the viewport, flip above the anchor.
      const wantTop = r.bottom + 4;
      const top =
        panelH > 0 && wantTop + panelH + margin > window.innerHeight
          ? Math.max(margin, r.top - panelH - 4)
          : Math.min(wantTop, maxTop);
      setPos({ top, left });
    };
    measure();
    // Re-measure once the panel has actually rendered and we know its size.
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    // Capture scrolls from any ancestor (tables, dialogs, etc.) by listening
    // in the capture phase.
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !pos || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top: pos.top, left: pos.left }}
      className={`z-popover min-w-[260px] bg-white rounded-xl shadow-[0_10px_15px_-3px_rgba(29,42,93,.12),0_4px_6px_-4px_rgba(29,42,93,.08)] border border-slate-200 p-1 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
};

export const PopoverOption: React.FC<{
  onClick: () => void;
  selected?: boolean;
  icon?: React.ReactNode;
  label: string;
  description?: string;
}> = ({ onClick, selected, icon, label, description }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full text-left px-3 py-2 flex items-start gap-2.5 rounded-lg hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
  >
    {icon && <span className="mt-0.5">{icon}</span>}
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-semibold text-slate-800">
        {label}
      </span>
      {description && (
        <span className="block text-xs text-slate-500 mt-0.5">
          {description}
        </span>
      )}
    </span>
    {selected && (
      <Check
        size={16}
        className="text-brand-blue-primary mt-1 shrink-0"
        aria-hidden
      />
    )}
  </button>
);

// Inline toast shim (bottom-center) ----------------------------------

export type OrgToastType = 'info' | 'success' | 'warn' | 'error';

export const OrgToast: React.FC<{
  message: string;
  type?: OrgToastType;
}> = ({ message, type = 'info' }) => {
  const styles: Record<OrgToastType, { bg: string; Icon: typeof Info }> = {
    info: { bg: 'bg-brand-blue-dark', Icon: Info },
    success: { bg: 'bg-emerald-600', Icon: CheckCircle2 },
    warn: { bg: 'bg-amber-600', Icon: AlertTriangle },
    error: { bg: 'bg-brand-red', Icon: AlertCircle },
  };
  const { bg, Icon } = styles[type];
  return (
    <div
      role="status"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-toast ${bg} text-white text-sm px-4 py-2.5 rounded-lg shadow-[0_10px_15px_-3px_rgba(29,42,93,.12),0_4px_6px_-4px_rgba(29,42,93,.08)] flex items-center gap-2 animate-in slide-in-from-bottom-2 fade-in duration-200`}
    >
      <Icon size={16} />
      {message}
    </div>
  );
};

// Confirm Modal -----------------------------------------------------

interface ConfirmProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  requireTyping?: string;
}

export const Confirm: React.FC<ConfirmProps> = (props) => {
  if (!props.isOpen) return null;
  return <ConfirmInner {...props} />;
};

const ConfirmInner: React.FC<ConfirmProps> = ({
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  destructive,
  requireTyping,
}) => {
  const [typed, setTyped] = useState('');
  const typingOk = !requireTyping || typed === requireTyping;
  return (
    <div
      className="fixed inset-0 z-modal-deep flex items-center justify-center p-4 bg-[rgba(29,42,93,0.45)] animate-in fade-in duration-150"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-white rounded-2xl shadow-[0_10px_15px_-3px_rgba(29,42,93,.12),0_4px_6px_-4px_rgba(29,42,93,.08)] w-full max-w-md animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <div className="mt-2 text-sm text-slate-600">{message}</div>
          {requireTyping && (
            <div className="mt-4">
              <Field label={`Type "${requireTyping}" to confirm`}>
                <Input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoFocus
                />
              </Field>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <Btn variant="ghost" onClick={onCancel}>
            Cancel
          </Btn>
          <Btn
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={!typingOk}
          >
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
};

// LocalModal (scoped within the Admin Settings panel, brand-blue scrim) --

export const LocalModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
}> = ({ isOpen, onClose, title, icon, children, footer, size = 'md' }) => {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  const widthClass =
    size === 'xl' ? 'max-w-4xl' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';
  return (
    <div
      className="fixed inset-0 z-modal-nested flex items-center justify-center p-4 bg-[rgba(29,42,93,0.45)] animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`bg-white rounded-2xl w-full ${widthClass} max-h-[92vh] flex flex-col shadow-[0_10px_15px_-3px_rgba(29,42,93,.12),0_4px_6px_-4px_rgba(29,42,93,.08)] animate-in zoom-in-95 duration-150`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
          {icon && (
            <div className="h-10 w-10 rounded-xl bg-brand-blue-lighter text-brand-blue-dark flex items-center justify-center shrink-0">
              {icon}
            </div>
          )}
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-100"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path
                d="M3 3l10 10M13 3L3 13"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
