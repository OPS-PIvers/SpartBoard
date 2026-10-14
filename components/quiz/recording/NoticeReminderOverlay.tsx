import React, { useEffect, useRef } from 'react';
import { RecordingConsentNotice } from './RecordingConsentNotice';

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** The reminder layers ABOVE the live recorder; capture never unmounts. */
export const NoticeReminderOverlay: React.FC<{
  onClose: () => void;
  light: boolean;
}> = ({ onClose, light }) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    const focusable = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
    focusable()[0]?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (!active || active === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!active || active === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener('keydown', onKeyDown);
    return () => node.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recording-notice-heading"
        className="max-h-full w-full max-w-lg overflow-y-auto"
      >
        <RecordingConsentNotice
          variant="reminder"
          light={light}
          onAcknowledge={onClose}
        />
      </div>
    </div>
  );
};
