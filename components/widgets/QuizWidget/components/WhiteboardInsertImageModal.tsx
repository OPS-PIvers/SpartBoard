import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Loader2, X } from 'lucide-react';
import type { WhiteboardPlacedImage, WhiteboardStartingImage } from '@/types';
import { Modal } from '@/components/common/Modal';
import { tourTypeAttr } from '@/config/tourAnchors';
import { WHITEBOARD_STARTING_IMAGES_MAX } from '@/config/quizRecordingDefaults';
import { startingImageSrc } from '@/utils/whiteboard/startingPage';
import { defaultImagePlacement } from './whiteboardStartingPageEdit';

const imageFiles = (files: FileList | File[] | undefined | null) =>
  Array.from(files ?? []).filter((f) => f.type.startsWith('image/'));

export interface WhiteboardInsertImageModalProps {
  images: WhiteboardPlacedImage[];
  /** Uploads through the quiz-stimulus Drive path; null when cancelled. */
  onUploadImage: (file: File) => Promise<WhiteboardStartingImage | null>;
  onChange: (images: WhiteboardPlacedImage[]) => void;
  onClose: () => void;
}

/** Adds starting page images by file picker, Ctrl+V or drag and drop, and removes them. */
export const WhiteboardInsertImageModal: React.FC<
  WhiteboardInsertImageModalProps
> = ({ images, onUploadImage, onChange, onClose }) => {
  const { t } = useTranslation();
  const tk = (key: string, opts?: Record<string, unknown>) =>
    t(`quizMediaResponse.authoring.whiteboard.${key}`, opts);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const full = images.length >= WHITEBOARD_STARTING_IMAGES_MAX;

  const upload = async (files: File[]) => {
    if (files.length === 0 || uploading) return;
    setUploading(true);
    let next = images;
    try {
      for (const file of files) {
        if (next.length >= WHITEBOARD_STARTING_IMAGES_MAX) break;
        const uploaded = await onUploadImage(file);
        if (!uploaded) continue;
        next = [...next, defaultImagePlacement(uploaded, next.length)];
        onChange(next);
      }
    } finally {
      setUploading(false);
    }
  };
  const onPastedFiles = useEffectEvent((files: File[]) => {
    void upload(files);
  });

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = imageFiles(e.clipboardData?.files);
      if (files.length === 0) return;
      e.preventDefault();
      onPastedFiles(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={tk('insertImage')}
      maxWidth="max-w-lg"
      zIndex="z-modal-deep"
    >
      <div className="space-y-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!full) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!full) void upload(imageFiles(e.dataTransfer.files));
          }}
          className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${
            dragging
              ? 'border-brand-blue-primary bg-brand-blue-lighter/30'
              : 'border-slate-300'
          }`}
        >
          {uploading ? (
            <Loader2
              className="h-8 w-8 animate-spin text-slate-500"
              aria-hidden
            />
          ) : (
            <ImagePlus className="h-8 w-8 text-slate-500" aria-hidden />
          )}
          <p className="text-sm text-slate-600">
            {full
              ? tk('imageLimit', { max: WHITEBOARD_STARTING_IMAGES_MAX })
              : tk('insertImageDrop')}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            // no-tour-anchor: hidden input opened by the Choose files button
            onChange={(e) => {
              void upload(imageFiles(e.target.files));
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={uploading || full}
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-brand-blue-primary hover:bg-slate-50 disabled:opacity-60"
            {...tourTypeAttr('quiz-editor.whiteboard-image-choose', 'quiz')}
          >
            {tk('chooseFiles')}
          </button>
        </div>

        {images.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {images.map((image, i) => (
              <li key={`${image.driveFileId}-${i}`} className="relative">
                <img
                  src={startingImageSrc(image)}
                  alt=""
                  className="h-12 w-16 rounded border border-slate-200 bg-white object-contain"
                />
                <button
                  type="button"
                  onClick={() => onChange(images.filter((_, j) => j !== i))}
                  aria-label={tk('removeImageNumber', { n: i + 1 })}
                  title={tk('removeImageNumber', { n: i + 1 })}
                  className="touch-target-expand absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm hover:text-slate-900"
                  {...tourTypeAttr(
                    'quiz-editor.whiteboard-image-remove',
                    'quiz'
                  )}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
};
