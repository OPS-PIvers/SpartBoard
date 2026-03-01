import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Upload,
  Trash2,
  Loader2,
  Image as ImageIcon,
  Save,
} from 'lucide-react';
import { useStorage } from '@/hooks/useStorage';
import { useImageUpload } from '@/hooks/useImageUpload';
import { GlobalSticker, GradeLevel } from '@/types';
import { ALL_GRADE_LEVELS } from '@/config/widgetGradeLevels';

interface StickerLibraryModalProps {
  stickers: (string | GlobalSticker)[];
  onClose: () => void;
  onDiscard: (originalStickers: (string | GlobalSticker)[]) => void;
  onStickersChange: (stickers: (string | GlobalSticker)[]) => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
}

export const StickerLibraryModal: React.FC<StickerLibraryModalProps> = ({
  stickers,
  onClose,
  onDiscard,
  onStickersChange,
  onSave,
  isSaving,
  hasUnsavedChanges,
}) => {
  const { t } = useTranslation();
  const {
    uploadAdminSticker,
    deleteFile,
    uploading: storageUploading,
  } = useStorage();
  const { processAndUploadImage, uploading: processing } = useImageUpload({
    uploadFn: uploadAdminSticker,
  });
  const uploading = storageUploading || processing;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Normalize stickers to GlobalSticker objects
  const normalizedStickers = React.useMemo(() => {
    return stickers.map((s) => {
      if (typeof s === 'string') {
        return { url: s, gradeLevels: [...ALL_GRADE_LEVELS] } as GlobalSticker;
      }
      return {
        ...s,
        gradeLevels: s.gradeLevels ?? [...ALL_GRADE_LEVELS],
      } as GlobalSticker;
    });
  }, [stickers]);

  // Tracks URLs uploaded during this modal session that have not yet been
  // persisted to Firestore. Used to clean up orphaned Storage objects when
  // the user removes a freshly-uploaded sticker or discards the modal.
  const uploadedThisSessionRef = useRef<Set<string>>(new Set());
  // Snapshot of stickers as they were when the modal first opened (or after
  // a successful save), used to revert parent state on discard.
  const initialStickersRef = useRef<(string | GlobalSticker)[]>(stickers);

  // When a save completes successfully (isSaving: true → false and no longer
  // dirty), advance the baseline so a subsequent cancel can't delete already-
  // saved stickers.
  const prevIsSavingRef = useRef(isSaving);
  useEffect(() => {
    const wasSaving = prevIsSavingRef.current;
    prevIsSavingRef.current = isSaving;
    if (wasSaving && !isSaving && !hasUnsavedChanges) {
      // Save succeeded — update baseline
      initialStickersRef.current = stickers;
      uploadedThisSessionRef.current.clear();
    }
  }, [isSaving, hasUnsavedChanges, stickers]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter((f) =>
        f.type.startsWith('image/')
      );
      if (!fileArray.length) return;

      const newStickers: GlobalSticker[] = [];
      for (const file of fileArray) {
        try {
          const url = await processAndUploadImage(file);
          if (url) {
            uploadedThisSessionRef.current.add(url);
            newStickers.push({ url, gradeLevels: [...ALL_GRADE_LEVELS] });
          }
        } catch (e) {
          console.error('Failed to upload sticker:', e);
        }
      }
      if (newStickers.length > 0) {
        onStickersChange([...stickers, ...newStickers]);
      }
    },
    [stickers, onStickersChange, processAndUploadImage]
  );

  // Handle global paste events when this modal is mounted
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Don't intercept if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          // Found an image, prevent duplicate processing by Dock
          e.preventDefault();
          e.stopImmediatePropagation();

          const file = items[i].getAsFile();
          if (file) {
            // Create a pseudo-filename if it's from a screenshot
            const namedFile = new File(
              [file],
              `pasted-admin-sticker-${Date.now()}.png`,
              { type: file.type }
            );
            void handleFiles([namedFile]);
          }
        }
      }
    };

    // Use capture phase to ensure this runs before the global listener on window in Dock.tsx
    window.addEventListener('paste', handlePaste, true);
    return () => {
      window.removeEventListener('paste', handlePaste, true);
    };
  }, [handleFiles]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      void handleFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    void handleFiles(e.dataTransfer.files);
  };

  const removeSticker = (url: string) => {
    // If this sticker was uploaded in the current session it isn't in Firestore
    // yet, so it's safe to delete the Storage object immediately.
    if (uploadedThisSessionRef.current.has(url)) {
      uploadedThisSessionRef.current.delete(url);
      void deleteFile(url);
    }
    onStickersChange(
      stickers.filter((s) =>
        typeof s === 'string' ? s !== url : s.url !== url
      )
    );
  };

  const toggleGradeLevel = (stickerUrl: string, level: GradeLevel) => {
    const nextStickers = normalizedStickers.map((s) => {
      if (s.url === stickerUrl) {
        const currentLevels = s.gradeLevels ?? [];
        const nextLevels = currentLevels.includes(level)
          ? currentLevels.filter((l) => l !== level)
          : [...currentLevels, level];
        return { ...s, gradeLevels: nextLevels };
      }
      return s;
    });
    onStickersChange(nextStickers);
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (!window.confirm(t('admin.stickers.confirmDiscardChanges'))) {
        return;
      }
      // Delete Storage objects for stickers uploaded this session that were
      // never saved to Firestore (i.e. still in the current list but not in
      // the original baseline).
      for (const url of uploadedThisSessionRef.current) {
        void deleteFile(url);
      }
      uploadedThisSessionRef.current.clear();
      // Revert the parent's permission state to the pre-edit baseline so the
      // sticker card doesn't show phantom unsaved changes after close.
      onDiscard(initialStickersRef.current);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-modal-nested bg-black/50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="font-black text-sm uppercase tracking-widest text-slate-500">
            {t('admin.stickers.title')}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void onSave()}
              disabled={isSaving || !hasUnsavedChanges}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                hasUnsavedChanges
                  ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-sm'
                  : 'bg-brand-blue-primary hover:bg-brand-blue-dark text-white'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving
                ? t('common.saving')
                : hasUnsavedChanges
                  ? t('admin.stickers.saveChanges')
                  : t('common.saved')}
            </button>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 custom-scrollbar">
          <p className="text-sm text-slate-500 font-medium mb-4">
            {t('admin.stickers.description')}
          </p>

          {/* Upload zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all mb-6 p-8 gap-3 ${
              isDragging
                ? 'border-brand-blue-primary bg-brand-blue-lighter/20'
                : 'border-slate-300 bg-white hover:border-brand-blue-light hover:bg-slate-50'
            } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            {uploading ? (
              <>
                <Loader2 className="w-8 h-8 text-brand-blue-primary animate-spin" />
                <p className="text-sm font-bold text-slate-500">
                  {t('common.loading')}
                </p>
              </>
            ) : (
              <>
                <div className="p-3 bg-slate-100 rounded-xl">
                  <Upload className="w-6 h-6 text-slate-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-black text-slate-600 uppercase tracking-tight">
                    {t('widgets.stickers.dropOrPaste')}
                  </p>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                    {t('admin.stickers.supportedFiles')}
                  </p>
                </div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileInput}
              disabled={uploading}
            />
          </div>

          {/* Sticker grid */}
          {normalizedStickers.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center bg-white border-2 border-dashed border-slate-200 rounded-3xl text-slate-400">
              <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-black uppercase tracking-widest text-xs">
                No global stickers yet
              </p>
              <p className="text-xs mt-1">
                Upload stickers above to make them available to all users.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {normalizedStickers.map((sticker) => (
                <div
                  key={sticker.url}
                  className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm hover:shadow-md transition-all flex flex-col gap-3 group"
                >
                  <div className="relative aspect-square bg-slate-50 rounded-xl flex items-center justify-center overflow-hidden">
                    <img
                      src={sticker.url}
                      alt="Global sticker"
                      className="w-full h-full object-contain p-4"
                    />
                    <button
                      onClick={() => removeSticker(sticker.url)}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:bg-red-600 p-1.5 z-10"
                      title="Remove from global library"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xxs font-black uppercase text-slate-400 tracking-widest block px-1">
                      Grade Levels
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {ALL_GRADE_LEVELS.map((level) => {
                        const isSelected = sticker.gradeLevels?.includes(level);
                        return (
                          <button
                            key={level}
                            onClick={() => toggleGradeLevel(sticker.url, level)}
                            className={`px-2 py-1.5 rounded-lg text-xxs font-black uppercase transition-all border-2 ${
                              isSelected
                                ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                                : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200 hover:text-slate-500'
                            }`}
                          >
                            {level}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
