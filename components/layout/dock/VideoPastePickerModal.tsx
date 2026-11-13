import React from 'react';
import { Globe, PlayCircle } from 'lucide-react';
import { GlobalStyle } from '@/types';
import { PasteChoice, PastePickerModal } from './PastePickerModal';

interface VideoPastePickerModalProps {
  onSelect: (type: 'embed' | 'video-activity') => void;
  onClose: () => void;
  globalStyle?: GlobalStyle;
}

export const VideoPastePickerModal: React.FC<VideoPastePickerModalProps> = ({
  onSelect,
  onClose,
  globalStyle,
}) => (
  <PastePickerModal
    subtitle="Pick a widget for this YouTube video"
    closeTourId="dock.video-paste-close"
    onClose={onClose}
    globalStyle={globalStyle}
  >
    <PasteChoice
      tourId="dock.video-paste-embed"
      tone="amber"
      icon={Globe}
      label="Embed"
      hint="Plays the video on the board"
      onClick={() => onSelect('embed')}
    />
    <PasteChoice
      tourId="dock.video-paste-activity"
      tone="emerald"
      icon={PlayCircle}
      label="Video Activity"
      hint="Add questions students answer as they watch"
      onClick={() => onSelect('video-activity')}
    />
  </PastePickerModal>
);
