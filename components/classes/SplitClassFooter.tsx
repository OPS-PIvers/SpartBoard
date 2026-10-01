import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Shuffle } from 'lucide-react';
import type { RosterGroup, Student } from '@/types';
import { makeRestrictedGroupsByCount } from '@/components/widgets/random/groupMaker';

interface SplitClassFooterProps {
  students: Student[];
  onAddGroups: (groups: RosterGroup[]) => void;
  /** Omitted while the empty state already carries the New group button. */
  onNewGroup?: () => void;
}

/** Sticky footer of the Groups tab: New group, and Split class into N groups. */
export const SplitClassFooter: React.FC<SplitClassFooterProps> = ({
  students,
  onAddGroups,
  onNewGroup,
}) => {
  const { t } = useTranslation();
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitCount, setSplitCount] = useState(4);
  const [splitName, setSplitName] = useState('');

  // Dated so six rounds of "Team 1" stay tellable apart in the picker.
  const defaultSplitName = () =>
    `${t('sidebar.classes.splitNamePrefix', { defaultValue: 'Teams' })} – ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  const openSplit = () => {
    setSplitName(defaultSplitName());
    setSplitCount(Math.min(4, Math.max(2, students.length)));
    setSplitOpen(true);
  };

  const runSplit = () => {
    const base = splitName.trim() || defaultSplitName();
    const count = Math.max(2, Math.min(students.length, splitCount));
    // Restriction-aware rather than a plain shuffle, so a split honors the
    // keep-apart pairs the Students tab already records.
    const made = makeRestrictedGroupsByCount(students, count);
    onAddGroups(
      made.groups.map((g, i) => ({
        id: g.id ?? crypto.randomUUID(),
        name: `${base} (${i + 1})`,
        studentIds: g.studentIds ?? [],
      }))
    );
    setSplitOpen(false);
  };

  return (
    <div className="p-3 sticky bottom-0 bg-slate-50/80 backdrop-blur-sm border-t border-slate-200">
      {splitOpen ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label
              className="text-xs font-bold text-slate-600 shrink-0"
              htmlFor="roster-split-count"
            >
              {t('sidebar.classes.splitCountLabel', {
                defaultValue: 'Groups',
              })}
            </label>
            <input
              id="roster-split-count"
              type="number"
              min={2}
              max={Math.max(2, students.length)}
              value={splitCount}
              onChange={(e) => setSplitCount(Number(e.target.value))}
              onKeyDown={(e) => e.key === 'Enter' && runSplit()}
              className="w-16 px-2 py-1 text-sm rounded-md border border-slate-300 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-none"
            />
            <input
              aria-label={t('sidebar.classes.splitNameLabel', {
                defaultValue: 'Group name',
              })}
              value={splitName}
              onChange={(e) => setSplitName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSplit()}
              className="flex-1 min-w-0 px-2 py-1 text-sm rounded-md border border-slate-300 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSplitOpen(false)}
              className="flex-1 px-3 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button
              onClick={runSplit}
              className="flex-1 px-3 py-2 text-sm font-bold text-white bg-brand-blue-primary rounded-lg hover:bg-brand-blue-dark transition-colors"
            >
              {t('sidebar.classes.splitConfirm', {
                defaultValue: 'Create groups',
              })}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          {onNewGroup && (
            <button
              onClick={onNewGroup}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-bold text-brand-blue-primary bg-white border border-dashed border-slate-300 rounded-lg hover:border-brand-blue-primary hover:bg-brand-blue-lighter transition-colors"
            >
              <Plus size={16} />
              {t('sidebar.classes.addGroup', { defaultValue: '+ New Group' })}
            </button>
          )}
          <button
            onClick={openSplit}
            disabled={students.length < 2}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-bold text-brand-blue-primary bg-white border border-dashed border-slate-300 rounded-lg hover:border-brand-blue-primary hover:bg-brand-blue-lighter transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-300 disabled:hover:bg-white"
          >
            <Shuffle size={16} />
            {t('sidebar.classes.splitClass', {
              defaultValue: 'Split class',
            })}
          </button>
        </div>
      )}
    </div>
  );
};
