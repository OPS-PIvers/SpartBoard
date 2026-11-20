// Groups tab of Edit Class (class-groups-redesign): a group list, then one page per group with its students and accommodations.
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { RosterGroup, Student, StudentOverride } from '@/types';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { summarizeOverride } from '@/utils/studentOverrideSummary';
import {
  applyGroupOverride,
  sharedStudentOverride,
} from '@/utils/rosterDefaultOverrides';
import { SplitClassFooter } from './SplitClassFooter';
import { StandingAccommodationRules } from './StandingAccommodationRules';
import { ROW_BUTTON, lastFirst, sortByLastName } from './rosterGroupsShared';

export interface RosterGroupsPanelProps {
  groups: RosterGroup[];
  students: Student[];
  onChange: (groups: RosterGroup[]) => void;
  overrides: Record<string, StudentOverride>;
  onOverridesChange: (overrides: Record<string, StudentOverride>) => void;
  readAloudAvailable: boolean;
  speechToTextAvailable: boolean;
  onSharingChange?: (sharing: boolean) => void;
}

export const RosterGroupsPanel: React.FC<RosterGroupsPanelProps> = (props) => {
  const { groups, students, onChange, overrides } = props;
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const sorted = useMemo(() => sortByLastName(students), [students]);
  const open = groups.find((g) => g.id === openId);
  const intro = t('sidebar.classes.groupsIntro', {
    defaultValue:
      'Groups show up in every widget that picks students. A group can also share accommodations.',
  });

  const addGroup = () => {
    const group: RosterGroup = {
      id: crypto.randomUUID(),
      name: '',
      studentIds: [],
    };
    onChange([...groups, group]);
    setOpenId(group.id);
    setFreshId(group.id);
  };
  const patch = (id: string, change: Partial<RosterGroup>) =>
    onChange(groups.map((g) => (g.id === id ? { ...g, ...change } : g)));
  const remove = (id: string) => {
    onChange(groups.filter((g) => g.id !== id));
    if (openId === id) setOpenId(null);
  };

  if (open) {
    return (
      <GroupPage
        {...props}
        group={open}
        sorted={sorted}
        autoFocusName={freshId === open.id}
        onPatch={(change) => patch(open.id, change)}
        onDelete={() => remove(open.id)}
        onClose={() => setOpenId(null)}
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col border border-slate-200 rounded-xl bg-white overflow-y-auto scroll-inset">
      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center px-6 py-10 gap-3">
          <p className="font-bold text-slate-700">
            {t('sidebar.classes.emptyGroupsTitle', {
              defaultValue: 'No groups yet',
            })}
          </p>
          <p className="text-sm text-slate-500 max-w-sm">{intro}</p>
          <button
            onClick={addGroup}
            {...tourAttr('roster-groups.new')}
            className="mt-1 flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-brand-blue-primary rounded-lg hover:bg-brand-blue-dark transition-colors"
          >
            <Plus size={16} aria-hidden="true" />
            {t('sidebar.classes.addGroup', { defaultValue: 'New Group' })}
          </button>
        </div>
      ) : (
        <>
          <p className="px-4 py-3 border-b border-slate-200 text-sm text-slate-600">
            {intro}
          </p>
          <ul
            className="divide-y divide-slate-100"
            {...tourAttr('roster-groups.list')}
          >
            {groups.map((group, index) => (
              <GroupRow
                key={group.id}
                group={group}
                rowKey={`group-${index + 1}`}
                sorted={sorted}
                overrides={overrides}
                onEdit={() => setOpenId(group.id)}
                onDelete={() => remove(group.id)}
              />
            ))}
          </ul>
        </>
      )}
      <div className="mt-auto">
        <SplitClassFooter
          students={students}
          onAddGroups={(made) => onChange([...groups, ...made])}
          onNewGroup={groups.length > 0 ? addGroup : undefined}
        />
      </div>
    </div>
  );
};

const GroupName: React.FC<{ name: string }> = ({ name }) => {
  const { t } = useTranslation();
  return name.trim() ? (
    <span className="font-bold text-slate-800">{name}</span>
  ) : (
    <span className="font-bold italic text-slate-400">
      {t('sidebar.classes.unnamedGroup', { defaultValue: 'Unnamed group' })}
    </span>
  );
};

