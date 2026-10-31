// An imported question or note picture in the editor, with Remove (docs/plans/IMPORT.md D32).
import React from 'react';
import { X } from 'lucide-react';
import { StopPicture } from '@/components/videoActivity/StopPicture';

export const VideoActivityPictureField: React.FC<{
  fileId?: string;
  onRemove: () => void;
}> = ({ fileId, onRemove }) => {
  if (!fileId) return null;
  return (
    <div className="relative inline-flex max-w-full">
      <StopPicture fileId={fileId} className="max-h-40" />
      {/* no-tour-anchor: shows only on a picture an import brought in */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove picture"
        title="Remove picture"
        className="absolute top-1 right-1 p-1.5 rounded-full bg-white/90 text-slate-600 shadow-sm hover:text-brand-red-primary focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary/50"
      >
        <X className="w-4 h-4" aria-hidden />
      </button>
    </div>
  );
};
