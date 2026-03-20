import React from 'react';
import { Music, X } from 'lucide-react';
import { Modal } from '../common/Modal';
import { MusicManager } from './MusicManager';

interface MusicLibraryModalProps {
  onClose: () => void;
}

export const MusicLibraryModal: React.FC<MusicLibraryModalProps> = ({
  onClose,
}) => {
  const header = (
    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
          <Music className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-800 tracking-tight">
            Music Library
          </h2>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
            Classroom Radio Stations
          </p>
        </div>
      </div>
      <button
        type="button"
        aria-label="Close music library"
        onClick={onClose}
        className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
      >
        <X className="w-6 h-6" />
      </button>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-end w-full">
      <button
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
      className="!p-0"
      contentClassName=""
      footerClassName="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end w-full shrink-0"
    >
      <div className="p-6">
        <MusicManager />
      </div>
    </Modal>
  );
};
