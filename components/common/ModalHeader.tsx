import React from 'react';
import { X } from 'lucide-react';
import { FullscreenToggleButton } from './FullscreenToggleButton';
import type { TourAnchorAttrs } from '@/config/tourAnchors';

interface ModalHeaderProps {
  title?: React.ReactNode;
  titleId?: string;
  /** Small caps line above the title, e.g. "Assign". */
  eyebrow?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Header colour (a widget's library accent); defaults to brand blue. */
  accent?: string;
  /** Right-aligned controls before the full-screen toggle and close. */
  actions?: React.ReactNode;
  onClose?: () => void;
  closeAttrs?: TourAnchorAttrs;
  closeDisabled?: boolean;
  fullscreen?: boolean;
  onFullscreenToggle?: () => void;
  /** Square top corners, e.g. in full screen. */
  square?: boolean;
  className?: string;
}

/** The app's one modal header: a solid brand (or widget) colour bar with white text. */
export const ModalHeader: React.FC<ModalHeaderProps> = ({
  title,
  titleId,
  eyebrow,
  subtitle,
  accent,
  actions,
  onClose,
  closeAttrs,
  closeDisabled,
  fullscreen = false,
  onFullscreenToggle,
  square = false,
  className = '',
}) => (
  <div
    data-modal-header=""
    className={`flex items-center gap-3 px-6 py-3.5 shrink-0 text-white ${accent ? '' : 'bg-brand-blue-primary'} ${square ? '' : 'rounded-t-2xl'} ${className}`}
    style={accent ? { backgroundColor: accent } : undefined}
  >
    <div className="flex flex-col min-w-0 flex-1">
      {eyebrow && (
        <div className="text-xxs font-black uppercase tracking-widest text-white/75">
          {eyebrow}
        </div>
      )}
      {typeof title === 'string'
        ? title && (
            <h3
              id={titleId}
              className="font-black text-lg leading-snug text-white break-words"
            >
              {title}
            </h3>
          )
        : title}
      {subtitle !== undefined && subtitle !== null && subtitle !== '' && (
        <div className="text-xs mt-0.5 text-white/80">{subtitle}</div>
      )}
    </div>
    {actions && (
      <div className="flex items-center gap-2 shrink-0">{actions}</div>
    )}
    {onFullscreenToggle && (
      <FullscreenToggleButton
        fullscreen={fullscreen}
        onToggle={onFullscreenToggle}
        onAccent
      />
    )}
    {onClose && (
      <button
        type="button"
        onClick={onClose}
        disabled={closeDisabled}
        {...closeAttrs}
        className="p-1.5 rounded-full text-white/80 hover:bg-white/15 hover:text-white transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Close"
      >
        <X size={20} />
      </button>
    )}
  </div>
);
