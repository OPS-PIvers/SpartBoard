import React, { useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { LunchMenuItem, WidgetData } from '@/types';
import { Modal } from '@/components/common/Modal';
import { IconButton } from '@/components/common/IconButton';
import { tourAttr } from '@/config/tourAnchors';

const PEEK_AUTO_DISMISS_MS = 4000;

interface PhotoPeekProps {
  widget: WidgetData;
  item: LunchMenuItem | null;
  onClose: () => void;
}

// Same behaviour as the legacy peek: 4 s auto-close, Esc and outside click close, focus held on Close.
export const PhotoPeek: React.FC<PhotoPeekProps> = ({
  widget,
  item,
  onClose,
}) => {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!item) return undefined;
    const timer = window.setTimeout(onClose, PEEK_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [item, onClose]);

  useEffect(() => {
    if (!item) return;
    const id = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [item]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      closeRef.current?.focus();
    },
    []
  );

  return (
    <Modal
      isOpen={!!item}
      onClose={onClose}
      variant="bare"
      maxWidth="max-w-[min(60vmin,560px)]"
      ariaLabel={item ? `Photo of ${item.name}` : undefined}
    >
      {/* Portaled outside the widget's container, so sizes use vmin, not cqmin. */}
      <div
        className="relative bg-white shadow-2xl overflow-hidden border border-slate-200 motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-200"
        style={{ borderRadius: 'min(28px, 3vmin)' }}
        onKeyDown={handleKeyDown}
      >
        <div
          className="absolute z-10"
          style={{ top: 'min(12px, 1.5vmin)', right: 'min(12px, 1.5vmin)' }}
        >
          <IconButton
            ref={closeRef}
            {...tourAttr('lunch-count.photo-close', widget.id, widget.type)}
            onClick={onClose}
            label="Close photo"
            variant="secondary"
            className="active:bg-slate-300"
            style={{ padding: 'min(8px, 1vmin)' }}
            icon={
              <X
                aria-hidden="true"
                style={{
                  width: 'min(20px, 2.5vmin)',
                  height: 'min(20px, 2.5vmin)',
                }}
              />
            }
          />
        </div>
        {item?.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            className="w-full bg-slate-100 object-contain"
            style={{ maxHeight: '60vmin' }}
          />
        ) : null}
        <div className="bg-white" style={{ padding: 'min(20px, 2.5vmin)' }}>
          <p
            className="font-bold text-slate-900 text-center leading-tight"
            style={{ fontSize: 'min(24px, 3vmin)' }}
          >
            {item?.name}
          </p>
        </div>
      </div>
    </Modal>
  );
};
