import React, { useState } from 'react';
import { GlassCard } from '@/components/common/GlassCard';
import { Modal } from '@/components/common/Modal';
import { GlobalStyle } from '@/types';

interface RenameFolderModalProps {
  name: string;
  title?: string;
  onClose: () => void;
  onSave: (newName: string) => void;
  globalStyle?: GlobalStyle;
}

export const RenameFolderModal: React.FC<RenameFolderModalProps> = ({
  name,
  title = 'Rename Folder',
  onClose,
  onSave,
  globalStyle,
}) => {
  const [val, setVal] = useState(name);
  const [showError, setShowError] = useState(false);

  const commit = () => {
    const trimmed = val.trim();
    if (!trimmed) {
      setShowError(true);
      return;
    }
    onSave(trimmed);
  };

  return (
    <Modal isOpen={true} onClose={onClose} variant="bare" zIndex="z-critical">
      <GlassCard
        globalStyle={globalStyle}
        className="w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 mb-4">
          {title}
        </h3>
        <input
          type="text"
          value={val}
          onChange={(e) => {
            setVal(e.target.value);
            if (showError) setShowError(false);
          }}
          autoFocus
          placeholder="Folder name..."
          aria-invalid={showError || undefined}
          className={`w-full px-4 py-3 bg-slate-100 border-none rounded-xl focus:ring-2 text-sm font-bold ${showError ? 'ring-2 ring-brand-red-primary focus:ring-brand-red-primary' : 'focus:ring-brand-blue-primary'}`}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
        {showError && (
          <p className="text-xxs text-brand-red-primary mt-1 mb-4">
            Folder name can&apos;t be empty.
          </p>
        )}
        <div className={showError ? 'flex gap-3' : 'flex gap-3 mt-6'}>
          <button
            onClick={onClose}
            className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-500 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={commit}
            className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-white bg-brand-blue-primary rounded-xl hover:bg-brand-blue-dark shadow-lg shadow-brand-blue-primary/20 transition-all"
          >
            Save
          </button>
        </div>
      </GlassCard>
    </Modal>
  );
};
