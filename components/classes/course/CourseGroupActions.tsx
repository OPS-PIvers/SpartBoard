// Link, unlink and rename: the Edit Course button on a linked Course and the inline editor it opens (D4, D5).
import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { useDashboard } from '@/context/useDashboard';
import { logError } from '@/utils/logError';
import {
  COURSE_MAX_CLASSES,
  COURSE_MAX_NAME_LENGTH,
  type Course,
} from '@/utils/course/contract';
import { courseEditRequests } from '@/utils/course/courseEditRequests';
import type { CourseGroup } from '@/utils/course/courseGroups';
import type { CourseGroupProps, CourseRoster } from './types';

export interface CourseEditButtonProps {
  rowKey: string;
  courseName: string;
  open: boolean;
  onClick: () => void;
}

export const CourseEditButton: React.FC<CourseEditButtonProps> = ({
  rowKey,
  courseName,
  open,
  onClick,
}) => {
  const { t } = useTranslation();
  const label = t('course.linking.editCourse', {
    defaultValue: 'Edit Course',
  });
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-expanded={open}
        aria-label={`${label}: ${courseName}`}
        title={label}
        {...tourFieldAttr('classes.course-edit', 'classes', rowKey)}
        className="shrink-0 p-1.5 text-slate-400 hover:text-brand-blue-primary hover:bg-brand-blue-lighter rounded-lg transition-colors"
      >
        <Pencil className="w-4 h-4" />
      </button>
      {/* Lines the pencil up with the class rows' pencil, which sits left of their menu. */}
      <span className="w-7 shrink-0" aria-hidden="true" />
    </>
  );
};

export interface CourseEditorProps {
  groups: readonly CourseGroup<CourseRoster>[];
  /** Null links classes into a new Course. */
  course: Course | null;
  initialName?: string;
  initialSelected?: readonly string[];
  saveCourse: CourseGroupProps['saveCourse'];
  onDone: () => void;
}

export const CourseEditor: React.FC<CourseEditorProps> = ({
  groups,
  course,
  initialName,
  initialSelected,
  saveCourse,
  onDone,
}) => {
  const { t } = useTranslation();
  const { addToast } = useDashboard();
  const nameId = useId();
  const [name, setName] = useState(initialName ?? course?.name ?? '');
  const [selected, setSelected] = useState<string[]>(() => [
    ...(initialSelected ?? course?.rosterIds ?? []),
  ]);
  const [saving, setSaving] = useState(false);

  const rows = groups.flatMap((g) =>
    g.rosters.map((r) => ({
      roster: r,
      otherCourse:
        g.course && g.rosters.length > 1 && g.course.id !== course?.id
          ? g.course.name
          : null,
    }))
  );
  const visible = new Set(rows.map((r) => r.roster.id));
  const picked = selected.filter((id) => visible.has(id));
  const trimmed = name.trim();
  const minClasses = course ? 1 : 2;
  const canSave =
    !saving &&
    trimmed.length > 0 &&
    picked.length >= minClasses &&
    picked.length <= COURSE_MAX_CLASSES;

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleSave = async () => {
    if (!canSave) return;
    // Classes deleted since the editor opened are dropped by the server; keep them in the Course.
    const kept = course
      ? [...picked, ...course.rosterIds.filter((id) => !visible.has(id))]
      : picked;
    const requests = courseEditRequests(groups, course, trimmed, kept);
    if (requests.length === 0) {
      onDone();
      return;
    }
    setSaving(true);
    try {
      for (const request of requests) await saveCourse(request);
      addToast(
        course
          ? t('course.linking.saved', { defaultValue: 'Course saved' })
          : t('course.linking.linked', { defaultValue: 'Classes linked' }),
        'success'
      );
      onDone();
    } catch (err) {
      logError('CourseEditor.save', err);
      addToast(
        err instanceof Error && err.message
          ? err.message
          : t('course.linking.saveFailed', {
              defaultValue: 'Couldn’t save the Course. Try again.',
            }),
        'error'
      );
      setSaving(false);
    }
  };

  return (
    <div
      className="space-y-3 border-t border-slate-200 bg-slate-50 px-3 py-3"
      role="group"
      aria-label={
        course
          ? t('course.linking.editCourse', { defaultValue: 'Edit Course' })
          : t('course.linking.linkClasses', { defaultValue: 'Link classes' })
      }
    >
      <div className="space-y-1">
        <label
          htmlFor={nameId}
          className="block text-xxs font-bold text-slate-500 uppercase tracking-widest"
        >
          {t('course.linking.nameLabel', { defaultValue: 'Course name' })}
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          maxLength={COURSE_MAX_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
          {...tourAttr('classes.course-name')}
          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-none focus:ring-1 focus:ring-brand-blue-primary"
        />
      </div>
      <fieldset className="space-y-1">
        <legend className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
          {t('course.linking.classesLabel', { defaultValue: 'Classes' })}
        </legend>
        <ul className="max-h-64 overflow-y-auto divide-y divide-slate-200 border-y border-slate-200 bg-white">
          {rows.map(({ roster, otherCourse }, i) => {
            const id = `${nameId}-r-${roster.id}`;
            return (
              <li
                key={roster.id}
                className="flex items-start gap-2 px-2 py-1.5"
              >
                <input
                  id={id}
                  type="checkbox"
                  checked={selected.includes(roster.id)}
                  disabled={saving}
                  onChange={() => toggle(roster.id)}
                  {...tourFieldAttr(
                    'classes.course-class',
                    'course-editor',
                    `row-${i + 1}`
                  )}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-brand-blue-primary"
                />
                <label htmlFor={id} className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug text-slate-800 wrap-anywhere">
                    {roster.name}
                  </span>
                  {otherCourse && (
                    <span className="block text-xxs text-slate-400">
                      {t('course.linking.inCourse', {
                        defaultValue: 'In {{name}}',
                        name: otherCourse,
                      })}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          disabled={saving}
          {...tourAttr('classes.course-cancel')}
          className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
        >
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave}
          {...tourAttr('classes.course-save')}
          className="px-3 py-1.5 rounded-lg bg-brand-blue-primary text-xs font-bold text-white hover:bg-brand-blue-dark transition-colors disabled:opacity-50"
        >
          {course
            ? t('common.save', { defaultValue: 'Save' })
            : t('course.linking.link', { defaultValue: 'Link' })}
        </button>
      </div>
    </div>
  );
};
