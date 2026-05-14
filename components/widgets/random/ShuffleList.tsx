import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Layers } from 'lucide-react';
import { StudentChip } from './StudentChip';

const SHUFFLE_LIST_ZONE_ID = 'shuffle-list';

interface ShuffleRowProps {
  name: string;
  index: number;
  locked: boolean;
  onToggleLock: (name: string) => void;
  onRemove: (name: string) => void;
}

const ShuffleRow: React.FC<ShuffleRowProps> = ({
  name,
  index,
  locked,
  onToggleLock,
  onRemove,
}) => {
  // Each row is a droppable insertion point. Drop on row N → insert before N.
  // Source id of any chip rendered inside this row is `shuffle-list`, not
  // the row id, so the drag-end handler can tell "moved within shuffle" from
  // "moved from unassigned".
  const dropId = `shuffle-row:${index}`;
  const { isOver, setNodeRef } = useDroppable({ id: dropId });

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center rounded-xl border shadow-sm overflow-hidden transition-colors ${
        isOver
          ? 'bg-brand-blue-light/15 border-brand-blue-primary/60'
          : 'bg-white border-slate-200'
      }`}
      style={{
        gap: 'clamp(6px, 2cqmin, 12px)',
        padding: 'clamp(3px, 1cqmin, 8px) clamp(8px, 2cqmin, 14px)',
        marginBottom: 'clamp(3px, 1cqmin, 8px)',
        minHeight: 'clamp(28px, 6cqmin, 48px)',
        breakInside: 'avoid',
      }}
    >
      <span
        className="font-mono font-black text-slate-400 flex-shrink-0 tabular-nums"
        style={{ fontSize: 'clamp(11px, 3.2cqmin, 18px)' }}
      >
        {index + 1}
      </span>
      <StudentChip
        name={name}
        dragId={`chip:${SHUFFLE_LIST_ZONE_ID}:${name}`}
        sourceZoneId={SHUFFLE_LIST_ZONE_ID}
        locked={locked}
        onToggleLock={onToggleLock}
        onRemove={onRemove}
        fontSize="clamp(12px, 3.5cqmin, 18px)"
      />
    </div>
  );
};

interface ShuffleListProps {
  names: string[];
  lockedNames: string[];
  onToggleLock: (name: string) => void;
  onRemove: (name: string) => void;
}

export const ShuffleList: React.FC<ShuffleListProps> = ({
  names,
  lockedNames,
  onToggleLock,
  onRemove,
}) => {
  const lockedSet = React.useMemo(() => new Set(lockedNames), [lockedNames]);
  const { isOver, setNodeRef } = useDroppable({ id: SHUFFLE_LIST_ZONE_ID });

  if (names.length === 0) {
    return (
      <div
        ref={setNodeRef}
        className={`flex-1 flex flex-col items-center justify-center italic rounded-xl border border-dashed transition-colors ${
          isOver
            ? 'bg-brand-blue-light/10 border-brand-blue-primary/60 text-brand-blue-dark'
            : 'text-slate-300 border-slate-200/60'
        }`}
        style={{
          padding: 'min(40px, 8cqmin) 0',
          gap: 'min(8px, 2cqmin)',
        }}
      >
        <Layers
          className="opacity-30"
          style={{
            width: 'min(32px, 8cqmin)',
            height: 'min(32px, 8cqmin)',
          }}
        />
        <span
          className="font-bold text-center"
          style={{ fontSize: 'min(14px, 3.5cqmin)' }}
        >
          Drag students here, or click Randomize
        </span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 overflow-y-auto overflow-x-hidden w-full rounded-xl transition-colors ${
        isOver ? 'bg-brand-blue-light/5' : ''
      }`}
      style={{
        columnWidth: 'clamp(160px, 36cqmin, 240px)',
        columnFill: 'auto',
        columnGap: 'clamp(6px, 1.5cqmin, 12px)',
        padding: 'clamp(2px, 1cqmin, 6px) 0',
      }}
    >
      {names.map((name, i) => (
        <ShuffleRow
          key={`${name}-${i}`}
          name={name}
          index={i}
          locked={lockedSet.has(name)}
          onToggleLock={onToggleLock}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
};
