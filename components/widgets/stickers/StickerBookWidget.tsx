import React, { useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Trash2, Loader2, Eraser, MousePointer2 } from 'lucide-react';
import { WidgetData, StickerBookConfig, StickerGlobalConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useImageUpload } from '@/hooks/useImageUpload';

const DEFAULT_STICKERS = [
  // Star
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23FFD700" stroke="%23B8860B" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  // Heart
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23FF69B4" stroke="%23C71585" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  // Check
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%2322c55e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  // Smile
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23fbbf24" stroke="%23d97706" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y2="9"/><line x1="15" x2="15.01" y2="9"/></svg>`,
  // 100
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><text y="40" font-family="sans-serif" font-size="40" font-weight="bold" fill="%23ef4444" text-decoration="underline">100</text></svg>`,
  // Great Job
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><rect width="200" height="50" rx="10" fill="%233b82f6"/><text x="100" y="35" font-family="sans-serif" font-size="30" font-weight="bold" fill="white" text-anchor="middle">GREAT JOB!</text></svg>`,
];

import { WidgetLayout } from '../WidgetLayout';

export const StickerBookWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { t } = useTranslation();
  const { updateWidget, clearAllStickers, addWidget, addToast } =
    useDashboard();
  const { featurePermissions, userGradeLevels } = useAuth();
  const { processAndUploadImage, uploading } = useImageUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const config = widget.config as StickerBookConfig;
  const customStickers = React.useMemo(
    () => config.uploadedUrls ?? [],
    [config.uploadedUrls]
  );

  const globalStickers = React.useMemo(() => {
    const stickerPermission = featurePermissions.find(
      (p) => p.widgetType === 'stickers'
    );
    const stickers =
      (stickerPermission?.config as StickerGlobalConfig | undefined)
        ?.globalStickers ?? [];

    return stickers
      .map((s) => (typeof s === 'string' ? { url: s } : s))
      .filter((s) => {
        // If user has no specific grade levels, show all
        if (!userGradeLevels || userGradeLevels.length === 0) return true;

        // If sticker has no specific grade levels, show it (backward compatibility or intended for all)
        if (!s.gradeLevels || s.gradeLevels.length === 0) return true;

        // Show if there is any overlap between user grade levels and sticker grade levels
        return s.gradeLevels.some((level) => userGradeLevels.includes(level));
      })
      .map((s) => s.url);
  }, [featurePermissions, userGradeLevels]);

  const removeCustomSticker = (index: number) => {
    const next = [...customStickers];
    next.splice(index, 1);
    updateWidget(widget.id, {
      config: { ...config, uploadedUrls: next },
    });
  };

  const processFile = useCallback(
    async (file: File) => {
      const url = await processAndUploadImage(file);
      if (url) {
        updateWidget(widget.id, {
          config: {
            ...config,
            uploadedUrls: [...customStickers, url],
          },
        });
      }
    },
    [config, customStickers, updateWidget, processAndUploadImage, widget.id]
  );

  // Handle global paste events when this widget is mounted
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
              `pasted-image-${Date.now()}.png`,
              { type: file.type }
            );
            void processFile(namedFile);
          }
        }
      }
    };

    // Use capture phase to ensure this runs before the global listener on window in Dock.tsx
    window.addEventListener('paste', handlePaste, true);
    return () => {
      window.removeEventListener('paste', handlePaste, true);
    };
  }, [processFile]);

  const handleDragStart = (e: React.DragEvent, url: string) => {
    const img = e.currentTarget.querySelector('img');
    const ratio = img ? img.naturalWidth / img.naturalHeight : 1;
    e.dataTransfer.setData(
      'application/sticker',
      JSON.stringify({ url, ratio })
    );
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleStickerClick = (url: string) => {
    // Add sticker to the center of the viewport or a default position
    const w = 150;
    const h = 150;
    // Try to place it near the top-left but visible
    addWidget('sticker', {
      x: 100,
      y: 100,
      w,
      h,
      config: { url, rotation: 0 },
    });
    addToast(t('widgets.stickers.stickerAdded'), 'success');
  };

  return (
    <WidgetLayout
      padding="p-0"
      header={
        <div
          className="flex items-center justify-between sticky top-0 z-10 shrink-0"
          style={{ padding: 'min(16px, 3.5cqmin)' }}
        >
          <span
            className="text-slate-700 font-black uppercase tracking-widest"
            style={{ fontSize: 'min(12px, 3cqmin)' }}
          >
            {t('widgets.stickers.collectionTitle')}
          </span>
          <div className="flex" style={{ gap: 'min(8px, 2cqmin)' }}>
            <button
              onClick={clearAllStickers}
              className="flex items-center bg-red-50 text-red-600 rounded-full hover:bg-red-100 transition-colors uppercase font-black tracking-widest border border-red-100 shadow-sm"
              style={{
                gap: 'min(4px, 1cqmin)',
                fontSize: 'min(10px, 2.5cqmin)',
                padding: 'min(6px, 1.5cqmin) min(12px, 2.5cqmin)',
              }}
              title={t('widgets.stickers.clearAll')}
            >
              <Eraser
                style={{
                  width: 'min(12px, 3cqmin)',
                  height: 'min(12px, 3cqmin)',
                }}
              />
              {t('common.clearAll')}
            </button>
            <label
              className={`flex items-center bg-blue-600 text-white rounded-full font-black uppercase tracking-widest cursor-pointer hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
              style={{
                gap: 'min(8px, 2cqmin)',
                fontSize: 'min(10px, 2.5cqmin)',
                padding: 'min(6px, 1.5cqmin) min(16px, 3.5cqmin)',
              }}
            >
              {uploading ? (
                <Loader2
                  className="animate-spin"
                  style={{
                    width: 'min(12px, 3cqmin)',
                    height: 'min(12px, 3cqmin)',
                  }}
                />
              ) : (
                <Upload
                  style={{
                    width: 'min(12px, 3cqmin)',
                    height: 'min(12px, 3cqmin)',
                  }}
                />
              )}
              {uploading ? t('widgets.stickers.wait') : t('common.upload')}
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
          </div>
        </div>
      }
      content={
        <div
          className="flex-1 w-full h-full overflow-y-auto custom-scrollbar bg-slate-50/30"
          style={{ padding: 'min(16px, 3.5cqmin)' }}
        >
          {/* Drop/Paste Zone - Integrated and obvious */}
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`border-2 border-dashed border-slate-200 rounded-2xl bg-white flex flex-col items-center justify-center transition-all hover:bg-blue-50 hover:border-blue-200 group shadow-sm ${uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}
            style={{
              marginBottom: 'min(24px, 5cqmin)',
              padding: 'min(20px, 4cqmin)',
              gap: 'min(8px, 2cqmin)',
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2
                className="text-blue-400 animate-spin"
                style={{
                  width: 'min(32px, 8cqmin)',
                  height: 'min(32px, 8cqmin)',
                }}
              />
            ) : (
              <div
                className="flex items-center"
                style={{ gap: 'min(16px, 3.5cqmin)' }}
              >
                <div
                  className="bg-slate-50 rounded-xl group-hover:bg-blue-100 transition-colors"
                  style={{ padding: 'min(12px, 2.5cqmin)' }}
                >
                  <Upload
                    className="text-slate-400 group-hover:text-blue-600"
                    style={{
                      width: 'min(24px, 6cqmin)',
                      height: 'min(24px, 6cqmin)',
                    }}
                  />
                </div>
                <div className="text-left">
                  <p
                    className="font-black uppercase text-slate-500 group-hover:text-blue-600 tracking-tight"
                    style={{ fontSize: 'min(12px, 3cqmin)' }}
                  >
                    {t('widgets.stickers.dropOrPaste')}
                  </p>
                  <p
                    className="font-bold text-slate-400 uppercase tracking-widest"
                    style={{ fontSize: 'min(10px, 2.5cqmin)' }}
                  >
                    {t('widgets.stickers.toAddCustom')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Defaults */}
          <div className="mb-8">
            <h4
              className="font-black text-slate-400 uppercase tracking-widest"
              style={{
                fontSize: 'min(10px, 2.5cqmin)',
                marginBottom: 'min(16px, 3.5cqmin)',
                padding: '0 min(4px, 1cqmin)',
              }}
            >
              {t('widgets.stickers.essentials')}
            </h4>
            <div
              className="grid grid-cols-4"
              style={{ gap: 'min(16px, 3.5cqmin)' }}
            >
              {DEFAULT_STICKERS.map((url, i) => (
                <div
                  key={i}
                  draggable
                  data-no-drag="true"
                  onDragStart={(e) => handleDragStart(e, url)}
                  onClick={() => handleStickerClick(url)}
                  className="aspect-square flex items-center justify-center bg-white rounded-2xl shadow-sm hover:shadow-md hover:scale-110 transition-all cursor-grab active:cursor-grabbing border border-slate-100 hover:border-blue-200 group"
                  title={t('widgets.stickers.dragOrClick')}
                >
                  <img
                    src={url}
                    alt="Sticker"
                    className="object-contain pointer-events-none group-hover:rotate-12 transition-transform"
                    style={{
                      width: 'min(40px, 10cqmin)',
                      height: 'min(40px, 10cqmin)',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Global Collection (admin-uploaded stickers) */}
          {globalStickers.length > 0 && (
            <div className="mb-8">
              <h4
                className="font-black text-slate-400 uppercase tracking-widest"
                style={{
                  fontSize: 'min(10px, 2.5cqmin)',
                  marginBottom: 'min(16px, 3.5cqmin)',
                  padding: '0 min(4px, 1cqmin)',
                }}
              >
                {t('widgets.stickers.globalCollection')}
              </h4>
              <div
                className="grid grid-cols-4"
                style={{ gap: 'min(16px, 3.5cqmin)' }}
              >
                {globalStickers.map((url) => (
                  <div
                    key={url}
                    draggable
                    data-no-drag="true"
                    onDragStart={(e) => handleDragStart(e, url)}
                    onClick={() => handleStickerClick(url)}
                    className="aspect-square flex items-center justify-center bg-white rounded-2xl shadow-sm hover:shadow-md hover:scale-110 transition-all cursor-grab active:cursor-grabbing border border-slate-100 hover:border-blue-200 group"
                    title={t('widgets.stickers.dragOrClick')}
                  >
                    <img
                      src={url}
                      alt="Global Sticker"
                      className="object-contain pointer-events-none group-hover:rotate-12 transition-transform"
                      style={{
                        width: 'min(40px, 10cqmin)',
                        height: 'min(40px, 10cqmin)',
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom */}
          {customStickers.length > 0 && (
            <div>
              <h4
                className="font-black text-slate-400 uppercase tracking-widest"
                style={{
                  fontSize: 'min(10px, 2.5cqmin)',
                  marginBottom: 'min(16px, 3.5cqmin)',
                  padding: '0 min(4px, 1cqmin)',
                }}
              >
                {t('widgets.stickers.myCollection')}
              </h4>
              <div
                className="grid grid-cols-4"
                style={{ gap: 'min(16px, 3.5cqmin)' }}
              >
                {customStickers.map((url, i) => (
                  <div
                    key={i}
                    draggable
                    data-no-drag="true"
                    onDragStart={(e) => handleDragStart(e, url)}
                    onClick={() => handleStickerClick(url)}
                    className="group relative aspect-square flex items-center justify-center bg-white rounded-2xl shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing border border-slate-100 hover:border-blue-200"
                    title={t('widgets.stickers.dragOrClick')}
                  >
                    <img
                      src={url}
                      alt="Custom Sticker"
                      className="w-full h-full object-contain pointer-events-none"
                      style={{ padding: 'min(10px, 2.5cqmin)' }}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCustomSticker(i);
                      }}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:bg-red-600 scale-75 group-hover:scale-100 z-10"
                      style={{ padding: 'min(6px, 1.5cqmin)' }}
                      title={t('widgets.stickers.deleteSticker')}
                    >
                      <Trash2
                        style={{
                          width: 'min(12px, 3cqmin)',
                          height: 'min(12px, 3cqmin)',
                        }}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      }
      footer={
        <div
          className="flex items-center shrink-0"
          style={{
            padding: 'min(12px, 2.5cqmin) min(16px, 3.5cqmin)',
            gap: 'min(12px, 3cqmin)',
          }}
        >
          <MousePointer2
            className="text-slate-400"
            style={{
              width: 'min(12px, 3cqmin)',
              height: 'min(12px, 3cqmin)',
            }}
          />
          <span
            className="font-black text-slate-400 uppercase tracking-widest text-center flex-1"
            style={{ fontSize: 'min(9px, 2.2cqmin)' }}
          >
            {t('widgets.stickers.dragFromLibrary')}
          </span>
        </div>
      }
    />
  );
};
