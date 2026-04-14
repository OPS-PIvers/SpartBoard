import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { ClassLinkClass, ClassRoster, Student } from '@/types';
import { Modal } from '@/components/common/Modal';
import { classLinkService } from '@/utils/classlinkService';
import { useDashboard } from '@/context/useDashboard';
import { mergeClassLinkStudents } from './mergeClassLinkStudents';

export type ClassLinkDialogMode =
  | { kind: 'new' }
  | { kind: 'merge'; rosterId: string; rosterName: string };

interface ClassLinkImportDialogProps {
  isOpen: boolean;
  mode: ClassLinkDialogMode;
  onClose: () => void;
}

/**
 * Unified ClassLink dialog.
 *
 * - `new` mode: lists all ClassLink classes with an "Import" action that
 *   creates a fresh local roster (name derived from subject/title/classCode).
 * - `merge` mode: lists all ClassLink classes with a "Merge" action that
 *   pulls missing students into the existing local roster (dedup by
 *   `classLinkSourcedId` → normalized name → append).
 */
export const ClassLinkImportDialog: React.FC<ClassLinkImportDialogProps> = ({
  isOpen,
  mode,
  onClose,
}) => {
  const { t } = useTranslation();
  const { rosters, addRoster, updateRoster, addToast } = useDashboard();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassLinkClass[]>([]);
  const [studentsByClass, setStudentsByClass] = useState<
    Record<string, import('@/types').ClassLinkStudent[]>
  >({});
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setClasses([]);
    setStudentsByClass({});
    void (async () => {
      try {
        const data = await classLinkService.getRosters(true);
        if (cancelled) return;
        setClasses(data.classes);
        setStudentsByClass(data.studentsByClass);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to fetch from ClassLink', err);
        setError('Failed to fetch from ClassLink. Check console.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleImportNew = async (cls: ClassLinkClass) => {
    setPendingId(cls.sourcedId);
    try {
      const students: Student[] = (studentsByClass[cls.sourcedId] ?? []).map(
        (s) => ({
          id: crypto.randomUUID(),
          firstName: s.givenName,
          lastName: s.familyName,
          pin: '',
          classLinkSourcedId: s.sourcedId,
        })
      );
      const subjectPrefix = cls.subject ? `${cls.subject} - ` : '';
      const codeSuffix = cls.classCode ? ` (${cls.classCode})` : '';
      const displayName = `${subjectPrefix}${cls.title}${codeSuffix}`;
      await addRoster(displayName, students);
      addToast(`Imported ${cls.title}`, 'success');
      onClose();
    } catch (err) {
      console.error(err);
      addToast(`Failed to import ${cls.title}`, 'error');
    } finally {
      setPendingId(null);
    }
  };

  const handleMergeInto = async (cls: ClassLinkClass) => {
    if (mode.kind !== 'merge') return;
    setPendingId(cls.sourcedId);
    try {
      const target: ClassRoster | undefined = rosters.find(
        (r) => r.id === mode.rosterId
      );
      if (!target) {
        addToast('Target class no longer exists', 'error');
        onClose();
        return;
      }
      const result = mergeClassLinkStudents(
        target.students,
        studentsByClass[cls.sourcedId] ?? []
      );
      await updateRoster(mode.rosterId, { students: result.students });
      if (result.addedCount === 0 && result.matchedCount === 0) {
        addToast(`No students found in ${cls.title}`, 'info');
      } else if (result.addedCount === 0) {
        addToast(
          `All ${result.matchedCount} students already in ${target.name}`,
          'info'
        );
      } else {
        addToast(
          `Added ${result.addedCount} student${result.addedCount === 1 ? '' : 's'} to ${target.name}`,
          'success'
        );
      }
      onClose();
    } catch (err) {
      console.error(err);
      addToast(`Failed to sync ${cls.title}`, 'error');
    } finally {
      setPendingId(null);
    }
  };

  const title =
    mode.kind === 'new'
      ? t('sidebar.classes.classLinkImportTitle', {
          defaultValue: 'Import from ClassLink',
        })
      : t('sidebar.classes.classLinkMergeTitle', {
          defaultValue: 'Sync "{{name}}" with ClassLink',
          name: mode.rosterName,
        });
  const subtitle =
    mode.kind === 'new'
      ? t('sidebar.classes.classLinkImportSubtitle', {
          defaultValue: 'Pick a class to import as a new roster.',
        })
      : t('sidebar.classes.classLinkMergeSubtitle', {
          defaultValue:
            'Pick the ClassLink class whose students should be pulled in. Existing students are preserved.',
        });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-lg"
      title={title}
      contentClassName="px-6 pb-6"
    >
      <p className="text-xs text-slate-500 mb-4">{subtitle}</p>

      {loading && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-brand-blue-primary" />
          <p className="text-xxs font-bold uppercase tracking-widest">
            {t('sidebar.classes.classLinkConnecting', {
              defaultValue: 'Connecting to ClassLink…',
            })}
          </p>
        </div>
      )}

      {error && !loading && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && classes.length === 0 && (
        <div className="py-10 text-center text-slate-400 text-sm italic">
          {t('sidebar.classes.classLinkNoClasses', {
            defaultValue: 'No classes found in ClassLink.',
          })}
        </div>
      )}

      {!loading && !error && classes.length > 0 && (
        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
          {classes.map((cls) => {
            const count = studentsByClass[cls.sourcedId]?.length ?? 0;
            const isPending = pendingId === cls.sourcedId;
            return (
              <div
                key={cls.sourcedId}
                className="flex items-center justify-between gap-3 p-3 border border-slate-200 rounded-xl bg-white hover:border-brand-blue-primary hover:shadow-sm transition-all"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-800 truncate">
                    {cls.title}
                  </div>
                  <div className="text-xxs font-semibold text-slate-400 uppercase tracking-widest">
                    {t('sidebar.classes.studentCount', {
                      count,
                      defaultValue: '{{count}} Student',
                      defaultValue_other: '{{count}} Students',
                    })}
                    {cls.classCode ? ` · ${cls.classCode}` : ''}
                  </div>
                </div>
                <button
                  onClick={() =>
                    mode.kind === 'new'
                      ? void handleImportNew(cls)
                      : void handleMergeInto(cls)
                  }
                  disabled={isPending}
                  className="shrink-0 bg-brand-blue-primary text-white px-3 py-2 rounded-xl text-xxs font-bold uppercase tracking-wider hover:bg-brand-blue-dark transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : mode.kind === 'new' ? (
                    <Download className="w-3 h-3" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  {mode.kind === 'new'
                    ? t('sidebar.classes.classLinkImport', {
                        defaultValue: 'Import',
                      })
                    : t('sidebar.classes.classLinkMerge', {
                        defaultValue: 'Merge',
                      })}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
};
