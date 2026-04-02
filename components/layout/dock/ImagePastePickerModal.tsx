import React from 'react';
import { ImageIcon, Wand2, X } from 'lucide-react';
import { GlassCard } from '@/components/common/GlassCard';
import { Modal } from '@/components/common/Modal';
import { GlobalStyle } from '@/types';
import { Z_INDEX } from '@/config/zIndex';

interface ImagePastePickerModalProps {
  onSelect: (type: 'sticker' | 'full-image') => void;
  onClose: () => void;
  globalStyle?: GlobalStyle;
}

export const ImagePastePickerModal: React.FC<ImagePastePickerModalProps> = ({
  onSelect,
  onClose,
  globalStyle,
}) => {
  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      variant="bare"
      zIndex="z-critical"
    >
      <GlassCard
        globalStyle={globalStyle}
        className="w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">
              How should this be pasted?
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 font-bold">
              Pick an image type for the board
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Choice buttons */}
        <div className="px-6 pb-6 grid grid-cols-2 gap-3">
          <button
            onClick={() => onSelect('sticker')}
            className="group flex flex-col items-center gap-3 p-5 bg-amber-50 hover:bg-amber-100 border-2 border-amber-200 hover:border-amber-400 rounded-2xl transition-all active:scale-95 text-left"
          >
            <div className="w-11 h-11 rounded-xl bg-amber-400 flex items-center justify-center shadow-md shadow-amber-300/40 group-hover:scale-110 transition-transform">
              <Wand2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-amber-800">
                Sticker
              </p>
              <p className="text-xxs text-amber-600 font-bold mt-0.5 leading-tight">
                Removes background & trims whitespace
              </p>
            </div>
          </button>

          <button
            onClick={() => onSelect('full-image')}
            className="group flex flex-col items-center gap-3 p-5 bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-200 hover:border-emerald-400 rounded-2xl transition-all active:scale-95 text-left"
          >
            <div className="w-11 h-11 rounded-xl bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-400/40 group-hover:scale-110 transition-transform">
              <ImageIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-emerald-800">
                Full Image
              </p>
              <p className="text-xxs text-emerald-600 font-bold mt-0.5 leading-tight">
                Original image with no processing
              </p>
            </div>
          </button>
        </div>
      </GlassCard>
    </Modal>
  );
};
