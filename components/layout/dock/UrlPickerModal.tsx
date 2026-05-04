import React, { useEffect, useRef, useState } from 'react';
import { Link, QrCode, X, ArrowLeft, Check } from 'lucide-react';
import { GlassCard } from '@/components/common/GlassCard';
import { Modal } from '@/components/common/Modal';
import { GlobalStyle } from '@/types';
import { isSafeIconUrl } from '@/components/widgets/Catalyst/catalystHelpers';
import { useStorage } from '@/hooks/useStorage';
import {
  URL_ICONS,
  DEFAULT_URL_ICON_ID,
  DEFAULT_URL_COLOR,
  getUrlIcon,
} from '@/components/widgets/UrlWidget/icons';
import { LinkBackgroundInput } from '@/components/widgets/UrlWidget/LinkBackgroundInput';
import {
  LinkShapePicker,
  type LinkShape,
} from '@/components/widgets/UrlWidget/LinkShapePicker';

export type UrlPickerSelection =
  | { type: 'qr' }
  | {
      type: 'url';
      title?: string;
      icon: string;
      color: string;
      shape: LinkShape;
      imageUrl?: string;
    };

interface UrlPickerModalProps {
  url: string;
  onSelect: (selection: UrlPickerSelection) => void;
  onClose: () => void;
  globalStyle?: GlobalStyle;
}

const PREVIEW_MAX_LENGTH = 120;

