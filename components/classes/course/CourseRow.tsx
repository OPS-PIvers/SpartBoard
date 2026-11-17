// A linked Course in My Classes: one collapsed row whose chevron shows each linked class's own row (D3).
import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { tourFieldAttr } from '@/config/tourAnchors';
import type { CourseGroup } from '@/utils/course/courseGroups';
import type { CourseRoster } from './types';

export interface CourseRowProps<R extends CourseRoster> {
  group: CourseGroup<R>;
  /** The class list row key of the Course's first class, for its tour anchor. */
  rowKey: string;
  /** Renders one linked class's usual row (an `li`). */
  renderSection: (roster: R) => React.ReactNode;
  /** Thread A's Course controls (rename, unlink), shown on the right of the row. */
  actions?: React.ReactNode;
}

export function CourseRow<R extends CourseRoster>({
  group,
  rowKey,
  renderSection,
  actions,
}: CourseRowProps<R>): React.ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <>
      <div className="flex items-center gap-1 py-2 px-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={listId}
          {...tourFieldAttr('classes.course-expand', 'classes', rowKey)}
          className="group flex flex-1 min-w-0 items-center gap-1 text-left"
        >
          <span className="shrink-0 p-1.5 rounded-lg text-slate-400 group-hover:text-brand-blue-primary group-hover:bg-brand-blue-lighter transition-colors">
            <ChevronRight
              className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`}
              aria-hidden="true"
            />
          </span>
          <span className="flex-1 min-w-0 py-1">
            <span className="block text-sm font-bold leading-snug text-slate-800 wrap-anywhere">
              {group.course?.name}
            </span>
            <span className="block text-xxs font-semibold text-slate-400 uppercase tracking-widest">
              {t('course.linking.sectionCount', {
                count: group.rosters.length,
                defaultValue: '{{count}} section',
                defaultValue_other: '{{count}} sections',
              })}
            </span>
          </span>
        </button>
        {actions}
      </div>
      {open && (
        <ul
          id={listId}
          className="divide-y divide-slate-200 border-t border-slate-200 [&>li]:pl-7"
        >
          {group.rosters.map((r) => (
            <React.Fragment key={r.id}>{renderSection(r)}</React.Fragment>
          ))}
        </ul>
      )}
    </>
  );
}
