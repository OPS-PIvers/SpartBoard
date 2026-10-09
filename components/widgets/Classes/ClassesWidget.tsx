import React from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Users, ChevronRight, Settings } from 'lucide-react';
import { WidgetData } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

interface Props {
  widget: WidgetData;
}

/**
 * Classes widget — the active-class selector.
 *
 * This widget is intentionally compact. Roster CRUD, ClassLink import, and
 * per-class sync all live in the "My Classes" sidebar page
 * (`components/layout/sidebar/SidebarClasses.tsx`). The widget's only job
 * is to show the active class and let the teacher switch.
 *
 * "Manage Classes →" and the empty-state CTA both dispatch the
 * `open-sidebar` CustomEvent with `detail.section: 'classes'`, which the
 * Sidebar listens for.
 */
const ClassesWidget: React.FC<Props> = ({ widget: _widget }) => {
  const { t } = useTranslation();
  const { rosters, activeRosterId, setActiveRoster } = useDashboard();

  const activeRoster = rosters.find((r) => r.id === activeRosterId) ?? null;
  const otherRosters = rosters.filter((r) => r.id !== activeRosterId);

  const openManageSidebar = () => {
    window.dispatchEvent(
      new CustomEvent('open-sidebar', { detail: { section: 'classes' } })
    );
  };

  if (rosters.length === 0) {
    return (
      <ScaledEmptyState
        icon={Users}
        title={t('sidebar.classes.emptyTitle', {
          defaultValue: 'No classes yet',
        })}
        subtitle={t('sidebar.classes.emptySubtitle', {
          defaultValue:
            'Create a class or import from ClassLink to get started.',
        })}
        action={
          <button
            {...tourAttr('classes-widget.manage', _widget.id, _widget.type)}
            onClick={openManageSidebar}
            className="bg-brand-blue-primary text-white font-black uppercase tracking-widest rounded-xl hover:bg-brand-blue-dark shadow-sm transition-colors"
            style={{
              padding: 'min(10px, 2.5cqmin) min(16px, 4cqmin)',
              fontSize: 'min(12px, 3.5cqmin)',
              marginTop: 'min(8px, 2cqmin)',
            }}
          >
            {t('sidebar.classes.manageClasses', {
              defaultValue: 'Manage Classes',
            })}
          </button>
        }
      />
    );
  }

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className="w-full h-full flex flex-col"
          style={{ padding: 'min(14px, 3.5cqmin)', gap: 'min(12px, 3cqmin)' }}
        >
          {/* Active class hero */}
          <div style={{ gap: 'min(4px, 1cqmin)' }} className="flex flex-col">
            <span
              className="font-black text-slate-400 uppercase tracking-widest"
              style={{ fontSize: 'min(11px, 3cqmin)' }}
            >
              {t('sidebar.classes.activeClass', {
                defaultValue: 'Active Class',
              })}
            </span>
            <div
              className="bg-white border-2 border-brand-blue-primary rounded-2xl flex items-center shadow-sm"
              style={{
                padding: 'min(14px, 3.5cqmin)',
                gap: 'min(12px, 3cqmin)',
              }}
            >
              <button
                {...tourAttr(
                  'classes-widget.clear-active',
                  _widget.id,
                  _widget.type
                )}
                onClick={() => setActiveRoster(null)}
                disabled={!activeRoster}
                className="shrink-0 text-amber-500 hover:text-amber-600 transition-colors disabled:text-slate-300 disabled:hover:text-slate-300 disabled:cursor-default"
                title={
                  activeRoster
                    ? t('sidebar.classes.clearActive', {
                        defaultValue: 'Clear active class',
                      })
                    : t('sidebar.classes.noActive', {
                        defaultValue: 'No active class',
                      })
                }
                aria-label={
                  activeRoster
                    ? t('sidebar.classes.clearActive', {
                        defaultValue: 'Clear active class',
                      })
                    : t('sidebar.classes.noActive', {
                        defaultValue: 'No active class',
                      })
                }
              >
                <Star
                  fill={activeRoster ? 'currentColor' : 'none'}
                  style={{
                    width: 'min(28px, 7cqmin)',
                    height: 'min(28px, 7cqmin)',
                  }}
                  strokeWidth={2.5}
                />
              </button>
              <div className="flex-1 min-w-0">
                <div
                  className="text-slate-800 font-black truncate"
                  style={{ fontSize: 'min(22px, 7cqmin)' }}
                >
                  {activeRoster
                    ? activeRoster.name
                    : t('sidebar.classes.noClassSelected', {
                        defaultValue: 'No Class Selected',
                      })}
                </div>
                <div
                  className="text-slate-400 font-bold uppercase tracking-widest"
                  style={{ fontSize: 'min(12px, 3cqmin)' }}
                >
                  {activeRoster
                    ? t('sidebar.classes.studentCount', {
                        count: activeRoster.students.length,
                        defaultValue: '{{count}} Student',
                        defaultValue_other: '{{count}} Students',
                      })
                    : t('sidebar.classes.pickClass', {
                        defaultValue: 'Pick a class below',
                      })}
                </div>
              </div>
            </div>
          </div>

          {/* Switch to list */}
          {otherRosters.length > 0 && (
            <div
              className="flex-1 min-h-0 flex flex-col"
              style={{ gap: 'min(6px, 1.5cqmin)' }}
            >
              <span
                className="font-black text-slate-400 uppercase tracking-widest shrink-0"
                style={{ fontSize: 'min(11px, 3cqmin)' }}
              >
                {t('sidebar.classes.switchTo', { defaultValue: 'Switch To' })}
              </span>
              <div
                className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col"
                style={{ gap: 'min(4px, 1cqmin)' }}
              >
                {otherRosters.map((r) => (
                  <button
                    key={r.id}
                    {...tourFieldAttr(
                      'classes-widget.roster-row',
                      _widget.type,
                      r.id
                    )}
                    onClick={() => setActiveRoster(r.id)}
                    className="flex items-center bg-white border border-slate-200 rounded-xl hover:border-brand-blue-primary hover:shadow-sm transition-all text-left group"
                    style={{
                      padding: 'min(10px, 2.5cqmin)',
                      gap: 'min(10px, 2.5cqmin)',
                    }}
                  >
                    <ChevronRight
                      className="text-slate-300 group-hover:text-brand-blue-primary transition-colors shrink-0"
                      style={{
                        width: 'min(16px, 4cqmin)',
                        height: 'min(16px, 4cqmin)',
                      }}
                    />
                    <span
                      className="flex-1 min-w-0 text-slate-700 font-bold truncate"
                      style={{ fontSize: 'min(14px, 3.5cqmin)' }}
                    >
                      {r.name}
                    </span>
                    <span
                      className="shrink-0 text-slate-400 font-bold uppercase tracking-widest"
                      style={{ fontSize: 'min(11px, 2.75cqmin)' }}
                    >
                      {r.students.length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Manage footer CTA */}
          <button
            {...tourAttr('classes-widget.manage', _widget.id, _widget.type)}
            onClick={openManageSidebar}
            className="shrink-0 flex items-center justify-center bg-brand-blue-lighter/50 text-brand-blue-primary font-black uppercase tracking-widest rounded-xl hover:bg-brand-blue-lighter transition-colors"
            style={{
              padding: 'min(10px, 2.5cqmin)',
              gap: 'min(6px, 1.5cqmin)',
              fontSize: 'min(12px, 3cqmin)',
            }}
          >
            <Settings
              style={{
                width: 'min(14px, 3.5cqmin)',
                height: 'min(14px, 3.5cqmin)',
              }}
            />
            {t('sidebar.classes.manageClasses', {
              defaultValue: 'Manage Classes',
            })}
          </button>
        </div>
      }
    />
  );
};

export default ClassesWidget;
