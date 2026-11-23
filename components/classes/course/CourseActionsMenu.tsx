// The kebab on a linked Course row: actions that run for every section at once.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreVertical, RefreshCw, ScanEye } from 'lucide-react';
import type { ClassRoster } from '@/types';
import {
  OverflowMenu,
  type OverflowMenuItem,
} from '@/components/common/sessionViews/OverflowMenu';
import { tourFieldAttr } from '@/config/tourAnchors';
import { useDashboard } from '@/context/useDashboard';
import { classLinkService } from '@/utils/classlinkService';
import { logError } from '@/utils/logError';
import { planCourseClassLinkSync } from './courseClassLinkSync';

export interface CourseActionsMenuProps {
  courseName: string;
  sections: readonly ClassRoster[];
  rowKey: string;
  classLinkEnabled: boolean;
  /** Absent when no section has a student page or the feature is off. */
  onViewStudentPage?: () => void;
}

export const CourseActionsMenu: React.FC<CourseActionsMenuProps> = ({
  courseName,
  sections,
  rowKey,
  classLinkEnabled,
  onViewStudentPage,
}) => {
  const { t } = useTranslation();
  const { updateRoster, addToast } = useDashboard();
  const [syncing, setSyncing] = useState(false);

  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const plan = planCourseClassLinkSync(
        sections,
        await classLinkService.getRosters(true)
      );
      for (const u of plan.updates) {
        await updateRoster(u.rosterId, { students: u.students });
      }
      if (plan.updates.length > 0) {
        const synced = t('course.sync.synced', {
          count: plan.updates.length,
          defaultValue: 'Synced {{count}} section.',
          defaultValue_other: 'Synced {{count}} sections.',
        });
        const added =
          plan.added > 0
            ? ` ${t('course.sync.added', {
                count: plan.added,
                defaultValue: 'Added {{count}} student.',
                defaultValue_other: 'Added {{count}} students.',
              })}`
            : '';
        const removed =
          plan.removed > 0
            ? ` ${t('course.sync.removed', {
                count: plan.removed,
                defaultValue: 'Removed {{count}} student.',
                defaultValue_other: 'Removed {{count}} students.',
              })}`
            : '';
        addToast(`${synced}${added}${removed}`, 'success');
      }
      if (plan.removalSkipped.length > 0) {
        addToast(
          t('toasts.classLink.removalSkipped', {
            name: plan.removalSkipped.join(', '),
            defaultValue:
              'Over half of {{name}} is missing from ClassLink, so no one was removed.',
          }),
          'warning'
        );
      }
      if (plan.unlinked.length > 0) {
        addToast(
          t('course.sync.unlinked', {
            names: plan.unlinked.join(', '),
            defaultValue: 'Not linked to ClassLink: {{names}}.',
          }),
          'warning'
        );
      }
      if (plan.notFound.length > 0) {
        addToast(
          t('course.sync.notFound', {
            names: plan.notFound.join(', '),
            defaultValue: 'Not found in ClassLink: {{names}}.',
          }),
          'warning'
        );
      }
    } catch (err) {
      logError('CourseActionsMenu.sync', err);
      addToast(
        t('toasts.classLink.syncFailed', {
          defaultValue: 'Failed to sync {{name}}',
          name: courseName,
        }),
        'error'
      );
    } finally {
      setSyncing(false);
    }
  };

  const items: OverflowMenuItem[] = [];
  if (classLinkEnabled) {
    items.push({
      id: 'course-sync-classlink',
      label: t('sidebar.classes.syncClassLink', {
        defaultValue: 'Sync with ClassLink',
      }),
      icon: RefreshCw,
      loading: syncing,
      disabled: syncing,
      onClick: () => void sync(),
      tourAnchor: tourFieldAttr(
        'classes.course-sync-classlink',
        'classes',
        rowKey
      ),
    });
  }
  if (onViewStudentPage) {
    items.push({
      id: 'course-view-student-page',
      label: t('sidebar.classes.viewStudentPage', {
        defaultValue: 'View Student Page',
      }),
      icon: ScanEye,
      onClick: onViewStudentPage,
      tourAnchor: tourFieldAttr(
        'classes.course-view-student-page',
        'classes',
        rowKey
      ),
    });
  }
  if (items.length === 0) {
    return <span className="w-7 shrink-0" aria-hidden="true" />;
  }
  return (
    <div className="shrink-0">
      <OverflowMenu
        items={items}
        ariaLabel={t('course.actionsMenuFor', {
          defaultValue: 'Course actions for {{name}}',
          name: courseName,
        })}
        triggerTitle={t('course.actionsMenu', {
          defaultValue: 'Course actions',
        })}
        triggerAnchor={tourFieldAttr(
          'classes.course-actions',
          'classes',
          rowKey
        )}
        triggerClassName="p-1.5 rounded-lg text-slate-400 hover:text-brand-blue-primary hover:bg-brand-blue-lighter"
        triggerContent={<MoreVertical className="w-4 h-4" />}
      />
    </div>
  );
};
