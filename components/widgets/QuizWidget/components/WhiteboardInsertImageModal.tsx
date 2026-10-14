import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Loader2, X } from 'lucide-react';
import type { WhiteboardStartingImage } from '@/types';
import { Modal } from '@/components/common/Modal';
import { tourTypeAttr } from '@/config/tourAnchors';

const firstImage = (files: FileList | File[] | undefined | null) =>
  Array.from(files ?? []).find((f) => f.type.startsWith('image/'));

export interface WhiteboardInsertImageModalProps {
  image: WhiteboardStartingImage | undefined;
  /** Uploads through the quiz-stimulus Drive path; null when cancelled. */
  onUploadImage: (file: File) => Promise<WhiteboardStartingImage | null>;
  onInsert: (image: WhiteboardStartingImage) => void;
  onRemove: () => void;
  resolveImageUrl: (driveFileId: string) => string;
  onClose: () => void;
}

/** Adds the starting page image by file picker, Ctrl+V or drag and drop. */
export const WhiteboardInsertImageModal: React.FC<
  WhiteboardInsertImageModalProps
> = ({
  image,
  onUploadImage,
  onInsert,
  onRemove,
  resolveImageUrl,
  onClose,
}) => {
  const { t } = useTranslation();
  const tk = (key: string) =>
    t(`quizMediaResponse.authoring.whiteboard.${key}`);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file || uploading) return;
    setUploading(true);
    try {
      const next = await onUploadImage(file);
      if (next) {
        onInsert(next);
        onClose();
      }
    } finally {
      setUploading(false);
    }
  };
  const onPastedFile = useEffectEvent((file: File) => {
    void upload(file);
  });

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = firstImage(e.clipboardData?.files);
      if (!file) return;
      e.preventDefault();
      onPastedFile(file);
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
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void upload(firstImage(e.dataTransfer.files));
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
          <p className="text-sm text-slate-600">{tk('insertImageDrop')}</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            // no-tour-anchor: hidden input opened by the Choose file button
            onChange={(e) => {
              void upload(firstImage(e.target.files));
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-brand-blue-primary hover:bg-slate-50 disabled:opacity-60"
            {...tourTypeAttr('quiz-editor.whiteboard-image-choose', 'quiz')}
          >
            {tk('chooseFile')}
          </button>
        </div>

        {image && (
          <div className="flex items-center gap-3">
            <img
              src={resolveImageUrl(image.driveFileId)}
              alt=""
              className="h-12 w-16 rounded border border-slate-200 object-contain bg-white"
            />
            <button
              type="button"
              onClick={() => {
                onRemove();
                onClose();
              }}
              className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
              {...tourTypeAttr('quiz-editor.whiteboard-image-remove', 'quiz')}
            >
              <X className="h-4 w-4" aria-hidden />
              {tk('removeImage')}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};