const GroupRow: React.FC<{
  group: RosterGroup;
  rowKey: string;
  sorted: Student[];
  overrides: Record<string, StudentOverride>;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ group, rowKey, sorted, overrides, onEdit, onDelete }) => {
  const { t } = useTranslation();
  const members = sorted.filter((s) => group.studentIds.includes(s.id));
  const accommodations = summarizeOverride(
    sharedStudentOverride(
      overrides,
      members.map((s) => s.id)
    ),
    t,
    { answerChoicesAsRule: true }
  );
  return (
    <li
      {...tourFieldAttr('roster-groups.row', 'roster-groups', rowKey)}
      className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 px-4 py-3"
    >
      {/* no-tour-anchor: the row's Edit button is the anchored control */}
      <button
        onClick={onEdit}
        className="flex-1 min-w-0 flex flex-col gap-0.5 text-left text-sm"
      >
        <span className="flex flex-wrap items-baseline gap-x-2">
          <GroupName name={group.name} />
          <span className="text-slate-500">
            {t('sidebar.classes.groupMemberCount', {
              count: members.length,
              defaultValue: '{{count}} student',
              defaultValue_other: '{{count}} students',
            })}
          </span>
        </span>
        <span className="text-slate-500">
          {members.length > 0
            ? members.map(lastFirst).join('; ')
            : t('sidebar.classes.noGroupMembers', {
                defaultValue: 'No students yet.',
              })}
        </span>
        <span className="text-slate-500">
          <span className="font-semibold text-slate-700">
            {t('sidebar.classes.accommodationsLabel', {
              defaultValue: 'Accommodations:',
            })}
          </span>{' '}
          {accommodations.length > 0
            ? accommodations.join(', ')
            : t('sidebar.classes.accommodationsNone', {
                defaultValue: 'None',
              })}
        </span>
      </button>
      <div className="flex gap-2">
        <button
          onClick={onEdit}
          {...tourFieldAttr('roster-groups.edit', 'roster-groups', rowKey)}
          className={`${ROW_BUTTON} hover:border-brand-blue-primary hover:text-brand-blue-primary`}
        >
          <Pencil size={14} aria-hidden="true" />
          {t('common.edit', { defaultValue: 'Edit' })}
        </button>
        <button
          onClick={onDelete}
          {...tourFieldAttr('roster-groups.remove', 'roster-groups', rowKey)}
          className={`${ROW_BUTTON} hover:border-red-300 hover:text-red-600`}
        >
          <Trash2 size={14} aria-hidden="true" />
          {t('common.delete', { defaultValue: 'Delete' })}
        </button>
      </div>
    </li>
  );
};

const SECTION_LABEL = 'text-xs font-bold text-slate-600';

const GroupPage: React.FC<
  RosterGroupsPanelProps & {
    group: RosterGroup;
    sorted: Student[];
    autoFocusName: boolean;
    onPatch: (change: Partial<RosterGroup>) => void;
    onDelete: () => void;
    onClose: () => void;
  }
> = ({
  group,
  sorted,
  autoFocusName,
  onPatch,
  onDelete,
  onClose,
  overrides,
  onOverridesChange,
  readAloudAvailable,
  speechToTextAvailable,
  onSharingChange,
}) => {
  const { t } = useTranslation();
  const latest = useRef(overrides);
  useLayoutEffect(() => {
    latest.current = overrides;
  });
  const memberIds = sorted
    .filter((s) => group.studentIds.includes(s.id))
    .map((s) => s.id);
  const shared = sharedStudentOverride(overrides, memberIds);
  const updateShared = (fn: (prev: StudentOverride) => StudentOverride) => {
    const cur = latest.current;
    const next = applyGroupOverride(
      cur,
      memberIds,
      fn(sharedStudentOverride(cur, memberIds))
    );
    latest.current = next;
    onOverridesChange(next);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col border border-slate-200 rounded-xl bg-white">
      <div className="flex items-center px-3 py-2 border-b border-slate-200">
        <button
          onClick={onClose}
          {...tourAttr('roster-groups.back')}
          className="flex items-center gap-1 min-h-9 px-2 text-sm font-semibold text-slate-600 hover:text-brand-blue-primary rounded-lg transition-colors"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          {t('sidebar.classes.allGroups', { defaultValue: 'All groups' })}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-inset p-4 pb-6 flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-48 flex flex-col gap-1.5">
            <span className={SECTION_LABEL}>
              {t('sidebar.classes.groupNameLabel', {
                defaultValue: 'Group name',
              })}
            </span>
            <input
              value={group.name}
              autoFocus={autoFocusName}
              onChange={(e) => onPatch({ name: e.target.value })}
              {...tourAttr('roster-groups.name')}
              className="px-3 py-2 text-sm font-bold rounded-lg border border-slate-200 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-hidden"
            />
          </label>
          <button
            onClick={onDelete}
            {...tourAttr('roster-groups.delete')}
            className={`${ROW_BUTTON} min-h-[38px] hover:border-red-300 hover:text-red-600`}
          >
            <Trash2 size={15} aria-hidden="true" />
            {t('sidebar.classes.deleteGroup', {
              defaultValue: 'Delete group',
            })}
          </button>
        </div>
        <MemberChecklist
          sorted={sorted}
          selected={group.studentIds}
          onChange={(studentIds) => onPatch({ studentIds })}
        />
        <div className="flex flex-col gap-2 border-t border-slate-200 pt-4">
          <span className={SECTION_LABEL}>
            {t('sidebar.classes.accommodationsHeading', {
              defaultValue: 'Accommodations',
            })}
          </span>
          {memberIds.length > 0 ? (
            <>
              <p className="text-sm text-slate-600">
                {t('sidebar.classes.groupAccommodationsHelp', {
                  defaultValue: 'These apply to every student in this group.',
                })}
              </p>
              <StandingAccommodationRules
                override={shared}
                onUpdate={updateShared}
                readAloudAvailable={readAloudAvailable}
                speechToTextAvailable={speechToTextAvailable}
                onSharingChange={onSharingChange}
              />
            </>
          ) : (
            <p className="text-sm text-slate-500">
              {t('sidebar.classes.groupAccommodationsEmpty', {
                defaultValue: 'Add students to set accommodations.',
              })}
            </p>
          )}
        </div>
      </div>
      <div className="flex justify-center px-3 py-3 border-t border-slate-200">
        <button
          onClick={onClose}
          {...tourAttr('roster-groups.done')}
          className="min-w-32 px-5 py-2 text-sm font-bold text-white bg-brand-blue-primary rounded-lg hover:bg-brand-blue-dark transition-colors"
        >
          {t('common.done', { defaultValue: 'Done' })}
        </button>
      </div>
    </div>
  );
};

