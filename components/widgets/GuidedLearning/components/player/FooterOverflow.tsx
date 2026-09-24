import React, { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TouchHitBox } from './TouchHitBox';

interface Props {
  children: React.ReactNode;
}

/** Narrow footers: speed and read-aloud behind a "More" button. */
export const FooterOverflow: React.FC<Props> = ({ children }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // Outside presses close the panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('glPlayer.more')}
        title={t('glPlayer.more')}
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center rounded-full bg-white/10 border border-white/15 hover:bg-white/20 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
        style={{ width: 'min(36px, 5.5cqmin)', height: 'min(36px, 5.5cqmin)' }}
      >
        <TouchHitBox round />
        <MoreHorizontal
          aria-hidden="true"
          style={{ width: 'min(18px, 3cqmin)', height: 'min(18px, 3cqmin)' }}
        />
      </button>
      {open && (
        <div
          role="dialog"
          aria-labelledby={titleId}
          data-testid="gl-footer-overflow"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              buttonRef.current?.focus();
            }
          }}
          className="absolute bottom-full right-0 z-50 flex flex-col items-end rounded-xl border border-white/15 bg-slate-900/95 backdrop-blur-md shadow-2xl"
          style={{
            marginBottom: 'min(8px, 2cqmin)',
            padding: 'min(10px, 2.5cqmin)',
            gap: 'min(10px, 2.5cqmin)',
          }}
        >
          <span id={titleId} className="sr-only">
            {t('glPlayer.more')}
          </span>
          {children}
        </div>
      )}
    </div>
  );
};
