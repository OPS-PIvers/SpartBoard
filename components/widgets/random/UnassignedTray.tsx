import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { UserMinus } from 'lucide-react';
import { StudentChip } from './StudentChip';
import { UNASSIGNED_ZONE_ID } from './randomEditHelpers';

interface UnassignedTrayProps {
  names: string[];
  lockedNames: string[];
  onToggleLock: (name: string) => void;
  onRemove: (name: string) => void;
  /** Hint text shown when the tray is empty but still rendered (e.g. drop target). */
  emptyHint?: string;
  /** When true, render an empty tray as a drop hint (used while dragging). */
  alwaysVisible?: boolean;
}

export const UnassignedTray: React.FC<UnassignedTrayProps> = ({
  names,
  lockedNames,
  onToggleLock,
  onRemove,
  emptyHint,
  alwaysVisible,
}) => {
  const { isOver, setNodeRef } = useDroppable({ id: UNASSIGNED_ZONE_ID });
  const lockedSet = new Set(lockedNames);

  if (names.length === 0 && !alwaysVisible) return null;

  return (
    <div
      ref={setNodeRef}
      className={`w-full rounded-xl border border-dashed transition-colors ${
        isOver
          ? 'bg-brand-blue-light/10 border-brand-blue-primary/60'
          : 'bg-slate-50/60 border-slate-300/70'
      }`}
      style={{
        padding: 'clamp(6px, 1.5cqmin, 12px) clamp(8px, 2cqmin, 16px)',
        marginBottom: 'clamp(4px, 1cqmin, 10px)',
      }}
    >
      <div
        className="flex items-center text-slate-500 uppercase tracking-widest font-black"
        style={{
          fontSize: 'clamp(9px, 2.6cqmin, 13px)',
          gap: 'clamp(4px, 1cqmin, 8px)',
          marginBottom:
            names.length > 0 ? 'clamp(4px, 1cqmin, 8px)' : undefined,
        }}
      >
        <UserMinus
          style={{
            width: 'clamp(10px, 2.8cqmin, 14px)',
            height: 'clamp(10px, 2.8cqmin, 14px)',
          }}
        />
        <span>Unassigned{names.length > 0 ? ` (${names.length})` : ''}</span>
      </div>
      {names.length === 0 ? (
        <div
          className="italic text-slate-400"
          style={{ fontSize: 'clamp(10px, 2.8cqmin, 13px)' }}
        >
          {emptyHint ?? 'Drop a student here to remove them from a group.'}
        </div>
      ) : (
        <div
          className="flex flex-wrap"
          style={{ gap: 'clamp(4px, 1.2cqmin, 10px)' }}
        >
          {names.map((name) => (
            <StudentChip
              key={name}
              name={name}
              dragId={`chip:${UNASSIGNED_ZONE_ID}:${name}`}
              sourceZoneId={UNASSIGNED_ZONE_ID}
              locked={lockedSet.has(name)}
              onToggleLock={onToggleLock}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
};
