// Accommodations tab (Modification groups flag): only the students and groups the teacher added, as hairline rows.
import React, { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Plus, Search, User, Users, X } from 'lucide-react';
import type { RosterGroup, Student, StudentOverride } from '@/types';
import { OverrideEditorRow } from '@/components/common/library/OverrideEditorRow';
import { usePickMenu } from '@/components/common/library/assignStepper/usePickMenu';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import {
  applyGroupOverride,
  isEmptyStudentOverride,
  setRosterDefaultOverride,
  sharedStudentOverride,
} from '@/utils/rosterDefaultOverrides';

export interface RosterAccommodationsListProps {
  students: Student[];
  groups: RosterGroup[];
  overrides: Record<string, StudentOverride>;
  readAloudAvailable: boolean;
  onChange: (overrides: Record<string, StudentOverride>) => void;
  onAddStudents: () => void;
}

const lastFirst = (s: Student) =>
  [s.lastName, s.firstName].filter(Boolean).join(', ') || s.id;
const byLastName = (a: Student, b: Student) =>
  lastFirst(a).localeCompare(lastFirst(b));
const canonical = (o: StudentOverride | undefined) => {
  const compact = setRosterDefaultOverride({}, 'x', o ?? {}).x ?? {};
  const entries: Array<[string, unknown]> = Object.entries(compact);
  return JSON.stringify(entries.sort(([a], [b]) => a.localeCompare(b)));
};
const sameOverride = (a: StudentOverride | undefined, b: StudentOverride) =>
  canonical(a) === canonical(b);
const countLabel = (n: number) => (n === 1 ? '1 student' : `${n} students`);

interface GroupRow {
  group: RosterGroup;
  memberIds: string[];
  shared: StudentOverride;
}

export const RosterAccommodationsList: React.FC<
  RosterAccommodationsListProps
