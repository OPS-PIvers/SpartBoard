// Accommodations tab of Edit Class (class-groups-redesign): every student, with what their groups give and what is their own.
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Pencil } from 'lucide-react';
import type { RosterGroup, Student, StudentOverride } from '@/types';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { summarizeOverride } from '@/utils/studentOverrideSummary';
import { setRosterDefaultOverride } from '@/utils/rosterDefaultOverrides';
import {
  groupAccommodations,
  studentAccommodationSources,
  type StudentAccommodationSources,
} from '@/utils/rosterAccommodationSources';
import { StandingAccommodationRules } from './StandingAccommodationRules';
import { ROW_BUTTON, lastFirst, sortByLastName } from './rosterGroupsShared';

export interface RosterAccommodationsByStudentProps {
  students: Student[];
  groups: RosterGroup[];
  overrides: Record<string, StudentOverride>;
  readAloudAvailable: boolean;
  speechToTextAvailable: boolean;
  onChange: React.Dispatch<
    React.SetStateAction<Record<string, StudentOverride>>
  >;
  onAddStudents: () => void;
  onSharingChange?: (sharing: boolean) => void;
}

const COLUMNS =
  'grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)_auto]';

const Sources: React.FC<{ sources: StudentAccommodationSources }> = ({
  sources,
}) => {
  const { t } = useTranslation();
  const text = (o: StudentOverride) =>
    summarizeOverride(o, t, { answerChoicesAsRule: true }).join(', ');
  const own = text(sources.own);
  const fromGroups = sources.fromGroups
    .map((g) => ({
      id: g.group.id,
      name: g.group.name,
      text: text(g.override),
    }))
    .filter((g) => g.text);
  if (fromGroups.length === 0 && !own) {
    return (
      <span className="block text-sm text-slate-500">
        {t('sidebar.classes.accommodationsNone', { defaultValue: 'None' })}
      </span>
    );
  }
  return (
    <>
      {fromGroups.map((g) => (
        <span key={g.id} className="block text-sm text-slate-500">
          <span className="font-semibold text-slate-700">
            {t('sidebar.classes.fromGroup', {
              defaultValue: 'From {{group}}:',
              group: g.name,
            })}
          </span>{' '}
          {g.text}
        </span>
      ))}
      {own && (
        <span className="block text-sm text-slate-500">
          <span className="font-semibold text-slate-700">
            {t('sidebar.classes.ownAccommodations', { defaultValue: 'Own:' })}
          </span>{' '}
          {own}
        </span>
      )}
    </>
  );
};

export const RosterAccommodationsByStudent: React.FC<
  RosterAccommodationsByStudentProps
> = ({
  students,
  groups,
  overrides,
  readAloudAvailable,
  speechToTextAvailable,
  onChange,
  onAddStudents,
  onSharingChange,
}) => {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  const sorted = useMemo(() => sortByLastName(students), [students]);
  const groupInfos = groupAccommodations(groups, sorted, overrides);
  const sourcesFor = (id: string) =>
    studentAccommodationSources(id, groupInfos, overrides);
  const open = sorted.find((s) => s.id === openId);

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

  if (open) {
    const id = open.id;
    const update = (fn: (prev: StudentOverride) => StudentOverride) =>
      onChange((cur) => setRosterDefaultOverride(cur, id, fn(cur[id] ?? {})));
    return (
      <div className="flex-1 min-h-0 flex flex-col border border-slate-200 rounded-xl bg-white">
        <div className="flex items-center px-3 py-2 border-b border-slate-200 bg-slate-50 rounded-t-xl">
          <button
            onClick={() => setOpenId(null)}
            {...tourAttr('roster-accommodations.back')}
            className="flex items-center gap-1 min-h-9 px-2 text-sm font-semibold text-slate-600 hover:text-brand-blue-primary rounded-lg transition-colors"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            {t('sidebar.classes.allStudents', {
              defaultValue: 'All students',
            })}
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scroll-inset pb-6">
          <div className="px-4 py-2 bg-slate-100 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-800">
              {lastFirst(open)}
            </h3>
          </div>
          <div className="px-4 py-3">
            <StandingAccommodationRules
              override={overrides[open.id] ?? {}}
              onUpdate={update}
              readAloudAvailable={readAloudAvailable}
              speechToTextAvailable={speechToTextAvailable}
              onSharingChange={onSharingChange}
            />
          </div>
        </div>
        <div className="flex justify-center px-3 py-3 border-t border-slate-200">
          <button
            onClick={() => setOpenId(null)}
            {...tourAttr('roster-accommodations.done')}
            className="min-w-32 px-5 py-2 text-sm font-bold text-white bg-brand-blue-primary rounded-lg hover:bg-brand-blue-dark transition-colors"
          >
            {t('common.done', { defaultValue: 'Done' })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col border border-slate-200 rounded-xl bg-white">
      <p className="px-4 py-3 bg-slate-50 border-b border-slate-200 rounded-t-xl text-sm text-slate-600">
        {t('sidebar.classes.accommodationsStacking', {
          defaultValue:
            "A group's accommodations apply to every student in it. A student's own accommodations add to them.",
        })}
      </p>
      <div
        className={`hidden sm:grid ${COLUMNS} gap-x-4 px-4 py-2 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-600`}
      >
        <span>
          {t('sidebar.classes.colStudent', { defaultValue: 'Student' })}
        </span>
        <span>
          {t('sidebar.classes.accommodationsHeading', {
            defaultValue: 'Accommodations',
          })}
        </span>
        <span />
      </div>
      <ul
        className="flex-1 min-h-0 overflow-y-auto scroll-inset pb-6 divide-y divide-slate-200"
        {...tourAttr('roster-accommodations.list')}
      >
        {sorted.map((s, index) => (
          <li
            key={s.id}
            className={`grid ${COLUMNS} items-start gap-x-4 gap-y-1 px-4 py-2.5`}
          >
            <span className="row-start-1 col-start-1 text-sm font-bold text-slate-800">
              {lastFirst(s)}
            </span>
            <span className="row-start-2 col-span-2 sm:row-start-1 sm:col-span-1 sm:col-start-2">
              <Sources sources={sourcesFor(s.id)} />
            </span>
            <button
              onClick={() => setOpenId(s.id)}
              aria-label={t('sidebar.classes.editStudentAccommodations', {
                defaultValue: 'Edit accommodations for {{name}}',
                name: lastFirst(s),
              })}
              {...tourFieldAttr(
                'roster-accommodations.edit',
                'roster-accommodations',
                `row-${index + 1}`
              )}
              className={`${ROW_BUTTON} row-start-1 col-start-2 sm:col-start-3 hover:border-brand-blue-primary hover:text-brand-blue-primary`}
            >
              <Pencil size={14} aria-hidden="true" />
              {t('common.edit', { defaultValue: 'Edit' })}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
