import React from 'react';
import { FileText, Film, Image, Link2, Paperclip } from 'lucide-react';
import type { ActivityWallSubmissionType } from '@/types';

const TYPE_META: Record<
  Exclude<ActivityWallSubmissionType, 'word'>,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  text: { label: 'Text', icon: FileText },
  photo: { label: 'Photo', icon: Image },
  link: { label: 'Link', icon: Link2 },
  file: { label: 'File', icon: Paperclip },
  video: { label: 'Video', icon: Film },
};

interface SubmissionTypePickerProps {
  available: Exclude<ActivityWallSubmissionType, 'word'>[];
  value: ActivityWallSubmissionType;
  onChange: (next: Exclude<ActivityWallSubmissionType, 'word'>) => void;
}

export const SubmissionTypePicker: React.FC<SubmissionTypePickerProps> = ({
  available,
  value,
  onChange,
}) => {
  if (available.length < 2) return null;

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Post type">
      {available.map((type) => {
        const { label, icon: Icon } = TYPE_META[type];
        const selected = value === type;
        return (
          <button
            key={type}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(type)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
              selected
                ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:border-brand-blue-primary'
            }`}
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
};
