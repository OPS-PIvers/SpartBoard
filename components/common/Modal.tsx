import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  decrementOpenModalCount,
  incrementOpenModalCount,
  isTopModalLayer,
  popModalLayer,
  pushModalLayer,
} from './modalStore';
import { acquireBodyScrollLock, releaseBodyScrollLock } from './bodyScrollLock';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';
import { useBackdropDismiss } from '@/hooks/useBackdropDismiss';
import { ModalHeader } from './ModalHeader';
import {
  tourAttr,
  tourFieldAttr,
  type TourAnchorId,
} from '@/config/tourAnchors';

interface ModalProps {
  variant?: 'default' | 'bare';
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  /** Header colour for the default header (a widget's library accent); defaults to brand blue. */
  accent?: string;
  customHeader?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /**
   * Covers the whole panel — header, body and footer — e.g. a busy state. The
   * panel only becomes a positioning context when one is supplied, so no
   * existing modal's absolutely-placed children move.
   */
  overlay?: React.ReactNode;
  zIndex?: string; // e.g. "z-modal", "z-modal-deep"
  maxWidth?: string; // e.g. "max-w-md", "max-w-2xl"
  className?: string; // For additional styling on the content container
  contentClassName?: string; // For additional styling on the body/content wrapper
  footerClassName?: string; // Padding/layout for the footer wrapper; its tint and hairline are fixed
  captureEscape?: boolean; // Whether to use capture phase for Escape key
  ariaLabel?: string;
  ariaLabelledby?: string;
  /** Shows a "View full screen" toggle in the default header. */
  allowFullscreen?: boolean;
  /** Controlled full-screen state, for callers that render their own header toggle. */
  fullscreen?: boolean;
  onFullscreenChange?: (next: boolean) => void;
  /**
   * Anchor id for the header close button. Defaults to the shared `modal.close`
   * id — usually only one modal is open at a time, so a plain shared id is
   * fine; pass `tourScope` when two modals of the same kind can stack.
   */
  closeTourId?: TourAnchorId;
  /** Scopes `closeTourId` (e.g. the modal's title) when a bare shared id would be ambiguous. */
  tourScope?: string;
  /** False makes Escape and the backdrop do nothing, so only the dialog's own buttons close it. */
  dismissible?: boolean;
  /** Fills the screen with no gutter or corners below the md breakpoint. */
  fullBleedOnPhone?: boolean;
  /** `sheet` sits at the bottom edge on phones and centers from sm up. */
  placement?: 'center' | 'sheet';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  accent,
  customHeader,
  children,
  footer,
  overlay,
  zIndex = 'z-modal',
  maxWidth = 'max-w-md',
  className = '',
  contentClassName = footer ? 'px-6 pb-4' : 'px-6 pb-6',
  footerClassName = 'px-6 py-4',
  variant = 'default',
  captureEscape = false,
  ariaLabel,
  ariaLabelledby,
  allowFullscreen = false,
  fullscreen: fullscreenProp,
  onFullscreenChange,
  closeTourId = 'modal.close',
  tourScope,
  dismissible = true,
  fullBleedOnPhone = false,
  placement = 'center',
}) => {
  const [fullscreenState, setFullscreenState] = useState(false);
  const isFullscreen = fullscreenProp ?? (allowFullscreen && fullscreenState);
  const setFullscreen = onFullscreenChange ?? setFullscreenState;
  const showHeaderToggle = allowFullscreen && fullscreenProp === undefined;

  // Dismiss only when the press and the release both land on the backdrop, so
  // a select-drag out of the panel doesn't read as a backdrop click.
  const backdropProps = useBackdropDismiss(dismissible ? onClose : undefined);

  // Store onClose in a ref so the effect never needs to list it as a dep.
  // Callers almost always pass an inline arrow function (e.g.
  // `onClose={() => setOpen(false)}`), which creates a new reference on every
  // parent render. Having onClose in the deps array would fire the effect
  // cleanup + re-run on every such render, momentarily dropping the
  // openModalCount to 0, which releases the body scroll-lock even though the
  // modal is still open. Using a ref (same pattern as SettingsPanel.tsx) keeps
  // the Escape handler always up-to-date while leaving the effect stable.
  const onCloseRef = useRef(onClose);
  // Keep ref in sync with the latest onClose on every render.
  // Intentionally NOT in useEffect deps — see comment below.
  // eslint-disable-next-line react-hooks/refs -- intentional render-body ref sync to avoid stale-closure without re-subscribing the effect (CLAUDE.md pattern)
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  // eslint-disable-next-line react-hooks/refs -- same render-body ref sync as onCloseRef above
  dismissibleRef.current = dismissible;
  // Escape leaves full screen before it closes the modal.
  const exitFullscreenRef = useRef<(() => void) | null>(null);
  // eslint-disable-next-line react-hooks/refs -- same render-body ref sync as onCloseRef above
  exitFullscreenRef.current = isFullscreen ? () => setFullscreen(false) : null;

  useEffect(() => {
    if (!isOpen) return undefined;

    const layer = pushModalLayer();
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Only the topmost stacked modal reacts to Escape.
      if (!isTopModalLayer(layer)) return;
      // Guard first: if focus is inside a widget portal, let the portal's
      // own handler run (don't kill it with stopImmediatePropagation).
      if (isEscapeFromWidgetInput(e)) return;
      if (captureEscape) e.stopImmediatePropagation();
      if (exitFullscreenRef.current) {
        exitFullscreenRef.current();
        return;
      }
      if (!dismissibleRef.current) return;
      // Read from ref so we always call the current onClose even though
      // onClose is not in the effect deps array.
      onCloseRef.current();
    };

    acquireBodyScrollLock();
    incrementOpenModalCount();
    window.addEventListener(
      'keydown',
      handleEscape,
      captureEscape ? { capture: true } : undefined
    );

    return () => {
      popModalLayer(layer);
      decrementOpenModalCount();
      releaseBodyScrollLock();
      window.removeEventListener(
        'keydown',
        handleEscape,
        captureEscape ? { capture: true } : undefined
      );
    };
    // onClose is intentionally omitted from deps — it is read via onCloseRef so
    // a new inline arrow from the parent never triggers a cleanup + re-run that
    // would momentarily release the body scroll-lock. Only isOpen and
    // captureEscape need to re-subscribe the listener.
  }, [isOpen, captureEscape]);

  if (!isOpen) return null;

  // Ensure we are in a browser environment
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${zIndex} flex justify-center ${placement === 'sheet' ? 'items-end sm:items-center' : 'items-center'} ${isFullscreen ? 'p-0' : `${fullBleedOnPhone || placement === 'sheet' ? 'p-0' : 'p-4'} ${fullBleedOnPhone ? 'md:p-4' : placement === 'sheet' ? 'sm:p-4' : ''}`} bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200`}
      {...backdropProps}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? (!ariaLabelledby ? title : undefined)}
      aria-labelledby={ariaLabelledby}
    >
      <div
        className={`${overlay ? 'relative' : ''} w-full ${maxWidth} flex flex-col max-h-[90vh] ${variant === 'default' ? 'bg-white rounded-2xl shadow-2xl' : ''} ${className} ${isFullscreen ? 'h-full! max-h-none! max-w-none! rounded-none!' : ''} ${fullBleedOnPhone && !isFullscreen ? 'max-md:h-full! max-md:max-h-none! max-md:max-w-none! max-md:rounded-none!' : ''} ${placement === 'sheet' && !isFullscreen ? 'max-sm:rounded-b-none!' : ''} animate-in zoom-in-95 duration-200`}
        data-fullscreen={isFullscreen || undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {variant === 'default' &&
          (customHeader ?? (
            <ModalHeader
              title={title}
              accent={accent}
              square={isFullscreen}
              className="mb-4"
              fullscreen={isFullscreen}
              onFullscreenToggle={
                showHeaderToggle
                  ? () => setFullscreen(!isFullscreen)
                  : undefined
              }
              onClose={onClose}
              closeAttrs={
                tourScope
                  ? tourFieldAttr(closeTourId, tourScope, 'close')
                  : tourAttr(closeTourId)
              }
            />
          ))}

        <div
          className={`flex-1 overflow-y-auto custom-scrollbar ${variant === 'default' ? contentClassName : ''}`}
        >
          {children}
        </div>

        {footer && (
          <div
            data-modal-footer=""
            className={
              variant === 'default'
                ? `shrink-0 bg-slate-50 border-t border-slate-200 ${isFullscreen ? '' : 'rounded-b-2xl'} ${footerClassName}`
                : footerClassName
            }
          >
            {footer}
          </div>
        )}

        {overlay}
      </div>
    </div>,
    document.body
  );
};
