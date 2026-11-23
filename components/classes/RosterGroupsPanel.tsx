// Groups tab of Edit Class: a group list, then one page per group with its students and accommodations.
import React, { useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { RosterGroup, Student, StudentOverride } from '@/types';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { summarizeOverride } from '@/utils/studentOverrideSummary';
import {
  applyGroupOverride,
  sharedStudentOverride,
} from '@/utils/rosterDefaultOverrides';
import {
  applyGroupMembershipChange,
  groupAccommodations,
  groupSharedOverride,
} from '@/utils/rosterAccommodationSources';
import { SplitClassFooter } from './SplitClassFooter';
import { StandingAccommodationRules } from './StandingAccommodationRules';
import { DialogContext } from '@/context/DialogContextValue';
import { Toggle } from '@/components/common/Toggle';
import { ROW_BUTTON, lastFirst, sortByLastName } from './rosterGroupsShared';

export interface RosterGroupsPanelProps {
  groups: RosterGroup[];
  students: Student[];
  onChange: (groups: RosterGroup[]) => void;
  overrides: Record<string, StudentOverride>;
  onOverridesChange: React.Dispatch<
    React.SetStateAction<Record<string, StudentOverride>>
  >;
  readAloudAvailable: boolean;
  speechToTextAvailable: boolean;
  onSharingChange?: (sharing: boolean) => void;
}

/** Joiners get the group's settings; leavers lose them unless another of their groups gives the same. */
const withMembership = (
  cur: Record<string, StudentOverride>,
  groups: RosterGroup[],
  sorted: Student[],
  group: RosterGroup,
  studentIds: string[]
): Record<string, StudentOverride> => {
  const onRoster = new Set(sorted.map((s) => s.id));
  const before = group.studentIds.filter((id) => onRoster.has(id));
  const added = studentIds.filter(
    (id) => onRoster.has(id) && !before.includes(id)
  );
  const others = groupAccommodations(
    groups.filter((g) => g.id !== group.id),
    sorted,
    cur
  );
  const removed = before
    .filter((id) => !studentIds.includes(id))
    .map((id) => ({
      id,
      keptByOtherGroups: others
        .filter((g) => g.memberIds.includes(id))
        .reduce<StudentOverride>((acc, g) => ({ ...acc, ...g.shared }), {}),
    }));
  return applyGroupMembershipChange(
    cur,
    groupSharedOverride(cur, before),
    added,
    removed
  );
};

/** Asks first when leaving would take settings off a student, since a setting they were given on their own looks the same as the group's. */
const useConfirmedMembership = () => {
  const { t } = useTranslation();
  const dialog = useContext(DialogContext);
  return (
    cur: Record<string, StudentOverride>,
    groups: RosterGroup[],
    sorted: Student[],
    group: RosterGroup,
    studentIds: string[]
  ): boolean | Promise<boolean> => {
    const next = withMembership(cur, groups, sorted, group, studentIds);
    const loses = group.studentIds.some(
      (id) =>
        !studentIds.includes(id) &&
        JSON.stringify(next[id]) !== JSON.stringify(cur[id])
    );
    if (!loses || !dialog) return true;
    return dialog.showConfirm(
      t('sidebar.classes.groupLeaveConfirm', {
        defaultValue:
          'Students who leave this group lose its settings. This includes settings you gave them yourself. Continue?',
      })
    );
  };
};

export const RosterGroupsPanel: React.FC<RosterGroupsPanelProps> = (props) => {
  const { groups, students, onChange, overrides, onOverridesChange } = props;
  const { t } = useTranslation();
  const confirmMembership = useConfirmedMembership();
  const [openId, setOpenId] = useState<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const sorted = useMemo(() => sortByLastName(students), [students]);
  const open = groups.find((g) => g.id === openId);
  const intro = t('sidebar.classes.groupsIntro', {
    defaultValue:
      'A group can show up in widgets that pick students. It can also share accommodations.',
  });

  const addGroup = () => {
    const group: RosterGroup = {
      id: crypto.randomUUID(),
      name: '',
      studentIds: [],
      // Hidden from board widgets until the teacher turns it on, so a support group's name stays private.
      inGroupMaker: false,
    };
    onChange([...groups, group]);
    setOpenId(group.id);
    setFreshId(group.id);
  };
  const patch = (id: string, change: Partial<RosterGroup>) =>
    onChange(groups.map((g) => (g.id === id ? { ...g, ...change } : g)));
  const remove = (id: string) => {
    const gone = groups.find((g) => g.id === id);
    const apply = () => {
      if (gone)
        onOverridesChange((cur) =>
          withMembership(cur, groups, sorted, gone, [])
        );
      onChange(groups.filter((g) => g.id !== id));
      if (openId === id) setOpenId(null);
    };
    const ok = gone
      ? confirmMembership(overrides, groups, sorted, gone, [])
      : true;
    if (typeof ok === 'boolean') {
      if (ok) apply();
    } else void ok.then((yes) => yes && apply());
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
    <div className="flex-1 min-h-0 flex flex-col border border-slate-200 rounded-xl bg-white overflow-hidden">
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto scroll-inset pb-4">
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
            <p className="px-4 py-3 bg-slate-50 border-b border-slate-200 rounded-t-xl text-sm text-slate-600">
              {intro}
            </p>
            <ul
              className="divide-y divide-slate-200"
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
      </div>
      <div className="shrink-0">
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
    <span className="text-base font-bold text-slate-900">{name}</span>
  ) : (
    <span className="text-base font-bold italic text-slate-400">
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
    groupSharedOverride(
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
            {t('sidebar.classes.widgetsLabel', { defaultValue: 'Widgets:' })}
          </span>{' '}
          {group.inGroupMaker === false
            ? t('sidebar.classes.widgetsHidden', { defaultValue: 'Hidden' })
            : t('sidebar.classes.widgetsShown', { defaultValue: 'Shown' })}
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

/** A titled band over a block of the group page, so each part reads apart from the next. */
const Section: React.FC<{
  title: string;
  detail?: string;
  first?: boolean;
  children: React.ReactNode;
}> = ({ title, detail, first, children }) => (
  <section>
    <div
      className={`flex flex-wrap items-baseline gap-x-2 px-4 py-2 bg-slate-100 border-b border-slate-200 ${first ? '' : 'border-t'}`}
    >
      <h4 className="text-sm font-bold text-slate-800">{title}</h4>
      {detail && <span className="text-sm text-slate-500">{detail}</span>}
    </div>
    <div className="px-4 py-3">{children}</div>
  </section>
);

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
  groups,
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
  const confirmMembership = useConfirmedMembership();
  const memberIds = sorted
    .filter((s) => group.studentIds.includes(s.id))
    .map((s) => s.id);
  const showLabel = t('sidebar.classes.showInWidgets', {
    defaultValue: 'Show in widgets',
  });
  const shared = sharedStudentOverride(overrides, memberIds);
  const changeMembers = (studentIds: string[]) => {
    const apply = () => {
      onOverridesChange((cur) =>
        withMembership(cur, groups, sorted, group, studentIds)
      );
      onPatch({ studentIds });
    };
    const ok = confirmMembership(overrides, groups, sorted, group, studentIds);
    if (typeof ok === 'boolean') {
      if (ok) apply();
    } else void ok.then((yes) => yes && apply());
  };
  const updateShared = (fn: (prev: StudentOverride) => StudentOverride) =>
    onOverridesChange((cur) =>
      applyGroupOverride(
        cur,
        memberIds,
        fn(sharedStudentOverride(cur, memberIds))
      )
    );

  return (
    <div className="flex-1 min-h-0 flex flex-col border border-slate-200 rounded-xl bg-white">
      <div className="flex items-center px-3 py-2 border-b border-slate-200 bg-slate-50 rounded-t-xl">
        <button
          onClick={onClose}
          {...tourAttr('roster-groups.back')}
          className="flex items-center gap-1 min-h-9 px-2 text-sm font-semibold text-slate-600 hover:text-brand-blue-primary rounded-lg transition-colors"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          {t('sidebar.classes.allGroups', { defaultValue: 'All groups' })}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-inset pb-6">
        <Section
          title={t('sidebar.classes.groupNameLabel', {
            defaultValue: 'Group name',
          })}
          first
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={group.name}
              autoFocus={autoFocusName}
              aria-label={t('sidebar.classes.groupNameLabel', {
                defaultValue: 'Group name',
              })}
              onChange={(e) => onPatch({ name: e.target.value })}
              {...tourAttr('roster-groups.name')}
              className="flex-1 min-w-48 px-3 py-2 text-sm font-bold rounded-lg border border-slate-300 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 outline-hidden"
            />
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
        </Section>
        <Section
          title={t('sidebar.classes.groupStudents', {
            defaultValue: 'Students',
          })}
          detail={t('sidebar.classes.groupSelectedCount', {
            defaultValue: '{{count}} of {{total}} selected',
            count: memberIds.length,
            total: sorted.length,
          })}
        >
          <MemberChecklist
            sorted={sorted}
            selected={group.studentIds}
            onChange={changeMembers}
          />
        </Section>
        <Section
          title={t('sidebar.classes.widgetsHeading', {
            defaultValue: 'Widgets',
          })}
        >
          <div className="flex items-center justify-between gap-4 min-h-9">
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-slate-800">
                {showLabel}
              </span>
              <span className="text-sm text-slate-500">
                {t('sidebar.classes.showInWidgetsHint', {
                  defaultValue: 'Students can see the group name on the board.',
                })}
              </span>
            </span>
            <Toggle
              checked={group.inGroupMaker !== false}
              onChange={(on) => onPatch({ inGroupMaker: on })}
              label={showLabel}
              anchor={tourAttr('roster-groups.show-in-widgets')}
            />
          </div>
        </Section>
        <Section
          title={t('sidebar.classes.accommodationsHeading', {
            defaultValue: 'Accommodations',
          })}
          detail={
            memberIds.length > 0
              ? t('sidebar.classes.groupAccommodationsHelp', {
                  defaultValue: 'These apply to every student in this group.',
                })
              : undefined
          }
        >
          {memberIds.length > 0 ? (
            <StandingAccommodationRules
              override={shared}
              onUpdate={updateShared}
              readAloudAvailable={readAloudAvailable}
              speechToTextAvailable={speechToTextAvailable}
              onSharingChange={onSharingChange}
            />
          ) : (
            <p className="text-sm text-slate-500">
              {t('sidebar.classes.groupAccommodationsEmpty', {
                defaultValue: 'Add students to set accommodations.',
              })}
            </p>
          )}
        </Section>
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
        {sorted.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
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
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-x-3 gap-y-px">
          {shown.map((s) => (
            <li key={s.id} className="border-b border-slate-200">
              <label
                className={`flex items-center gap-2.5 min-h-10 px-2 text-sm cursor-pointer hover:bg-slate-50 ${chosen.has(s.id) ? 'bg-brand-blue-lighter/60 font-semibold text-brand-blue-dark' : 'text-slate-700'}`}
              >
                {/* no-tour-anchor: one checkbox per student, generated */}
                <input
                  type="checkbox"
                  checked={chosen.has(s.id)}
                  onChange={() => toggle(s.id)}
                  className="h-4 w-4 shrink-0 rounded-sm accent-brand-blue-primary"
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
