import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Users, Pencil, Palette } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { RandomGroup, SharedGroup } from '@/types';
import { StudentChip } from './StudentChip';
import { SCOREBOARD_COLORS } from '@/config/scoreboard';

interface RandomGroupsProps {
  displayResult: string | string[] | string[][] | RandomGroup[] | null;
  sharedGroups?: SharedGroup[];
  /** Default group name prefix when a group has no shared-groups entry. */
  groupNamePrefix?: string;
  /** When true, render chips as draggable + lockable and groups as drop zones. */
  editable?: boolean;
  lockedNames?: string[];
  onToggleLock?: (name: string) => void;
  /** Persist a new custom name for a group. Called on commit (Enter / blur). */
  onRenameGroup?: (groupId: string, newName: string) => void;
  /** Persist a new color for a group's header band. */
  onChangeGroupColor?: (groupId: string, color: string | null) => void;
}

const computeColumnCount = (
  groupCount: number,
  width: number,
  height: number,
  maxNameLen: number = 8,
  maxChipsPerGroup: number = 4
): number => {
  if (groupCount <= 1 || width <= 0 || height <= 0)
    return Math.max(1, groupCount);
  const containerRatio = width / height;
  // Ideal column count makes each card's aspect ratio approximately square-ish
  // while respecting the container shape: idealCols ≈ sqrt(count * containerRatio).
  const idealCols = Math.sqrt(groupCount * containerRatio);
  // Each chip wants at least ~26px of vertical room to read comfortably.
  // For a group of 10 names that means a card of at least ~260px tall — a
  // 2×2 layout for 3 groups in a square widget breaks that floor and wastes
  // a quarter of the widget besides; this signal lets the heuristic prefer
  // 3×1 instead.
  const minChipRowH = 26;
  const desiredCardH = maxChipsPerGroup * minChipRowH;
  let bestCols = 1;
  let bestScore = Infinity;
  for (let cols = 1; cols <= groupCount; cols++) {
    const rows = Math.ceil(groupCount / cols);
    const cardW = width / cols;
    const cardH = height / rows;
    // Distance from the aspect-driven ideal — the primary signal.
    const idealDist = Math.abs(cols - idealCols);
    // Penalize empty grid cells. 3 groups in 2×2 has 1 empty cell (25% of
    // the widget wasted); weight this heavily so we prefer 3×1 / 1×3 when
    // they exist and pack with no waste. Multiplier is tuned so that a
    // 25%-wasted layout (e.g. 3 groups in 2×2) loses to a 0%-wasted
    // alternative even when the wasted layout matches the widget aspect
    // ratio more closely.
    const wastedCells = cols * rows - groupCount;
    const wastedAreaPenalty = (wastedCells / (cols * rows)) * 4.0;
    // Penalize cards too narrow for the longest name (~6px per glyph).
    const widthShortfall = Math.max(0, maxNameLen * 6 - cardW) / 80;
    // Penalize cards that can't fit their chips at a readable size. Scales
    // with chips-per-group so dense groups are pushed toward taller cards.
    const heightShortfall = Math.max(0, desiredCardH - cardH) / 80;
    // Mild bias toward fewer rows / more columns so the layout reaches its
    // wider-feeling configuration sooner as the widget grows. Without this,
    // 6 groups stay in 2×3 well past the point where 3×2 reads better, and
    // the eventual flip feels abrupt.
    const rowsPenalty = (rows - 1) * 0.15;
    const score =
      idealDist +
      wastedAreaPenalty +
      widthShortfall +
      heightShortfall +
      rowsPenalty;
    if (score < bestScore) {
      bestScore = score;
      bestCols = cols;
    }
  }
  return bestCols;
};

interface GroupDropZoneProps {
  groupId: string;
  groupName: string;
  /** Tailwind class for the header band background (e.g. 'bg-blue-500'). */
  headerColorClass: string;
  children: React.ReactNode;
  editable: boolean;
  /** When provided AND editable, the title becomes renamable. */
  onRename?: (newName: string) => void;
  /** When provided AND editable, the palette icon opens a color picker. */
  onChangeColor?: (color: string | null) => void;
}

