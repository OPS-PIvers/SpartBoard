import React from 'react';
import { tourAttr } from '@/config/tourAnchors';
import { Music, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { MusicManager } from './MusicManager';

interface MusicLibraryModalProps {
  onClose: () => void;
}

export const MusicLibraryModal: React.FC<MusicLibraryModalProps> = ({
  onClose,
}) => {
  const header = (
    <div className="px-6 py-3.5 flex items-center justify-between gap-3 bg-brand-blue-primary text-white rounded-t-2xl shrink-0">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-white/15 rounded-xl text-white">
          <Music className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-black text-white tracking-tight">
            Music Library
          </h2>
          <p className="text-xs text-white/80 font-medium uppercase tracking-wider">
            Classroom Radio Stations
          </p>
        </div>
      </div>
      <button
        {...tourAttr('admin.music.modal-close')}
        type="button"
        aria-label="Close music library"
        onClick={onClose}
        className="p-2 hover:bg-white/15 rounded-full text-white/80 transition-colors"
      >
        <X className="w-6 h-6" />
      </button>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-end w-full">
      <button
        {...tourAttr('admin.music.modal-done')}
        type="button"
        onClick={onClose}
        className="px-6 py-2.5 rounded-2xl text-sm font-black text-slate-500 hover:bg-white transition-all border border-transparent hover:border-slate-200"
      >
        Close
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      maxWidth="max-w-2xl"
      zIndex="z-modal-nested"
      customHeader={header}
      footer={footer}
      className="p-0!"
      contentClassName=""
      footerClassName="px-6 py-4 flex items-center justify-end w-full"
    >
      <div className="p-6">
        <MusicManager />
      </div>
    </Modal>
  );
};
