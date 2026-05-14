import React, { useCallback, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Layers } from 'lucide-react';
import { StudentChip } from './StudentChip';

const SHUFFLE_LIST_ZONE_ID = 'shuffle-list';

interface ShuffleRowProps {
  name: string;
  index: number;
  locked: boolean;
  onToggleLock: (name: string) => void;
  done: boolean;
  onToggleDone: (name: string) => void;
  fontSize: string;
  iconSize: string;
}

const ShuffleRow: React.FC<ShuffleRowProps> = ({
  name,
  index,
  locked,
  onToggleLock,
  done,
  onToggleDone,
  fontSize,
  iconSize,
}) => {
  // Each row is a droppable insertion point. Drop on row N → insert before N.
  const dropId = `shuffle-row:${index}`;
  const { isOver, setNodeRef } = useDroppable({ id: dropId });

  return (
    <div
      ref={setNodeRef}
      className={`flex items-stretch overflow-hidden min-w-0 min-h-0 transition-colors ${
        isOver ? 'rounded-lg ring-2 ring-brand-blue-primary/40' : ''
      }`}
      style={{
        gap: 'clamp(4px, 1.5cqmin, 10px)',
      }}
    >
      <span
        className="font-mono font-black text-slate-400 flex-shrink-0 tabular-nums flex items-center justify-end"
        style={{
          fontSize,
          minWidth: iconSize,
        }}
      >
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <StudentChip
          name={name}
          dragId={`chip:${SHUFFLE_LIST_ZONE_ID}:${name}`}
          sourceZoneId={SHUFFLE_LIST_ZONE_ID}
          locked={locked}
          onToggleLock={onToggleLock}
          done={done}
          onToggleDone={onToggleDone}
          variant="row"
          fontSize={fontSize}
        />
      </div>
    </div>
  );
};

interface ShuffleListProps {
  names: string[];
  lockedNames: string[];
  onToggleLock: (name: string) => void;
  doneNames: string[];
  onToggleDone: (name: string) => void;
}

/**
 * Pick a column count for the shuffle grid. Strategy: pack as many columns
 * as the available width allows, so a wider widget always shows more
 * columns (the previous height-driven formula left wasted whitespace when
 * the user widened a tall widget). Capped by:
 *   - `minColWidth`: each column needs room for the longest name + index +
 *     lock + gaps, otherwise names truncate.
 *   - `minNamesPerCol`: don't go so wide that columns end up with 1–2
 *     names each (which produces awkward sparse columns).
 */
const pickColumns = (
  count: number,
  width: number,
  _height: number,
  maxNameLen: number
): number => {
  if (count <= 0 || width <= 0) return Math.min(2, count);
  // ~6.5px per glyph at target ~14-18px font, plus ~70px for the index
  // column, lock + done icons, and gap padding.
  const minColWidth = Math.max(140, maxNameLen * 6.5 + 70);
  const minNamesPerCol = 3;
  const maxColsByWidth = Math.max(1, Math.floor(width / minColWidth));
  const maxColsByCount = Math.max(1, Math.floor(count / minNamesPerCol));
  return Math.min(maxColsByWidth, maxColsByCount, count);
};

export const ShuffleList: React.FC<ShuffleListProps> = ({
  names,
  lockedNames,
  onToggleLock,
  doneNames,
  onToggleDone,
}) => {
  const lockedSet = React.useMemo(() => new Set(lockedNames), [lockedNames]);
  const doneSet = React.useMemo(() => new Set(doneNames), [doneNames]);
  const { isOver, setNodeRef } = useDroppable({ id: SHUFFLE_LIST_ZONE_ID });

  const observerRef = useRef<ResizeObserver | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  // Callback ref that wires up the ResizeObserver when the grid element
  // mounts and tears it down when it unmounts. The previous useEffect-with-
  // empty-deps approach only ran ONCE on first mount — and on first mount
  // the empty-state branch returned a different element with no ref, so the
  // observer attached to `null` and never fired. A callback ref handles the
  // node's mount/unmount lifecycle correctly, so dims always update when
  // the grid actually appears (or is resized).
  const setGridRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (node) {
        const obs = new ResizeObserver((entries) => {
          for (const e of entries) {
            const { width, height } = e.contentRect;
            setDims({ w: width, h: height });
          }
        });
        obs.observe(node);
        observerRef.current = obs;
      }
    },
    [setNodeRef]
  );

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

  // Choose layout so every name fits with readable type, no scroll.
  const maxNameLen = Math.max(...names.map((n) => n.length), 6);
  const cols = pickColumns(names.length, dims.w, dims.h, maxNameLen);
  const rows = Math.ceil(names.length / cols);

  // Pixel-perfect font sizing derived directly from measured dimensions.
  // The chip uses em-based padding (~0.6em vertical + 1.375em line-height
  // ≈ 2em total height), and ~4.5em of horizontal overhead per chip in
  // shuffle (chip padding + name/lock gap + lock icon + name/done gap +
  // done check icon). Solving for the largest font that still fits both
  // dimensions:
  //   height: font * 2 + 2px border <= rowHeight
  //   width:  font * (4.5 + 0.6 * maxNameLen) <= chipWidth
  const colWidth = dims.w / Math.max(cols, 1);
  const rowHeight = dims.h / Math.max(rows, 1);
  const indexColPx = Math.min(36, Math.max(20, rowHeight * 0.7));
  // Approximate index-column-to-chip gap from ShuffleRow's clamp(4,1.5cqmin,10).
  const indexGapPx = 8;
  const chipWidth = Math.max(40, colWidth - indexColPx - indexGapPx);
  const fontFromWidth = chipWidth / Math.max(4.5 + 0.6 * maxNameLen, 1);
  // Leave 4px headroom (2px border + small gap) so chips never overflow.
  const fontFromHeight = (rowHeight - 4) * 0.5;
  const fontSizePx = Math.max(10, Math.min(20, fontFromWidth, fontFromHeight));
  const fontSize = `${fontSizePx}px`;
  // Lock icon stays at 1em via StudentChip's em-relative sizing, so we
  // don't need to thread a separate icon-size override anymore — but keep
  // a value here so we don't break the ShuffleRow signature.
  const iconSize = `${Math.max(14, Math.min(18, fontSizePx))}px`;

  return (
    <div
      ref={setGridRef}
      className={`flex-1 w-full grid overflow-hidden rounded-xl transition-colors ${
        isOver ? 'bg-brand-blue-light/5' : ''
      }`}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        // Column-major flow: 1..rows fill the first column top-to-bottom,
        // then the next column starts at the top. Matches how teachers
        // read a numbered list when scanning a wide widget.
        gridAutoFlow: 'column',
        columnGap: 'clamp(8px, 2.5cqmin, 18px)',
        rowGap: 'clamp(5px, 1.5cqmin, 12px)',
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
          done={doneSet.has(name)}
          onToggleDone={onToggleDone}
          fontSize={fontSize}
          iconSize={iconSize}
        />
      ))}
    </div>
  );
};
