import React from 'react';
import { ImageIcon, Sparkles } from 'lucide-react';
import { GlobalStyle } from '@/types';
import { PasteChoice, PastePickerModal } from './PastePickerModal';

interface ImagePastePickerModalProps {
  onSelect: (type: 'sticker' | 'full-image') => void;
  onClose: () => void;
  globalStyle?: GlobalStyle;
}

export const ImagePastePickerModal: React.FC<ImagePastePickerModalProps> = ({
  onSelect,
  onClose,
  globalStyle,
}) => (
  <PastePickerModal
    subtitle="Pick an image type for the board"
    closeTourId="dock.image-paste-close"
    onClose={onClose}
    globalStyle={globalStyle}
  >
    <PasteChoice
      tourId="dock.image-paste-sticker"
      tone="amber"
      icon={Sparkles}
      label="Sticker"
      hint="Removes background & trims whitespace"
      onClick={() => onSelect('sticker')}
    />
    <PasteChoice
      tourId="dock.image-paste-full"
      tone="emerald"
      icon={ImageIcon}
      label="Full Image"
      hint="Original image with no processing"
      onClick={() => onSelect('full-image')}
    />
  </PastePickerModal>
);
