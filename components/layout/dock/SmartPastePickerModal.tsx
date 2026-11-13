import React from 'react';
import { AlignLeft, CheckSquare } from 'lucide-react';
import { GlobalStyle } from '@/types';
import { clipText } from '@/utils/clipText';
import { PasteChoice, PastePickerModal } from './PastePickerModal';

interface SmartPastePickerModalProps {
  text: string;
  onSelect: (type: 'text' | 'checklist') => void;
  onClose: () => void;
  globalStyle?: GlobalStyle;
}

const PREVIEW_MAX_LENGTH = 120;

export const SmartPastePickerModal: React.FC<SmartPastePickerModalProps> = ({
  text,
  onSelect,
  onClose,
  globalStyle,
}) => {
  const preview =
    text.length > PREVIEW_MAX_LENGTH
      ? clipText(text, PREVIEW_MAX_LENGTH).trimEnd() + '…'
      : text;

  return (
    <PastePickerModal
      closeTourId="dock.smart-paste-close"
      onClose={onClose}
      globalStyle={globalStyle}
      preview={
        <div className="mx-6 mb-5 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
          <p className="text-xs text-slate-500 font-black uppercase tracking-widest mb-1.5">
            Pasted text
          </p>
          <p className="text-sm text-slate-700 font-bold leading-relaxed whitespace-pre-wrap wrap-break-word">
            {preview}
          </p>
        </div>
      }
    >
      <PasteChoice
        tourId="dock.smart-paste-text"
        tone="amber"
        icon={AlignLeft}
        label="Text Widget"
        onClick={() => onSelect('text')}
      />
      <PasteChoice
        tourId="dock.smart-paste-checklist"
        tone="emerald"
        icon={CheckSquare}
        label="Checklist"
        hint="Each line becomes a task"
        onClick={() => onSelect('checklist')}
      />
    </PastePickerModal>
  );
};
