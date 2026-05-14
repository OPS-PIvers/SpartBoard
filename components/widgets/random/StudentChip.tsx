import React from 'react';
import { Lock, LockOpen, X } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';

interface StudentChipProps {
  name: string;
  /** Stable id for the drag source. Format: `chip:<zoneId>:<name>`. */
  dragId: string;
  /** Source zone id passed through dnd-kit `data` to the drop handler. */
  sourceZoneId: string;
  locked: boolean;
  onToggleLock: (name: string) => void;
  onRemove: (name: string) => void;
  /** Optional override for chip font sizing (used in shuffle's column layout). */
  fontSize?: string;
  /** When true, chip is rendered as a translucent ghost (drag source). */
  isDragOverlay?: boolean;
}

export const StudentChip: React.FC<StudentChipProps> = ({
  name,
  dragId,
  sourceZoneId,
  locked,
  onToggleLock,
  onRemove,
  fontSize,
  isDragOverlay,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: dragId,
      data: { name, sourceZoneId },
    });

  const style: React.CSSProperties = {
    fontSize: fontSize ?? 'clamp(11px, 4cqmin, 18px)',
    gap: 'clamp(4px, 1.2cqmin, 8px)',
    padding: 'clamp(2px, 0.8cqmin, 6px) clamp(6px, 1.6cqmin, 12px)',
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    touchAction: 'none',
  };

  const baseClasses = locked
    ? 'bg-brand-blue-light/15 border border-brand-blue-primary/40 text-brand-blue-dark'
    : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300';

  const dragClasses = isDragging
    ? 'opacity-40 grayscale cursor-grabbing'
    : 'cursor-grab';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/chip inline-flex items-center rounded-lg shadow-sm font-bold leading-tight whitespace-nowrap overflow-hidden min-w-0 ${baseClasses} ${
        isDragOverlay ? 'shadow-lg ring-2 ring-brand-blue-primary/40' : ''
      } ${dragClasses}`}
      {...listeners}
      {...attributes}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleLock(name);
        }}
        onPointerDown={(e) => {
          // Stop the drag listeners from claiming this pointer down so the
          // click reliably reaches the lock toggle.
          e.stopPropagation();
        }}
        className={`shrink-0 rounded-full transition-colors ${
          locked
            ? 'text-brand-blue-primary hover:text-brand-blue-dark'
            : 'text-slate-300 hover:text-slate-500'
        }`}
        style={{
          padding: 'clamp(1px, 0.5cqmin, 4px)',
        }}
        aria-label={locked ? `Unlock ${name}` : `Lock ${name}`}
        title={
          locked
            ? `Unlock ${name} (will move on Randomize)`
            : `Lock ${name} in this group`
        }
      >
        {locked ? (
          <Lock
            style={{
              width: 'clamp(10px, 3cqmin, 16px)',
              height: 'clamp(10px, 3cqmin, 16px)',
            }}
          />
        ) : (
          <LockOpen
            style={{
              width: 'clamp(10px, 3cqmin, 16px)',
              height: 'clamp(10px, 3cqmin, 16px)',
            }}
          />
        )}
      </button>
      <span className="truncate min-w-0">{name}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(name);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        className="shrink-0 rounded-full text-slate-300 hover:text-brand-red-primary opacity-0 group-hover/chip:opacity-100 focus:opacity-100 transition-opacity"
        style={{
          padding: 'clamp(1px, 0.5cqmin, 4px)',
        }}
        aria-label={`Remove ${name} from groups`}
        title={`Remove ${name} (send to Unassigned)`}
      >
        <X
          style={{
            width: 'clamp(10px, 3cqmin, 16px)',
            height: 'clamp(10px, 3cqmin, 16px)',
          }}
        />
      </button>
    </div>
  );
};
