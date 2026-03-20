import React, { useMemo } from 'react';
import { Users } from 'lucide-react';
import { RandomGroup, SharedGroup } from '@/types';

interface RandomGroupsProps {
  displayResult: string | string[] | string[][] | RandomGroup[] | null;
  sharedGroups?: SharedGroup[];
}

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

  return (
    <div
      className="flex-1 w-full grid content-start overflow-y-auto custom-scrollbar pr-1 py-2"
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(min(130px, 28cqmin), 1fr))`,
        gap: 'min(8px, 2cqmin)',
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
            className="bg-blue-50 border border-blue-200 rounded-xl flex flex-col shadow-sm overflow-hidden"
            style={{ padding: 'min(8px, 2cqmin)' }}
          >
            <div
              className="uppercase text-brand-blue-primary tracking-widest opacity-80 font-black truncate"
              style={{
                fontSize: 'min(8px, 2cqmin)',
                marginBottom: 'min(4px, 1cqmin)',
              }}
              title={groupName}
            >
              {groupName}
            </div>
            <div
              className="overflow-hidden flex flex-col"
              style={{ gap: 'min(2px, 0.5cqmin)' }}
            >
              {groupNames.map((name, ni) => (
                <div
                  key={ni}
                  className="text-slate-700 font-bold whitespace-nowrap overflow-hidden text-ellipsis"
                  style={{ fontSize: 'min(12px, 3cqmin)' }}
                >
                  {name}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {showEmptyState && (
        <div
          className="col-span-full flex flex-col items-center justify-center text-slate-300 italic h-full font-bold"
          style={{
            padding: 'min(40px, 8cqmin) 0',
            gap: 'min(8px, 2cqmin)',
          }}
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
