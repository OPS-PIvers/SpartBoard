import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';

interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/** Full-screen image viewer over a dimmed backdrop; Escape, backdrop click, or the X closes it. */
export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  src,
  alt,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      data-click-outside-ignore="true"
      className="fixed inset-0 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      style={{ zIndex: Z_INDEX.dialog }}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close image"
        className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X size={20} />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] max-w-[94vw] rounded-lg object-contain shadow-2xl"
      />
    </div>,
    document.body
  );
};
