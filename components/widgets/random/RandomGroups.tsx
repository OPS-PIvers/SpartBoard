import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import { RandomGroup, SharedGroup } from '@/types';

interface RandomGroupsProps {
  displayResult: string | string[] | string[][] | RandomGroup[] | null;
  sharedGroups?: SharedGroup[];
}

const computeColumnCount = (
  groupCount: number,
  width: number,
  height: number,
  maxNameLen: number = 8
): number => {
  if (groupCount <= 1 || width <= 0 || height <= 0)
    return Math.max(1, groupCount);
  const containerRatio = width / height;
  // Ideal column count makes each card's aspect ratio approximately square-ish
  // while respecting the container shape: idealCols ≈ sqrt(count * containerRatio).
  const idealCols = Math.sqrt(groupCount * containerRatio);
  let bestCols = 1;
  let bestScore = Infinity;
  for (let cols = 1; cols <= groupCount; cols++) {
    const rows = Math.ceil(groupCount / cols);
    const cardW = width / cols;
    const cardH = height / rows;
    // Distance from the aspect-driven ideal — the primary signal.
    const idealDist = Math.abs(cols - idealCols);
    // Penalize empty grid cells mildly (e.g. 5 groups in 3×2 has 1 empty).
    const wastedCells = cols * rows - groupCount;
    // Penalize cards too narrow for the longest name (~6px per glyph).
    const widthShortfall = Math.max(0, maxNameLen * 6 - cardW) / 80;
    // Penalize cards too short to be readable (keeps rows from collapsing).
    const heightShortfall = Math.max(0, 60 - cardH) / 80;
    const score =
      idealDist + wastedCells * 0.12 + widthShortfall + heightShortfall;
    if (score < bestScore) {
      bestScore = score;
      bestCols = cols;
    }
  }
  return bestCols;
};

export const RandomGroups: React.FC<RandomGroupsProps> = ({
  displayResult,
  sharedGroups,
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

  const cols = computeColumnCount(groups.length, dims.w, dims.h, maxNameLen);
  const rows = groups.length > 0 ? Math.ceil(groups.length / cols) : 1;

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

        let groupName = `Group ${i + 1}`;
        if (groupId && sharedGroups) {
          const shared = sharedGroups.find((g) => g.id === groupId);
          if (shared) groupName = shared.name;
        }

        if (!groupNames) return null;

        return (
          <div
            key={!Array.isArray(groupItem) && groupItem.id ? groupItem.id : i}
            className="bg-blue-50 border border-blue-200 rounded-xl flex flex-col shadow-sm overflow-hidden min-w-0 min-h-0"
            style={{
              padding: 'clamp(8px, 3.5cqmin, 20px)',
              containerType: 'size',
            }}
          >
            <div
              className="uppercase text-brand-blue-primary tracking-widest opacity-80 font-black truncate flex-shrink-0"
              style={{
                fontSize: 'clamp(11px, 8cqmin, 24px)',
                marginBottom: 'clamp(4px, 2.5cqmin, 10px)',
              }}
              title={groupName}
            >
              {groupName}
            </div>
            <div
              className="flex-1 min-h-0 flex flex-col justify-center overflow-hidden"
              style={{ gap: 'clamp(3px, 1.5cqmin, 10px)' }}
            >
              {(() => {
                const n = Math.max(groupNames.length, 1);
                const maxChars = Math.max(
                  1,
                  ...groupNames.map((s) => s.length)
                );
                // Intentional cqw/cqh mix (not cqmin): width budget comes from
                // longest name, height budget from row count. cqmin would
                // conflate these two independent constraints.
                const heightCqh = Math.max(6, Math.floor(65 / n));
                const widthCqw = Math.max(
                  4,
                  Math.min(40, Math.round(140 / maxChars))
                );
                return groupNames.map((name, ni) => (
                  <div
                    key={ni}
                    className="text-slate-700 font-bold whitespace-nowrap overflow-hidden text-ellipsis leading-tight"
                    style={{
                      fontSize: `clamp(8px, min(${widthCqw}cqw, ${heightCqh}cqh), 72px)`,
                    }}
                  >
                    {name}
                  </div>
                ));
              })()}
            </div>
          </div>
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