> = ({
  students,
  groups,
  overrides,
  readAloudAvailable,
  onChange,
  onAddStudents,
}) => {
  const { t } = useTranslation();
  // Added this session but with nothing set yet; anyone with a setting is always listed.
  const [addedStudents, setAddedStudents] = useState<string[]>([]);
  const [addedGroups, setAddedGroups] = useState<string[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const sorted = useMemo(() => [...students].sort(byLastName), [students]);
  const allGroups: GroupRow[] = groups
    .map((group) => {
      const memberIds = sorted
        .filter((s) => group.studentIds.includes(s.id))
        .map((s) => s.id);
      return {
        group,
        memberIds,
        shared: sharedStudentOverride(overrides, memberIds),
      };
    })
    .filter((g) => g.memberIds.length > 0);
  const listedGroups = allGroups.filter(
    (g) => addedGroups.includes(g.group.id) || !isEmptyStudentOverride(g.shared)
  );
  // The settings a student gets from every listed group they belong to.
  const fromListedGroups = (id: string) =>
    listedGroups
      .filter((g) => g.memberIds.includes(id))
      .reduce<StudentOverride>((acc, g) => ({ ...acc, ...g.shared }), {});
  // A student whose settings are exactly their listed groups' shows under those groups only.
  const coveredByGroup = (id: string) => {
    const fromGroups = fromListedGroups(id);
    return (
      !isEmptyStudentOverride(fromGroups) &&
      sameOverride(overrides[id], fromGroups)
    );
  };
  const listedStudents = sorted.filter(
    (s) =>
      addedStudents.includes(s.id) ||
      (!isEmptyStudentOverride(overrides[s.id]) && !coveredByGroup(s.id))
  );
  const listedStudentIds = new Set(listedStudents.map((s) => s.id));
  const listedGroupIds = new Set(listedGroups.map((g) => g.group.id));

  const peersFor = (excludeIds: string[]) =>
    sorted
      .filter(
        (o) =>
          !excludeIds.includes(o.id) && !isEmptyStudentOverride(overrides[o.id])
      )
      .map((o) => ({
        id: o.id,
        name: lastFirst(o),
        override: overrides[o.id],
      }));

  // Removing a student's own row keeps the settings their listed groups give them.
  const removeStudent = (id: string) => {
    setAddedStudents((prev) => prev.filter((x) => x !== id));
    onChange(setRosterDefaultOverride(overrides, id, fromListedGroups(id)));
  };
  const removeGroup = (row: GroupRow) => {
    setAddedGroups((prev) => prev.filter((x) => x !== row.group.id));
    onChange(applyGroupOverride(overrides, row.memberIds, {}));
  };
  const toggleStudent = (id: string) => {
    if (listedStudentIds.has(id)) removeStudent(id);
    else {
      setAddedStudents((prev) => [...prev, id]);
      setOpenKey(`s:${id}`);
    }
  };
  const toggleGroup = (row: GroupRow) => {
    if (listedGroupIds.has(row.group.id)) removeGroup(row);
    else {
      setAddedGroups((prev) => [...prev, row.group.id]);
      setOpenKey(`g:${row.group.id}`);
    }
  };

  const removeButton = (
    label: string,
    onClick: () => void,
    fieldKey: string
  ) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      {...tourFieldAttr(
        'roster-editor.accommodations-remove',
        'roster-editor',
        fieldKey
      )}
      className="touch-target-expand shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  );

  const rowProps = {
    quizMode: true,
    allowWindowShift: false,
    readAloudAvailable,
    pageProtectionsAvailable: true,
    appearance: 'row' as const,
  };

  if (students.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
        <p className="text-sm font-semibold text-slate-600">
          {t('sidebar.classes.emptyAccommodationsTitle', {
            defaultValue: 'No students yet',
          })}
        </p>
        <button
          type="button"
          onClick={onAddStudents}
          {...tourAttr('roster-editor.accommodations-add-student')}
          className="text-sm font-bold text-brand-blue-primary hover:underline"
        >
          {t('sidebar.classes.addStudent', { defaultValue: 'Add Student' })}
        </button>
      </div>
    );
  }

  const empty = listedGroups.length === 0 && listedStudents.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className="text-xs text-slate-500">
          {t('sidebar.classes.accommodationsHelp', {
            defaultValue: 'These apply to every new assignment.',
          })}
        </p>
        <AddMenu
          students={sorted}
          groups={allGroups}
          listedStudentIds={listedStudentIds}
          listedGroupIds={listedGroupIds}
          onToggleStudent={toggleStudent}
          onToggleGroup={toggleGroup}
        />
      </div>
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto pb-4">
        {empty ? (
          <p className="py-6 text-center text-sm text-slate-500">
            {t('sidebar.classes.accommodationsEmpty', {
              defaultValue: 'No one has accommodations yet.',
            })}
          </p>
        ) : (
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {listedGroups.map((row) => {
              const key = `g:${row.group.id}`;
              return (
                <div
                  key={key}
                  {...tourFieldAttr(
                    'roster-editor.accommodations-group',
                    'roster-editor',
                    row.group.id
                  )}
                >
                  <OverrideEditorRow
                    {...rowProps}
                    studentName={`${row.group.name} (${countLabel(row.memberIds.length)})`}
                    override={row.shared}
                    peers={peersFor(row.memberIds)}
                    expanded={openKey === key}
                    onExpandedChange={(next) => setOpenKey(next ? key : null)}
                    onChange={(next) =>
                      onChange(
                        applyGroupOverride(overrides, row.memberIds, next)
                      )
                    }
                    trailing={removeButton(
                      `Remove ${row.group.name}`,
                      () => removeGroup(row),
                      `group-${row.group.id}`
                    )}
                  />
                </div>
              );
            })}
            {listedStudents.map((s) => {
              const key = `s:${s.id}`;
              return (
                <OverrideEditorRow
                  key={key}
                  {...rowProps}
                  studentName={lastFirst(s)}
                  override={overrides[s.id] ?? {}}
                  peers={peersFor([s.id])}
                  expanded={openKey === key}
                  onExpandedChange={(next) => setOpenKey(next ? key : null)}
                  onChange={(next) =>
                    onChange(setRosterDefaultOverride(overrides, s.id, next))
                  }
                  trailing={removeButton(
                    `Remove ${lastFirst(s)}`,
                    () => removeStudent(s.id),
                    `student-${s.id}`
                  )}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const AddMenu: React.FC<{
  students: Student[];
  groups: GroupRow[];
  listedStudentIds: Set<string>;
  listedGroupIds: Set<string>;
  onToggleStudent: (id: string) => void;
  onToggleGroup: (row: GroupRow) => void;
}> = ({
  students,
  groups,
  listedStudentIds,
  listedGroupIds,
  onToggleStudent,
  onToggleGroup,
}) => {
  const { open, setOpen, rootRef, onKeyDown } = usePickMenu();
  const menuId = useId();
  const [search, setSearch] = useState('');
  const q = search.trim().toLocaleLowerCase();
  const shownGroups = groups.filter(
    (g) => !q || g.group.name.toLocaleLowerCase().includes(q)
  );
  const shownStudents = students.filter(
    (s) => !q || lastFirst(s).toLocaleLowerCase().includes(q)
  );
  const sectionLabel =
    'px-2 pt-2 pb-0.5 text-xxs font-bold uppercase tracking-widest text-slate-400';

  return (
    <div ref={rootRef} className="relative shrink-0" onKeyDown={onKeyDown}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        {...tourAttr('roster-editor.accommodations-add')}
        className="touch-target-expand flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400"
      >
        <Plus className="h-3.5 w-3.5 text-slate-500" aria-hidden />
        Add
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden />
      </button>
      {open && (
        <div
          id={menuId}
          role="dialog"
          aria-label="Add students or groups"
          className="absolute left-0 top-full z-20 mt-1 w-[min(20rem,calc(100vw-3rem))] sm:left-auto sm:right-0 rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
        >
          <div className="m-1 flex h-8 items-center gap-2 rounded-lg border border-slate-200 px-2">
            <Search className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              aria-label="Search students and groups"
              {...tourAttr('roster-editor.accommodations-search')}
              className="min-w-0 flex-1 bg-transparent text-sm focus:outline-hidden"
            />
          </div>
          <div className="custom-scrollbar max-h-72 overflow-y-auto pb-1">
            {shownGroups.length > 0 && (
              <>
                <div className={sectionLabel}>Groups</div>
                {shownGroups.map((g) => (
                  <label
                    key={g.group.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={listedGroupIds.has(g.group.id)}
                      onChange={() => onToggleGroup(g)}
                      {...tourFieldAttr(
                        'roster-editor.accommodations-pick-group',
                        'roster-editor',
                        g.group.id
                      )}
                      className="h-4 w-4 rounded-sm accent-brand-blue-primary"
                    />
                    <Users
                      className="h-4 w-4 shrink-0 text-brand-blue-primary"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {g.group.name}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {g.memberIds.length}
                    </span>
                  </label>
                ))}
              </>
            )}
            {shownStudents.length > 0 && (
              <div className={sectionLabel}>Students</div>
            )}
            {shownStudents.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={listedStudentIds.has(s.id)}
                  onChange={() => onToggleStudent(s.id)}
                  {...tourFieldAttr(
                    'roster-editor.accommodations-pick-student',
                    'roster-editor',
                    s.id
                  )}
                  className="h-4 w-4 rounded-sm accent-brand-blue-primary"
                />
                <User className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{lastFirst(s)}</span>
              </label>
            ))}
            {shownGroups.length === 0 && shownStudents.length === 0 && (
              <p className="px-2 py-2 text-sm text-slate-500">No matches</p>
            )}
          </div>
          <div className="flex justify-end border-t border-slate-100 px-2 pb-0.5 pt-1.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              {...tourAttr('roster-editor.accommodations-done')}
              className="touch-target-expand rounded-md bg-brand-blue-primary px-3 py-1 text-xs font-bold text-white hover:bg-brand-blue-dark"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
