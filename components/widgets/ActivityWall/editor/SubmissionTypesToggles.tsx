import React from 'react';
import type { ActivityWallAllowedTypes } from '@/types';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { wallTypeOn, type WallPostType } from '@/utils/activityWallTypes';
import { ToggleRow } from './ToggleRow';

interface SubmissionTypesTogglesProps {
  value: ActivityWallAllowedTypes;
  onChange: (value: ActivityWallAllowedTypes) => void;
  widgetId: string;
  widgetType: string;
}

const TYPE_ROWS: { key: WallPostType; label: string; hint?: string }[] = [
  { key: 'text', label: 'Text' },
  { key: 'photo', label: 'Photo' },
  { key: 'link', label: 'Link' },
  { key: 'file', label: 'File', hint: 'PDF or an Office document.' },
  { key: 'video', label: 'Video', hint: 'Up to 200 MB.' },
];

/** Per-wall submission kinds; the last one left on can't be turned off. */
export const SubmissionTypesToggles: React.FC<SubmissionTypesTogglesProps> = ({
  value,
  onChange,
  widgetId,
  widgetType,
}) => {
  const onCount = TYPE_ROWS.filter((row) => wallTypeOn(value, row.key)).length;
  return (
    <div
      {...tourAttr(
        'activity-wall-editor.submission-types',
        widgetId,
        widgetType
      )}
    >
      <p className="text-xs text-slate-600">Keep at least one type on.</p>
      <div className="divide-y divide-slate-200/70">
        {TYPE_ROWS.map((row) => {
          const on = wallTypeOn(value, row.key);
          return (
            <ToggleRow
              key={row.key}
              label={row.label}
              hint={row.hint}
              checked={on}
              disabled={on && onCount === 1}
              onChange={(next) => onChange({ ...value, [row.key]: next })}
              anchor={tourFieldAttr(
                'activity-wall-editor.submission-type',
                widgetType,
                row.key
              )}
            />
          );
        })}
      </div>
    </div>
  );
};
