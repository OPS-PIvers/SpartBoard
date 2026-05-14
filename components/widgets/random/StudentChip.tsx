import React from 'react';
import { Check, Lock } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { chipViewTransitionName } from '@/utils/viewTransition';

interface StudentChipProps {
  name: string;
  /** Stable id for the drag source. Format: `chip:<zoneId>:<name>`. */
  dragId: string;
  /** Source zone id passed through dnd-kit `data` to the drop handler. */
  sourceZoneId: string;
  locked: boolean;
  onToggleLock: (name: string) => void;
  /** When provided, render a check toggle that strikes the name through.
   *  Used by Shuffle mode for presentation-order check-offs. */
  done?: boolean;
  onToggleDone?: (name: string) => void;
  /**
   * Layout variant.
   * - `'row'`: full-width cell that stretches into a grid row. Used inside
   *   group cards and the shuffle list. Auto-shrinking font assumed.
   * - `'pill'`: intrinsic-width pill that flows in a `flex-wrap` row. Used
   *   in the Unassigned tray where many names share a small footprint.
   */
  variant?: 'row' | 'pill';
  /** Optional override for chip font sizing. */
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
  done = false,
  onToggleDone,
  variant = 'row',
  fontSize,
  isDragOverlay,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: dragId,
      data: { name, sourceZoneId },
    });

  const isRow = variant === 'row';

  const style: React.CSSProperties = {
    fontSize:
      fontSize ?? (isRow ? 'clamp(11px, 5cqmin, 20px)' : 'min(13px, 3.2cqmin)'),
    // em-relative spacing so padding/gap track the font instead of the
    // widget — keeps chips from ballooning past their grid row when many
    // names are listed.
    gap: isRow ? '0.5em' : 'min(5px, 1.2cqmin)',
    padding: isRow ? '0.3em 0.75em' : 'min(4px, 1cqmin) min(10px, 2cqmin)',
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    touchAction: 'none',
    // Gives the browser a stable identity for this chip across DOM moves so
    // a View Transition (triggered by rotate / randomize) can animate it
    // sliding from its old group to its new one. The property is a no-op
    // when no transition is active.
    viewTransitionName: chipViewTransitionName(name),
  };

  // Locked state uses brand-blue tint; unlocked is plain white-on-card so the
  // group's background shows through cleanly (per Paul's GIF reference).
  const baseClasses = locked
    ? 'bg-brand-blue-light/20 border border-brand-blue-primary/40 text-brand-blue-dark'
    : 'bg-white border border-slate-200 text-slate-800';

  const dragClasses = isDragging
    ? 'opacity-40 grayscale cursor-grabbing'
    : 'cursor-grab';

  const layoutClasses = isRow
    ? 'flex w-full h-full items-center justify-between'
    : 'inline-flex items-center';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/chip ${layoutClasses} rounded-lg shadow-sm font-semibold leading-snug overflow-hidden min-w-0 transition-colors ${baseClasses} ${
        isDragOverlay ? 'shadow-lg ring-2 ring-brand-blue-primary/40' : ''
      } ${dragClasses}`}
      {...listeners}
      {...attributes}
    >
      <span
        className={`${
          isRow ? 'truncate min-w-0 flex-1' : 'truncate min-w-0'
        } ${done ? 'line-through opacity-60' : ''}`}
      >
        {name}
      </span>
      {/* Lock toggle. Always visible (touch + projector friendly). When
          unlocked it's a faint outline; when locked it's brand-blue and
          obvious from across the room. No hover-revealed actions. */}
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
        className={`shrink-0 rounded-full transition-colors flex items-center justify-center ${
          locked
            ? 'text-brand-blue-primary opacity-100'
            : 'text-slate-400 opacity-60 hover:opacity-100'
        }`}
        style={{
          padding: '0.15em',
        }}
        aria-label={locked ? `Unlock ${name}` : `Lock ${name}`}
        title={
          locked
            ? `Unlock ${name} (will move on Randomize)`
            : `Lock ${name} in place`
        }
      >
        <Lock
          style={{
            width: isRow ? '1em' : 'min(13px, 3.2cqmin)',
            height: isRow ? '1em' : 'min(13px, 3.2cqmin)',
          }}
        />
      </button>
      {/* Done toggle — only rendered when the parent wires onToggleDone
          (currently just Shuffle mode). When done, the chip's name is
          struck through and the button fills emerald to make the state
          glanceable from across the classroom. */}
      {onToggleDone && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleDone(name);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`shrink-0 rounded-full transition-colors flex items-center justify-center ${
            done
              ? 'bg-emerald-500 text-white opacity-100'
              : 'text-slate-400 opacity-60 hover:opacity-100'
          }`}
          style={{
            padding: '0.15em',
          }}
          aria-label={
            done ? `Mark ${name} as not done` : `Mark ${name} as done`
          }
          title={
            done
              ? `${name} is done — tap to undo`
              : `Mark ${name} as done (strikes their name through)`
          }
        >
          <Check
            style={{
              width: isRow ? '1em' : 'min(13px, 3.2cqmin)',
              height: isRow ? '1em' : 'min(13px, 3.2cqmin)',
            }}
          />
        </button>
      )}
    </div>
  );
};