const GroupDropZone: React.FC<GroupDropZoneProps> = ({
  groupId,
  groupName,
  headerColorClass,
  children,
  editable,
  onRename,
  onChangeColor,
}) => {
  const dropId = `group:${groupId}`;
  const { isOver, setNodeRef } = useDroppable({
    id: dropId,
    disabled: !editable,
  });

  const [editingName, setEditingName] = useState(false);
  const [draft, setDraft] = useState(groupName);
  const [lastGroupName, setLastGroupName] = useState(groupName);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [colorPickerAnchor, setColorPickerAnchor] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const paletteButtonRef = useRef<HTMLButtonElement>(null);
  const renameEnabled = editable && !!onRename;
  const colorEnabled = editable && !!onChangeColor;

  // Keep draft in sync when the upstream name changes (e.g. re-randomize
  // regenerates default names or another collaborator renamed the group).
  // Adjusts state during render rather than in an effect to avoid the
  // cascading-render warning per React's "you might not need an effect" guide.
  if (groupName !== lastGroupName) {
    setLastGroupName(groupName);
    if (!editingName) setDraft(groupName);
  }

  useEffect(() => {
    if (editingName) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingName]);

  // Close color picker on outside click.
  useEffect(() => {
    if (!colorPickerOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (paletteButtonRef.current?.contains(e.target as Node)) return;
      if (!colorPickerRef.current?.contains(e.target as Node)) {
        setColorPickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [colorPickerOpen]);

  // Recompute popover anchor on open + window resize / scroll so it tracks
  // the palette button when the user pans the dashboard.
  useEffect(() => {
    if (!colorPickerOpen) return;
    const updateAnchor = () => {
      const rect = paletteButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setColorPickerAnchor({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    };
    updateAnchor();
    window.addEventListener('resize', updateAnchor);
    window.addEventListener('scroll', updateAnchor, true);
    return () => {
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor, true);
    };
  }, [colorPickerOpen]);

  const commit = () => {
    setEditingName(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== groupName) {
      onRename?.(trimmed);
    } else {
      setDraft(groupName);
    }
  };

  const cancel = () => {
    setEditingName(false);
    setDraft(groupName);
  };

  return (
    <div
      ref={editable ? setNodeRef : null}
      className={`rounded-xl flex flex-col shadow-sm min-w-0 min-h-0 border transition-colors bg-white ${
        isOver
          ? 'border-brand-blue-primary/60 ring-2 ring-brand-blue-primary/30'
          : 'border-slate-200'
      }`}
      style={{
        containerType: 'size',
      }}
    >
      {/* Header band — colored to identify the group from across the
          classroom. Always-visible pencil + palette icons keep rename and
          recolor reachable on touch screens (no hover-revealed actions).
          The header carries its own rounded-top so we don't need
          overflow:hidden on the card — which would clip the color-picker
          popover beyond the card edge. */}
      <div
        className={`${headerColorClass} text-white flex items-center flex-shrink-0 relative rounded-t-[calc(0.75rem-1px)]`}
        style={{
          padding: 'clamp(2px, 0.8cqmin, 6px) clamp(6px, 2cqmin, 12px)',
          gap: 'clamp(4px, 1.5cqmin, 10px)',
        }}
      >
        {editingName ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-white/15 text-white tracking-wider font-black border-0 rounded outline-none focus:bg-white/25 placeholder:text-white/60"
            style={{
              fontSize: 'clamp(11px, 6cqmin, 22px)',
              padding: 'clamp(2px, 0.8cqmin, 6px) clamp(4px, 1.5cqmin, 8px)',
            }}
            aria-label={`Rename ${groupName}`}
          />
        ) : (
          <span
            className={`flex-1 min-w-0 truncate tracking-wider font-black select-none ${
              renameEnabled ? 'cursor-text' : ''
            }`}
            style={{ fontSize: 'clamp(11px, 6cqmin, 22px)' }}
            title={
              renameEnabled
                ? `${groupName} (click pencil or double-click to rename)`
                : groupName
            }
            onDoubleClick={
              renameEnabled ? () => setEditingName(true) : undefined
            }
          >
            {groupName}
          </span>
        )}
        {renameEnabled && !editingName && (
          <button
            type="button"
            className="shrink-0 text-white/70 hover:text-white transition-colors rounded"
            onClick={(e) => {
              e.stopPropagation();
              setEditingName(true);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`Rename ${groupName}`}
            title={`Rename ${groupName}`}
            style={{ padding: 'clamp(2px, 0.6cqmin, 4px)' }}
          >
            <Pencil
              style={{
                width: 'clamp(12px, 3.5cqmin, 18px)',
                height: 'clamp(12px, 3.5cqmin, 18px)',
              }}
            />
          </button>
        )}
        {colorEnabled && (
          <button
            ref={paletteButtonRef}
            type="button"
            className="shrink-0 text-white/70 hover:text-white transition-colors rounded"
            onClick={(e) => {
              e.stopPropagation();
              setColorPickerOpen((prev) => !prev);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`Change ${groupName} color`}
            aria-expanded={colorPickerOpen}
            title="Change header color"
            style={{ padding: 'clamp(2px, 0.6cqmin, 4px)' }}
          >
            <Palette
              style={{
                width: 'clamp(12px, 3.5cqmin, 18px)',
                height: 'clamp(12px, 3.5cqmin, 18px)',
              }}
            />
          </button>
        )}
        {/* Color-picker popover lives in a portal so it can extend past the
            group card and the parent grid's overflow-hidden without being
            clipped. Positioned from the palette button's bounding rect. */}
        {colorEnabled &&
          colorPickerOpen &&
          colorPickerAnchor &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              ref={colorPickerRef}
              className="fixed z-[1000] bg-white border border-slate-200 rounded-lg shadow-xl p-2"
              style={{
                top: colorPickerAnchor.top,
                right: colorPickerAnchor.right,
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="grid grid-cols-6 gap-2">
                {/* Default swatch (brand blue, no override stored). */}
                <button
                  type="button"
                  onClick={() => {
                    onChangeColor?.(null);
                    setColorPickerOpen(false);
                  }}
                  className="w-6 h-6 rounded-full bg-brand-blue-primary border-2 border-white ring-1 ring-slate-200 hover:scale-110 transition-transform"
                  aria-label="Reset to default color"
                  title="Default (brand blue)"
                />
                {SCOREBOARD_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      onChangeColor?.(color);
                      setColorPickerOpen(false);
                    }}
                    className={`w-6 h-6 rounded-full ${color} border-2 border-white ring-1 ring-slate-200 hover:scale-110 transition-transform`}
                    aria-label={`Set color to ${color.replace('bg-', '').replace('-', ' ')}`}
                    title={color.replace('bg-', '').replace('-', ' ')}
                  />
                ))}
              </div>
            </div>,
            document.body
          )}
      </div>
      <div
        className="flex-1 min-h-0 flex flex-col"
        style={{ padding: 'clamp(6px, 2cqmin, 14px)' }}
      >
        {children}
      </div>
    </div>
  );
};

export const RandomGroups: React.FC<RandomGroupsProps> = ({
  displayResult,
  sharedGroups,
  groupNamePrefix = 'Group',
  editable = false,
  lockedNames,
  onToggleLock,
  onRenameGroup,
  onChangeGroupColor,
}) => {
  const groups = useMemo(() => {
    if (
      Array.isArray(displayResult) &&
      (displayResult.length === 0 ||
        Array.isArray(displayResult[0]) ||
        (typeof displayResult[0] === 'object' && displayResult[0] !== null))
    ) {
      return displayResult as (string[] | RandomGroup)[];
    }
    return [];
  }, [displayResult]);

  const showEmptyState =
    !displayResult ||
    !Array.isArray(displayResult) ||
    displayResult.length === 0 ||
    (displayResult.length > 0 &&
      !Array.isArray(displayResult[0]) &&
      typeof displayResult[0] !== 'object');

  const gridRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDims({ w: width, h: height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const maxNameLen = (() => {
    let max = 0;
    for (const g of groups) {
      const names = Array.isArray(g) ? g : g.names;
      if (!names) continue;
      for (const name of names) {
        if (name.length > max) max = name.length;
      }
    }
    return max || 8;
  })();

  // Largest group size drives the height-fit signal — a single 10-name
  // group can dictate that we need taller cards even if the others are
  // shorter, otherwise that one card overflows.
  const maxChipsPerGroup = groups.reduce((m, g) => {
    const len = Array.isArray(g) ? g.length : (g.names?.length ?? 0);
    return Math.max(m, len);
  }, 1);
  const cols = computeColumnCount(
    groups.length,
    dims.w,
    dims.h,
    maxNameLen,
    maxChipsPerGroup
  );
  const rows = groups.length > 0 ? Math.ceil(groups.length / cols) : 1;
  const lockedSet = useMemo(() => new Set(lockedNames ?? []), [lockedNames]);

  // Per-card pixel dimensions (rough — ignores the inter-card gap, which is
  // small relative to the card itself). Used downstream to compute a
  // pixel-perfect chip fontSize so names cannot outgrow their chip width.
  const cardW = cols > 0 ? dims.w / cols : 0;
  const cardH = rows > 0 ? dims.h / rows : 0;

  return (
    <div
      ref={gridRef}
      className="flex-1 w-full grid overflow-hidden"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: 'clamp(6px, 2cqmin, 16px)',
        padding: 'clamp(4px, 1.2cqmin, 10px) 0',
      }}
    >
      {groups.map((groupItem, i) => {
        const groupNames = Array.isArray(groupItem)
          ? groupItem
          : groupItem.names;
        const groupId =
          !Array.isArray(groupItem) && 'id' in groupItem ? groupItem.id : null;

        let groupName = `${groupNamePrefix} ${i + 1}`;
        let headerColorClass = 'bg-brand-blue-primary';
        if (groupId && sharedGroups) {
          const shared = sharedGroups.find((g) => g.id === groupId);
          if (shared) {
            // Only override the synthetic default when the user has actually
            // typed a custom name (color-only entries leave name empty).
            if (shared.name?.trim()) groupName = shared.name;
            if (shared.color) headerColorClass = shared.color;
          }
        }

        if (!groupNames) return null;

        // Stable key — prefer the group's persistent id over index so React
        // doesn't blow away droppable refs on every re-randomize.
        const key = groupId ?? `${groupNamePrefix}-${i}`;
        // Use the group's real id (or a synthetic fallback) as the droppable
        // id. Empty-state groups created by the widget always have an id.
        const dropZoneId = groupId ?? `__no_id__:${i}`;

        // Per-group chip dimensions for pixel-perfect font sizing. Mirrors
        // ShuffleList: derive font from actual chip width/height so names
        // never outgrow their container and truncate.
        const rowCount = Math.max(groupNames.length, 1);
        const maxChars = Math.max(1, ...groupNames.map((s) => s.length), 1);

        // Card padding + header band eat into available chip area. Rough
        // estimates that match the cqmin-driven CSS clamps elsewhere in
        // this file.
        const cardPadX = Math.min(20, Math.max(8, cardW * 0.05));
        const cardPadY = Math.min(20, Math.max(8, cardH * 0.05));
        const headerH = Math.min(36, Math.max(20, cardH * 0.18));
        const chipsAreaW = Math.max(40, cardW - cardPadX * 2);
        const chipsAreaH = Math.max(20, cardH - headerH - cardPadY * 2);
        const chipRowH = chipsAreaH / Math.max(rowCount, 1);

        // Per-chip horizontal overhead in px: lock icon + gap + chip's
        // internal padding + safety margin. Lexend semibold averages
        // ~0.58em/char — 0.6 leaves a hair of room.
        const chipHorizontalOverhead = 48;
        const nameWidthPx = Math.max(40, chipsAreaW - chipHorizontalOverhead);
        const fontFromWidth = nameWidthPx / Math.max(maxChars * 0.6, 1);
        const fontFromHeight = chipRowH * 0.5;
        const fontSizePx =
          cardW > 0 && cardH > 0
            ? Math.max(10, Math.min(22, fontFromWidth, fontFromHeight))
            : 14;
        const chipFontSize = `${fontSizePx}px`;
        // Backwards-compat: the non-editable branch below still uses the
        // cqw/cqh-driven sizing for plain-text names, which already scaled
        // correctly. Keep those formulas alongside the new px-based path.
        const widthCqw = Math.max(
          4,
          Math.min(40, Math.round(120 / Math.max(maxChars + 3, 1)))
        );
        const heightCqh = Math.max(5, Math.floor(70 / rowCount));

        const body =
          editable && onToggleLock ? (
            <div
              className="flex-1 min-h-0 grid overflow-hidden"
              style={{
                // One chip per row, rows distribute evenly to fill the card.
                gridAutoRows: 'minmax(0, 1fr)',
                gap: 'clamp(2px, 0.8cqmin, 6px)',
              }}
            >
              {groupNames.length === 0 ? (
                <div
                  className="self-center text-slate-400/80 italic text-center"
                  style={{
                    fontSize: 'clamp(10px, 3cqmin, 14px)',
                    padding: 'clamp(6px, 2cqmin, 14px) 0',
                  }}
                >
                  Drop students here
                </div>
              ) : (
                groupNames.map((name) => (
                  <StudentChip
                    key={name}
                    name={name}
                    dragId={`chip:${dropZoneId}:${name}`}
                    sourceZoneId={dropZoneId}
                    locked={lockedSet.has(name)}
                    onToggleLock={onToggleLock}
                    variant="row"
                    fontSize={chipFontSize}
                  />
                ))
              )}
            </div>
          ) : (
            <div
              className="flex-1 min-h-0 flex flex-col justify-center overflow-hidden"
              style={{ gap: 'clamp(3px, 1.5cqmin, 10px)' }}
            >
              {groupNames.map((name, ni) => (
                <div
                  key={ni}
                  className="text-slate-700 font-bold whitespace-nowrap overflow-hidden text-ellipsis leading-tight"
                  style={{
                    fontSize: `clamp(8px, min(${widthCqw}cqw, ${heightCqh}cqh), 72px)`,
                  }}
                >
                  {name}
                </div>
              ))}
            </div>
          );

        return (
          <GroupDropZone
            key={key}
            groupId={dropZoneId}
            groupName={groupName}
            headerColorClass={headerColorClass}
            editable={editable}
            onRename={
              onRenameGroup && groupId
                ? (newName) => onRenameGroup(groupId, newName)
                : undefined
            }
            onChangeColor={
              onChangeGroupColor && groupId
                ? (color) => onChangeGroupColor(groupId, color)
                : undefined
            }
          >
            {body}
          </GroupDropZone>
        );
      })}
      {showEmptyState && (
        <div
          className="col-span-full row-span-full flex flex-col items-center justify-center text-slate-300 italic font-bold"
          style={{ gap: 'clamp(8px, 2.5cqmin, 18px)' }}
        >
          <Users
            className="opacity-20"
            style={{
              width: 'clamp(32px, 10cqmin, 72px)',
              height: 'clamp(32px, 10cqmin, 72px)',
            }}
          />
          <span style={{ fontSize: 'clamp(12px, 3.5cqmin, 22px)' }}>
            Click Randomize to Group
          </span>
        </div>
      )}
    </div>
  );
};
