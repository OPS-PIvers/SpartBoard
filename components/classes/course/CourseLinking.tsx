// Linking above the class list: suggestions for matching classes (D4) and Link classes by hand.
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import type { CourseGroup } from '@/utils/course/courseGroups';
import { linkSuggestions } from '@/utils/course/linkSuggestions';
import { useDashboard } from '@/context/useDashboard';
import { logError } from '@/utils/logError';
import { courseEditRequests } from '@/utils/course/courseEditRequests';
import { CourseEditor } from './CourseGroupActions';
import type { CourseGroupProps, CourseRoster } from './types';

const DISMISSED_KEY = 'spartboard.courseLinking.dismissed';

function readDismissed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(list)
        ? list.filter((x): x is string => typeof x === 'string')
        : []
    );
  } catch {
    return new Set();
  }
}

function writeDismissed(keys: Set<string>) {
  try {
    window.localStorage.setItem(
      DISMISSED_KEY,
      JSON.stringify([...keys].slice(-200))
    );
  } catch {
    // Private windows can refuse storage; the suggestion just comes back next time.
  }
}

export interface CourseLinkingProps {
  groups: CourseGroup<CourseRoster>[];
  saveCourse: CourseGroupProps['saveCourse'];
}

export const CourseLinking: React.FC<CourseLinkingProps> = ({
  groups,
  saveCourse,
}) => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { addToast } = useDashboard();
  const suggestions = useMemo(
    () => linkSuggestions(groups, dismissed),
    [groups, dismissed]
  );
  const unlinked = groups.filter(
    (g) => !(g.course && g.rosters.length > 1)
  ).length;
  const hasLinked = groups.some((g) => g.course && g.rosters.length > 1);
  if (unlinked < 2 && !hasLinked) return null;

  const dismiss = (key: string) => {
    const next = new Set(dismissed);
    next.add(key);
    writeDismissed(next);
    setDismissed(next);
  };

  const linkSuggestion = async (s: (typeof suggestions)[number]) => {
    const course = s.courseId
      ? (groups.find((g) => g.course?.id === s.courseId)?.course ?? null)
      : null;
    const selected = [
      ...(course?.rosterIds ?? []),
      ...s.rosters.map((r) => r.id),
    ];
    setBusy(s.key);
    try {
      for (const request of courseEditRequests(
        groups,
        course,
        course?.name ?? s.name,
        selected
      ))
        await saveCourse(request);
      addToast(
        t('course.linking.linked', { defaultValue: 'Classes linked' }),
        'success'
      );
    } catch (err) {
      logError('CourseLinking.link', err);
      addToast(
        err instanceof Error && err.message
          ? err.message
          : t('course.linking.saveFailed', {
              defaultValue: 'Couldn’t save the Course. Try again.',
            }),
        'error'
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      {suggestions.length > 0 && !editing && (
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          {suggestions.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2 px-1 py-2">
              <Link2
                className="w-4 h-4 shrink-0 text-brand-blue-primary"
                aria-hidden="true"
              />
              <span className="flex-1 min-w-0 text-sm leading-snug text-slate-700 wrap-anywhere">
                {s.courseId
                  ? t('course.linking.suggestAdd', {
                      defaultValue: '{{name}}: add {{count}} matching class?',
                      defaultValue_other:
                        '{{name}}: add {{count}} matching classes?',
                      name: s.name,
                      count: s.rosters.length,
                    })
                  : t('course.linking.suggestNew', {
                      defaultValue: '{{name}}: link these {{count}} classes?',
                      name: s.name,
                      count: s.rosters.length,
                    })}
              </span>
              <button
                type="button"
                onClick={() => dismiss(s.key)}
                disabled={busy !== null}
                {...tourFieldAttr(
                  'classes.course-suggestion-dismiss',
                  'course-suggestions',
                  `row-${i + 1}`
                )}
                className="shrink-0 px-2 py-1 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors"
              >
                {t('course.linking.notNow', { defaultValue: 'Not now' })}
              </button>
              <button
                type="button"
                onClick={() => void linkSuggestion(s)}
                disabled={busy !== null}
                {...tourFieldAttr(
                  'classes.course-suggestion-link',
                  'course-suggestions',
                  `row-${i + 1}`
                )}
                className="shrink-0 px-2 py-1 rounded-lg text-xs font-bold text-brand-blue-primary hover:bg-brand-blue-lighter transition-colors"
              >
                {t('course.linking.link', { defaultValue: 'Link' })}
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <CourseEditor
          groups={groups}
          course={null}
          saveCourse={saveCourse}
          onDone={() => setEditing(false)}
        />
      ) : (
        unlinked >= 2 && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            {...tourAttr('classes.link-classes')}
            className="flex items-center gap-1.5 px-1 py-1 text-xs font-bold text-brand-blue-primary hover:underline"
          >
            <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
            {t('course.linking.linkClasses', { defaultValue: 'Link classes' })}
          </button>
        )
      )}
    </div>
  );
};
