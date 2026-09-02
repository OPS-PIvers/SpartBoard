import React from 'react';
import type { ActivityWallLibraryEntry } from '@/types';
import { ToggleRow } from './ToggleRow';

type AllowedTypes = NonNullable<ActivityWallLibraryEntry['allowedTypes']>;

interface SubmissionTypesTogglesProps {
  value: AllowedTypes;
  onChange: (value: AllowedTypes) => void;
}

const TYPE_ROWS: { key: keyof AllowedTypes; label: string; hint: string }[] = [
  { key: 'photo', label: 'Photo', hint: 'Camera roll or a photo they take.' },
  { key: 'link', label: 'Link', hint: 'A web address with a preview card.' },
  { key: 'file', label: 'File', hint: 'PDF or an Office document.' },
  { key: 'video', label: 'Video', hint: 'A video file up to 200 MB.' },
];

/** Per-wall submission kinds. Text is always on and is not a toggle. */
export const SubmissionTypesToggles: React.FC<SubmissionTypesTogglesProps> = ({
  value,
  onChange,
}) => (
  <div className="space-y-2">
    <p className="text-xs text-slate-600">
      Text is always allowed. Turn on anything else students may add.
    </p>
    {TYPE_ROWS.map((row) => (
      <ToggleRow
        key={row.key}
        label={row.label}
        hint={row.hint}
        checked={value[row.key]}
        onChange={(next) => onChange({ ...value, [row.key]: next })}
      />
    ))}
  </div>
);
