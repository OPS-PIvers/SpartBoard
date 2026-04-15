import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Plus,
  Star,
  Pencil,
  Trash2,
  RefreshCw,
  Download,
} from 'lucide-react';

import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useClassLinkEnabled } from '@/hooks/useClassLinkEnabled';
import { ClassRoster, Student } from '@/types';
import { RosterEditorModal } from '@/components/classes/RosterEditorModal';
import {
  ClassLinkImportDialog,
  ClassLinkDialogMode,
} from '@/components/classes/ClassLinkImportDialog';

interface SidebarClassesProps {
  isVisible: boolean;
}

/**
 * "My Classes" sidebar page.
 *
 * Replaces the in-widget roster editor and ClassLink import that used to live
 * inside the Classes dashboard widget. Roster management is account-level, not
 * dashboard-level, so it belongs here in the app shell.
 */
export const SidebarClasses: React.FC<SidebarClassesProps> = ({
  isVisible,
}) => {
  const { t } = useTranslation();
  const { showConfirm } = useDialog();
  const {
    rosters,
    activeRosterId,
    addRoster,
    updateRoster,
    deleteRoster,
    setActiveRoster,
  } = useDashboard();
  const { selectedBuildings } = useAuth();
  const classLinkEnabled = useClassLinkEnabled(selectedBuildings[0]);

  const [editingRosterId, setEditingRosterId] = useState<string | null>(null);
  const [classLinkMode, setClassLinkMode] =
    useState<ClassLinkDialogMode | null>(null);

  const editingRoster: ClassRoster | null =
    editingRosterId && editingRosterId !== 'new'
      ? (rosters.find((r) => r.id === editingRosterId) ?? null)
      : null;

  const handleSaveRoster = async (name: string, students: Student[]) => {
    if (editingRosterId === 'new') {
      await addRoster(name, students);
    } else if (editingRosterId) {
      await updateRoster(editingRosterId, { name, students });
    }
  };

  const handleDelete = async (roster: ClassRoster) => {
    const confirmed = await showConfirm(
      t('sidebar.classes.confirmDelete', {
        defaultValue: `Delete "${roster.name}"? This cannot be undone.`,
        name: roster.name,
      }),
      {
        title: t('sidebar.classes.confirmDeleteTitle', {
          defaultValue: 'Delete Class',
        }),
        variant: 'danger',
        confirmLabel: t('common.delete', { defaultValue: 'Delete' }),
      }
    );
    if (confirmed) {
      await deleteRoster(roster.id);
    }
  };

  return (
    <>
      <div
        className={`absolute inset-0 flex flex-col transition-all duration-300 ease-in-out ${
          isVisible
            ? 'translate-x-0 opacity-100 visible'
            : 'translate-x-full opacity-0 invisible'
        }`}
      >
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-5 space-y-5">
            {/* Page Header */}
            <div>
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-8 h-8 rounded-lg bg-brand-blue-lighter flex items-center justify-center">
                  <Users className="w-4 h-4 text-brand-blue-primary" />
                </div>
                <h2 className="text-sm font-bold text-slate-800">
                  {t('sidebar.classes.title', { defaultValue: 'My Classes' })}
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                {t('sidebar.classes.description', {
                  defaultValue:
                    'Manage your class rosters here. The active class is used by seating charts, random picker, polls, and more.',
                })}
              </p>
            </div>

            {/* Top CTAs */}
            <div
              className={`grid gap-2 ${
                classLinkEnabled ? 'grid-cols-2' : 'grid-cols-1'
              }`}
            >
              <button
                onClick={() => setEditingRosterId('new')}
                className="flex flex-col items-center justify-center gap-1.5 p-3 bg-brand-blue-primary text-white rounded-xl shadow-sm hover:bg-brand-blue-dark transition-all"
              >
                <Plus className="w-4 h-4" />
                <span className="text-xxs font-bold uppercase tracking-wider">
                  {t('sidebar.classes.newClass', {
                    defaultValue: 'New Class',
                  })}
                </span>
              </button>
              {classLinkEnabled && (
                <button
                  onClick={() => setClassLinkMode({ kind: 'new' })}
                  className="flex flex-col items-center justify-center gap-1.5 p-3 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-brand-blue-primary hover:text-brand-blue-primary transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span className="text-xxs font-bold uppercase tracking-wider">
                    {t('sidebar.classes.importClassLink', {
                      defaultValue: 'ClassLink',
                    })}
                  </span>
                </button>
              )}
            </div>

            {/* Roster list */}
            {rosters.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-400">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                  <Users className="w-6 h-6 text-slate-300" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-slate-600">
                    {t('sidebar.classes.emptyTitle', {
                      defaultValue: 'No classes yet',
                    })}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t('sidebar.classes.emptySubtitle', {
                      defaultValue:
                        'Create a class or import from ClassLink to get started.',
                    })}
                  </p>
                </div>
                <button
                  onClick={() => setEditingRosterId('new')}
                  className="mt-2 px-4 py-2 bg-brand-blue-primary text-white rounded-xl text-xxs font-bold uppercase tracking-wider hover:bg-brand-blue-dark shadow-sm transition-colors"
                >
                  {t('sidebar.classes.createNewClass', {
                    defaultValue: 'Create New Class',
                  })}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest px-1">
                  {t('sidebar.classes.myClasses', {
                    defaultValue: 'Your Classes',
                  })}
                </h3>
                <div className="flex flex-col gap-2">
                  {rosters.map((r) => {
                    const isActive = activeRosterId === r.id;
                    return (
                      <div
                        key={r.id}
                        className={`flex items-center gap-2 p-2.5 bg-white border rounded-xl transition-all ${
                          isActive
                            ? 'border-brand-blue-primary shadow-sm ring-1 ring-brand-blue-primary/20'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <button
                          onClick={() =>
                            setActiveRoster(isActive ? null : r.id)
                          }
                          className={`shrink-0 p-1.5 rounded-lg transition-colors ${
                            isActive
                              ? 'text-amber-500 hover:bg-amber-50'
                              : 'text-slate-300 hover:text-amber-400 hover:bg-amber-50'
                          }`}
                          title={
                            isActive
                              ? t('sidebar.classes.activeClass', {
                                  defaultValue: 'Active Class',
                                })
                              : t('sidebar.classes.setActive', {
                                  defaultValue: 'Set as Active',
                                })
                          }
                          aria-label={
                            isActive
                              ? t('sidebar.classes.activeClass', {
                                  defaultValue: 'Active Class',
                                })
                              : t('sidebar.classes.setActive', {
                                  defaultValue: 'Set as Active',
                                })
                          }
                        >
                          <Star
                            className="w-4 h-4"
                            fill={isActive ? 'currentColor' : 'none'}
                          />
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-slate-800 truncate">
                            {r.name}
                          </div>
                          {r.loadError ? (
                            <div
                              className="text-xxs font-semibold text-red-500 uppercase tracking-widest truncate"
                              title={r.loadError}
                            >
                              {t('sidebar.classes.loadFailed', {
                                defaultValue: 'Failed to load',
                              })}
                            </div>
                          ) : (
                            <div className="text-xxs font-semibold text-slate-400 uppercase tracking-widest">
                              {t('sidebar.classes.studentCount', {
                                count: r.students.length,
                                defaultValue: '{{count}} Student',
                                defaultValue_other: '{{count}} Students',
                              })}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => setEditingRosterId(r.id)}
                            className="p-1.5 text-slate-400 hover:text-brand-blue-primary hover:bg-brand-blue-lighter rounded-lg transition-colors"
                            title={t('sidebar.classes.edit', {
                              defaultValue: 'Edit Class',
                            })}
                            aria-label={t('sidebar.classes.edit', {
                              defaultValue: 'Edit Class',
                            })}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {classLinkEnabled && (
                            <button
                              onClick={() =>
                                setClassLinkMode({
                                  kind: 'merge',
                                  rosterId: r.id,
                                  rosterName: r.name,
                                })
                              }
                              className="p-1.5 text-slate-400 hover:text-brand-blue-primary hover:bg-brand-blue-lighter rounded-lg transition-colors"
                              title={t('sidebar.classes.syncClassLink', {
                                defaultValue: 'Sync with ClassLink',
                              })}
                              aria-label={t('sidebar.classes.syncClassLink', {
                                defaultValue: 'Sync with ClassLink',
                              })}
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => void handleDelete(r)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title={t('sidebar.classes.delete', {
                              defaultValue: 'Delete Class',
                            })}
                            aria-label={t('sidebar.classes.delete', {
                              defaultValue: 'Delete Class',
                            })}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {editingRosterId !== null && (
        <RosterEditorModal
          key={editingRosterId}
          isOpen
          roster={editingRoster}
          onClose={() => setEditingRosterId(null)}
          onSave={handleSaveRoster}
        />
      )}

      {classLinkMode && (
        <ClassLinkImportDialog
          isOpen={classLinkMode !== null}
          mode={classLinkMode}
          onClose={() => setClassLinkMode(null)}
        />
      )}
    </>
  );
};
