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
  height: number
): number => {
  if (groupCount <= 1 || width <= 0 || height <= 0)
    return Math.max(1, groupCount);
  const containerRatio = width / height;
  let bestCols = 1;
  let bestScore = Infinity;
  for (let cols = 1; cols <= groupCount; cols++) {
    const rows = Math.ceil(groupCount / cols);
    const cardRatio = width / cols / (height / rows);
    const ratioMismatch = Math.abs(Math.log(cardRatio / containerRatio));
    const wastedCells = cols * rows - groupCount;
    const score = ratioMismatch + wastedCells * 0.15;
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

  const cols = computeColumnCount(groups.length, dims.w, dims.h);
  const rows = groups.length > 0 ? Math.ceil(groups.length / cols) : 1;

  return (
    <div
      ref={gridRef}
      className="flex-1 w-full grid overflow-hidden"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: 'min(8px, 2cqmin)',
        padding: 'min(4px, 1cqmin) 0',
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
              padding: 'min(10px, 4cqmin)',
              containerType: 'size',
            }}
          >
            <div
              className="uppercase text-brand-blue-primary tracking-widest opacity-80 font-black truncate flex-shrink-0"
              style={{
                fontSize: 'min(14px, 7cqmin)',
                marginBottom: 'min(6px, 2cqmin)',
              }}
              title={groupName}
            >
              {groupName}
            </div>
            <div
              className="flex-1 min-h-0 flex flex-col justify-center overflow-hidden"
              style={{ gap: 'min(4px, 1.5cqmin)' }}
            >
              {groupNames.map((name, ni) => {
                const n = Math.max(groupNames.length, 1);
                const cqhPerLine = Math.max(10, Math.floor(62 / n));
                return (
                  <div
                    key={ni}
                    className="text-slate-700 font-bold whitespace-nowrap overflow-hidden text-ellipsis leading-tight"
                    style={{
                      fontSize: `clamp(12px, min(${cqhPerLine}cqh, 18cqw), 64px)`,
                    }}
                  >
                    {name}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {showEmptyState && (
        <div
          className="col-span-full row-span-full flex flex-col items-center justify-center text-slate-300 italic font-bold"
          style={{ gap: 'min(8px, 2cqmin)' }}
        >
          <Users
            className="opacity-20"
            style={{
              width: 'min(32px, 8cqmin)',
              height: 'min(32px, 8cqmin)',
            }}
          />
          <span style={{ fontSize: 'min(14px, 3.5cqmin)' }}>
            Click Randomize to Group
          </span>
        </div>
      )}
    </div>
  );
};