const MemberChecklist: React.FC<{
  sorted: Student[];
  selected: string[];
  onChange: (ids: string[]) => void;
}> = ({ sorted, selected, onChange }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const chosen = new Set(selected);
  const q = query.trim().toLowerCase();
  const shown = q
    ? sorted.filter((s) => lastFirst(s).toLowerCase().includes(q))
    : sorted;
  const count = sorted.filter((s) => chosen.has(s.id)).length;
  const toggle = (id: string) =>
    onChange(
      chosen.has(id) ? selected.filter((x) => x !== id) : [...selected, id]
    );
  const searchLabel = t('sidebar.classes.searchStudents', {
    defaultValue: 'Search students',
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={SECTION_LABEL}>
          {t('sidebar.classes.groupStudents', { defaultValue: 'Students' })}
        </span>
        <span className="text-xs text-slate-500">
          {t('sidebar.classes.groupSelectedCount', {
            defaultValue: '{{count}} of {{total}} selected',
            count,
            total: sorted.length,
          })}
        </span>
        {sorted.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                size={14}
                aria-hidden="true"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={searchLabel}
                placeholder={searchLabel}
                {...tourAttr('roster-groups.search')}
                className="w-48 pl-8 pr-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-hidden"
              />
            </div>
            <button
              onClick={() =>
                onChange([
                  ...selected,
                  ...shown.map((s) => s.id).filter((id) => !chosen.has(id)),
                ])
              }
              {...tourAttr('roster-groups.select-all')}
              className={`${ROW_BUTTON} hover:border-brand-blue-primary hover:text-brand-blue-primary`}
            >
              {t('sidebar.classes.selectAll', { defaultValue: 'Select all' })}
            </button>
            <button
              onClick={() => {
                const hide = new Set(shown.map((s) => s.id));
                onChange(selected.filter((id) => !hide.has(id)));
              }}
              {...tourAttr('roster-groups.clear')}
              className={`${ROW_BUTTON} hover:border-brand-blue-primary hover:text-brand-blue-primary`}
            >
              {t('sidebar.classes.clearSelection', { defaultValue: 'Clear' })}
            </button>
          </div>
        )}
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-slate-500">
          {t('sidebar.classes.noStudentsToGroup', {
            defaultValue: 'Add students first.',
          })}
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-x-4 border-t border-slate-200">
          {shown.map((s) => (
            <li key={s.id} className="border-b border-slate-100">
              <label className="flex items-center gap-2.5 min-h-10 px-1 text-sm text-slate-700 cursor-pointer">
                {/* no-tour-anchor: one checkbox per student, generated */}
                <input
                  type="checkbox"
                  checked={chosen.has(s.id)}
                  onChange={() => toggle(s.id)}
                  className="w-4 h-4 rounded-sm border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40"
                />
                <span className="min-w-0 break-words">{lastFirst(s)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