export const UrlPickerModal: React.FC<UrlPickerModalProps> = ({
  url,
  onSelect,
  onClose,
  globalStyle,
}) => {
  const [stage, setStage] = useState<'choose' | 'customize'>('choose');
  const [title, setTitle] = useState('');
  const [iconId, setIconId] = useState(DEFAULT_URL_ICON_ID);
  const [color, setColor] = useState(DEFAULT_URL_COLOR);
  const [shape, setShape] = useState<LinkShape>('rectangle');
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);

  // If the teacher uploads a background image but then closes the modal or
  // switches back to QR without confirming, the upload would otherwise stay
  // as an orphaned blob in Drive/Storage. Track the staged URL and delete on
  // unmount unless `handleConfirm` claimed it first.
  const { deleteFile } = useStorage();
  const stagedImageRef = useRef<string | undefined>(undefined);
  const deleteFileRef = useRef(deleteFile);
  useEffect(() => {
    deleteFileRef.current = deleteFile;
  }, [deleteFile]);
  useEffect(() => {
    stagedImageRef.current = imageUrl;
  }, [imageUrl]);
  useEffect(() => {
    return () => {
      const orphan = stagedImageRef.current;
      if (orphan) {
        void deleteFileRef.current(orphan).catch((err) => {
          console.warn(
            '[UrlPickerModal] Failed to clean up uncommitted image upload.',
            err
          );
        });
      }
    };
  }, []);

  const preview =
    url.length > PREVIEW_MAX_LENGTH
      ? url.slice(0, PREVIEW_MAX_LENGTH).trimEnd() + '…'
      : url;

  const handleConfirm = () => {
    // The selected image is now owned by the caller (it gets persisted into a
    // new URL widget). Clear the cleanup ref BEFORE notifying so the unmount
    // effect can't race and delete a file the parent just took ownership of.
    stagedImageRef.current = undefined;
    onSelect({
      type: 'url',
      title: title.trim() || undefined,
      icon: iconId,
      color,
      shape,
      imageUrl,
    });
  };

  const hasSafeImage = imageUrl ? isSafeIconUrl(imageUrl) : false;
  const isCircle = shape === 'circle';

  return (
    <Modal isOpen={true} onClose={onClose} variant="bare" zIndex="z-critical">
      <GlassCard
        globalStyle={globalStyle}
        className="w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-2">
            {stage === 'customize' && (
              <button
                onClick={() => setStage('choose')}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">
                {stage === 'choose'
                  ? 'How should this link be displayed?'
                  : 'Customize your link'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-bold">
                {stage === 'choose'
                  ? 'Pick a widget type for this link'
                  : 'Set a title, shape, icon, and background'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* URL preview — React renders {preview} as a text node, so no XSS risk */}
        <div className="mx-6 mb-5 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
          <p className="text-xs text-slate-500 font-black uppercase tracking-widest mb-1.5">
            Pasted link
          </p>
          <p className="text-sm text-slate-700 font-bold leading-relaxed whitespace-pre-wrap break-words">
            {preview}
          </p>
        </div>

        {stage === 'choose' ? (
          <div className="px-6 pb-6 grid grid-cols-2 gap-3">
            <button
              onClick={() => setStage('customize')}
              className="group flex flex-col items-center gap-3 p-5 bg-blue-50 hover:bg-blue-100 border-2 border-blue-200 hover:border-blue-400 rounded-2xl transition-all active:scale-95 text-left"
            >
              <div className="w-11 h-11 rounded-xl bg-blue-500 flex items-center justify-center shadow-md shadow-blue-400/40 group-hover:scale-110 transition-transform">
                <Link className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-blue-800">
                  Links Widget
                </p>
                <p className="text-xxs text-blue-600 font-bold mt-0.5 leading-tight">
                  Clickable button on the board
                </p>
              </div>
            </button>

            <button
              onClick={() => onSelect({ type: 'qr' })}
              className="group flex flex-col items-center gap-3 p-5 bg-brand-blue-lighter hover:bg-brand-blue-lighter/80 border-2 border-brand-blue-lighter hover:border-brand-blue-light rounded-2xl transition-all active:scale-95 text-left"
            >
              <div className="w-11 h-11 rounded-xl bg-brand-blue-primary flex items-center justify-center shadow-md shadow-brand-blue-primary/40 group-hover:scale-110 transition-transform">
                <QrCode className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-brand-blue-dark">
                  QR Code
                </p>
                <p className="text-xxs text-brand-blue-primary font-bold mt-0.5 leading-tight">
                  Scannable by student devices
                </p>
              </div>
            </button>
          </div>
        ) : (
          <div className="px-6 pb-6 space-y-5">
            {/* Live preview */}
            <div className="flex items-center justify-center">
              <div
                className={`relative overflow-hidden flex flex-col items-center justify-center border border-white/30 shadow-md ${
                  isCircle ? 'w-24 h-24 rounded-full' : 'w-32 h-24 rounded-2xl'
                }`}
                style={{
                  backgroundColor: hasSafeImage ? '#1e293b' : color,
                }}
              >
                {hasSafeImage && (
                  <img
                    src={imageUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  />
                )}
                {hasSafeImage ? (
                  <span
                    className="absolute left-0 right-0 bottom-0 z-10 font-black text-white text-xs text-center leading-tight px-2 py-1.5"
                    style={{
                      backgroundColor: 'rgba(15, 23, 42, 0.42)',
                      backdropFilter: 'blur(4px)',
                      WebkitBackdropFilter: 'blur(4px)',
                    }}
                  >
                    {title.trim() || 'Sample'}
                  </span>
                ) : (
                  (() => {
                    const Picked = getUrlIcon(iconId);
                    return (
                      <>
                        <Picked className="w-8 h-8 text-white drop-shadow-sm" />
                        <span className="font-black text-white text-sm mt-1 drop-shadow-md break-words text-center px-2 line-clamp-2">
                          {title.trim() || 'Sample'}
                        </span>
                      </>
                    );
                  })()
                )}
              </div>
            </div>

            {/* Title input */}
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-widest">
                Title (Optional)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirm();
                }}
                autoFocus
                placeholder="e.g. Class Website"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
              />
            </div>

            {/* Shape picker */}
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-widest">
                Shape
              </label>
              <LinkShapePicker shape={shape} onChange={setShape} />
            </div>

            {/* Icon picker */}
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-widest">
                Icon
              </label>
              <div className="grid grid-cols-10 gap-1.5 max-h-32 overflow-y-auto p-1">
                {URL_ICONS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setIconId(id)}
                    title={label}
                    aria-label={label}
                    aria-pressed={iconId === id}
                    className={`flex items-center justify-center w-8 h-8 rounded-lg border-2 transition-all ${
                      iconId === id
                        ? 'border-slate-800 bg-slate-800 text-white scale-105'
                        : 'border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>

            {/* Background — color or image */}
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-widest">
                Background
              </label>
              <LinkBackgroundInput
                color={color}
                imageUrl={imageUrl}
                onChange={({ color: nextColor, imageUrl: nextImage }) => {
                  if (nextColor !== undefined) setColor(nextColor);
                  setImageUrl(nextImage);
                }}
              />
            </div>

            {/* Confirm button */}
            <button
              type="button"
              onClick={handleConfirm}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl font-black uppercase tracking-widest text-xs transition-colors"
            >
              <Check className="w-4 h-4" />
              Add Link
            </button>
          </div>
        )}
      </GlassCard>
    </Modal>
  );
};
