import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  GraduationCap,
  MoreVertical,
  Pencil,
  RefreshCw,
  Star,
  Trash2,
} from 'lucide-react';

import type { ClassRoster } from '@/types';
import {
  OverflowMenu,
  type OverflowMenuItem,
} from '@/components/common/sessionViews/OverflowMenu';
import { tourFieldAttr } from '@/config/tourAnchors';

interface SidebarClassRowProps {
  roster: ClassRoster;
  isActive: boolean;
  classLinkEnabled: boolean;
  rowKey: string;
  onToggleActive: () => void;
  onEdit: () => void;
  onSyncClassLink: () => void;
  onLinkClassroom: () => void;
  onDelete: () => void;
}

// Divider-row layout for My Classes: the name wraps instead of truncating.
export const SidebarClassRow: React.FC<SidebarClassRowProps> = ({
  roster: r,
  isActive,
  classLinkEnabled,
  rowKey,
  onToggleActive,
  onEdit,
  onSyncClassLink,
  onLinkClassroom,
  onDelete,
}) => {
  const { t } = useTranslation();
  const activeLabel = isActive
    ? t('sidebar.classes.activeClass', { defaultValue: 'Active Class' })
    : t('sidebar.classes.setActive', { defaultValue: 'Set as Active' });
  // Pre-metadata ClassLink rosters need a re-sync before student SSO sees them.
  const needsBackfill =
    !r.classlinkClassId && r.students.some((s) => s.classLinkSourcedId);

  const items: OverflowMenuItem[] = [];
  if (classLinkEnabled) {
    items.push(
      {
        id: 'sync-classlink',
        label: needsBackfill
          ? t('sidebar.classes.linkClassLink', {
              defaultValue: 'Link to ClassLink class',
            })
          : t('sidebar.classes.syncClassLink', {
              defaultValue: 'Sync with ClassLink',
            }),
        icon: RefreshCw,
        onClick: onSyncClassLink,
        tourAnchor: tourFieldAttr('classes.sync-classlink', 'classes', rowKey),
      },
      {
        id: 'link-classroom',
        label: r.googleClassroomCourseId
          ? t('sidebar.classes.changeGoogleClassroomLink', {
              defaultValue: 'Change Google Classroom link',
            })
          : t('sidebar.classes.linkGoogleClassroom.button', {
              defaultValue: 'Link to Google Classroom',
            }),
        icon: GraduationCap,
        onClick: onLinkClassroom,
        tourAnchor: tourFieldAttr('classes.link-classroom', 'classes', rowKey),
      }
    );
  }
  items.push({
    id: 'delete',
    label: t('sidebar.classes.delete', { defaultValue: 'Delete Class' }),
    icon: Trash2,
    destructive: true,
    onClick: onDelete,
    tourAnchor: tourFieldAttr('classes.delete-roster', 'classes', rowKey),
  });

  return (
    <li
      className={`flex items-center gap-1 py-2 px-1 transition-colors ${
        isActive ? 'bg-brand-blue-lighter/40' : 'hover:bg-slate-50'
      }`}
    >
      <button
        type="button"
        onClick={onToggleActive}
        {...tourFieldAttr('classes.set-active', 'classes', rowKey)}
        className={`shrink-0 p-1.5 rounded-lg transition-colors ${
          isActive
            ? 'text-amber-500 hover:bg-amber-50'
            : 'text-slate-300 hover:text-amber-400 hover:bg-amber-50'
        }`}
        title={activeLabel}
        aria-label={activeLabel}
        aria-pressed={isActive}
      >
        <Star className="w-4 h-4" fill={isActive ? 'currentColor' : 'none'} />
      </button>
      <div className="flex-1 min-w-0 py-1">
        <div className="text-sm font-bold leading-snug text-slate-800 [overflow-wrap:anywhere]">
          {r.name}
        </div>
        {r.loadError ? (
          <div
            className="text-xxs font-semibold text-red-500 uppercase tracking-widest"
            title={r.loadError}
          >
            {t('sidebar.classes.loadFailed', {
              defaultValue: 'Failed to load',
            })}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xxs font-semibold text-slate-400 uppercase tracking-widest">
            {t('sidebar.classes.studentCount', {
              count: r.students.length,
              defaultValue: '{{count}} Student',
              defaultValue_other: '{{count}} Students',
            })}
            {classLinkEnabled && r.googleClassroomCourseId && (
              <span
                className="flex text-emerald-600"
                title={t('sidebar.classes.linkedGoogleClassroom', {
                  defaultValue: 'Linked to Google Classroom',
                })}
              >
                <GraduationCap className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="sr-only">
                  {t('sidebar.classes.linkedGoogleClassroom', {
                    defaultValue: 'Linked to Google Classroom',
                  })}
                </span>
              </span>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onEdit}
        {...tourFieldAttr('classes.edit-roster', 'classes', rowKey)}
        className="shrink-0 p-1.5 text-slate-400 hover:text-brand-blue-primary hover:bg-brand-blue-lighter rounded-lg transition-colors"
        title={t('sidebar.classes.edit', { defaultValue: 'Edit Class' })}
        aria-label={t('sidebar.classes.edit', { defaultValue: 'Edit Class' })}
      >
        <Pencil className="w-4 h-4" />
      </button>
      <div className="shrink-0">
        <OverflowMenu
          items={items}
          ariaLabel={`${t('sidebar.classes.actionsMenuFor', {
            defaultValue: 'Class actions for {{name}}',
            name: r.name,
          })}${
            classLinkEnabled && needsBackfill
              ? `, ${t('sidebar.classes.linkClassLink', { defaultValue: 'Link to ClassLink class' })}`
              : ''
          }`}
          triggerTitle={t('sidebar.classes.actionsMenu', {
            defaultValue: 'Class actions',
          })}
          triggerAnchor={tourFieldAttr(
            'classes.row-actions',
            'classes',
            rowKey
          )}
          triggerClassName="p-1.5 rounded-lg text-slate-400 hover:text-brand-blue-primary hover:bg-brand-blue-lighter"
          triggerContent={
            <span className="relative flex">
              <MoreVertical className="w-4 h-4" />
              {classLinkEnabled && needsBackfill && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500"
                />
              )}
            </span>
          }
        />
      </div>
    </li>
  );
};
