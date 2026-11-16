// One assigned Writing session on the In Progress or Completed tab.
import React from 'react';
import { Calendar, PowerOff, Trash2 } from 'lucide-react';
import type { WritingAssignmentRecord } from '@/types';
import {
  AssignmentArchiveCard,
  type LibraryMenuAction,
} from '@/components/common/library';

const day = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export const WritingAssignmentRow: React.FC<{
  record: WritingAssignmentRecord;
  mode: 'active' | 'archive';
  tourIndex: number;
  onEnd: (record: WritingAssignmentRecord) => void;
  onDelete: (record: WritingAssignmentRecord) => void;
}> = ({ record: r, mode, tourIndex, onEnd, onDelete }) => {
  const classes = (r.periodNames ?? []).filter(Boolean);
  const classLabel =
    classes.length === 1
      ? classes[0]
      : classes.length > 0
        ? `${classes.length} classes`
        : null;
  const icon = { width: 'min(12px, 3cqmin)', height: 'min(12px, 3cqmin)' };
  const secondaries: LibraryMenuAction[] = [
    ...(mode === 'active'
      ? [
          {
            id: 'deactivate',
            label: 'End',
            icon: PowerOff,
            destructive: true,
            onClick: () => onEnd(r),
          },
        ]
      : []),
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      onClick: () => onDelete(r),
    },
  ];
  return (
    <AssignmentArchiveCard<WritingAssignmentRecord>
      assignment={r}
      tourIndex={tourIndex}
      tourWidgetType="writing"
      mode={mode}
      status={
        mode === 'archive'
          ? { label: 'Ended', tone: 'neutral' }
          : { label: 'Live', tone: 'success', dot: true }
      }
      title={r.title || 'Untitled writing assignment'}
      subtitle={
        typeof r.dueAt === 'number' ? `Due ${day(r.dueAt)}` : undefined
      }
      meta={
        <>
          <span
            className="inline-flex items-center"
            style={{ gap: 'min(2px, 0.5cqmin)' }}
          >
            <Calendar style={icon} />
            {day(r.createdAt)}
          </span>
          {classLabel && (
            <span
              className="truncate font-semibold"
              style={{ maxWidth: 'min(160px, 36cqmin)' }}
              title={classes.join(', ')}
            >
              {classLabel}
            </span>
          )}
        </>
      }
      secondaryActions={secondaries}
    />
  );
};
