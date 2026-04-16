import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { UserX, Check } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { useDashboard } from '@/context/useDashboard';
import type { ClassRoster } from '@/types';
import { getLocalIsoDate } from '@/utils/localDate';

interface AbsentStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  roster: ClassRoster;
}

/**
 * Full-screen tappable grid for marking students absent for the current day.
 * The absent list is stored on the roster metadata with a date stamp, so it
 * auto-clears when the date changes and affects every Randomizer widget using
 * the same class.
 */
export const AbsentStudentsModal: React.FC<AbsentStudentsModalProps> = ({
  isOpen,
  onClose,
  roster,
}) => {
  const { t } = useTranslation();
  const { setAbsentStudents } = useDashboard();

  const today = getLocalIsoDate();
  const absentIds = useMemo(
    () =>
      roster.absent?.date === today
        ? new Set(roster.absent.studentIds)
        : new Set<string>(),
    [roster.absent, today]
  );

  const sortedStudents = useMemo(
    () =>
      [...roster.students].sort((a, b) => {
        const aName = `${a.firstName} ${a.lastName}`.trim().toLowerCase();
        const bName = `${b.firstName} ${b.lastName}`.trim().toLowerCase();
        return aName.localeCompare(bName);
      }),
    [roster.students]
  );

  const toggleStudent = (studentId: string) => {
    const next = new Set(absentIds);
    if (next.has(studentId)) {
      next.delete(studentId);
    } else {
      next.add(studentId);
    }
    void setAbsentStudents(roster.id, [...next]);
  };

  const clearAll = () => {
    void setAbsentStudents(roster.id, []);
  };

  const formattedDate = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    []
  );

  const presentCount = roster.students.length - absentIds.size;

  const title = (
    <div className="flex items-center gap-3">
      <div className="p-2 bg-red-50 rounded-full text-red-500">
        <UserX size={20} />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="font-bold text-base text-slate-900 truncate">
          {t('widgets.random.absent.title', {
            defaultValue: 'Mark absent — {{date}}',
            date: formattedDate,
          })}
        </span>
        <span className="text-xs text-slate-500">
          {t('widgets.random.absent.summary', {
            defaultValue: '{{present}} present · {{absent}} absent',
            present: presentCount,
            absent: absentIds.size,
          })}
        </span>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-3xl"
      className="h-[80vh]"
      contentClassName="px-6 pb-4 flex flex-col"
      customHeader={
        <div className="px-6 pt-5 pb-3 flex items-center justify-between gap-4 border-b border-slate-100">
          {title}
          <button
            onClick={clearAll}
            disabled={absentIds.size === 0}
            className="text-xs font-black uppercase tracking-wider text-slate-400 hover:text-brand-blue-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {t('widgets.random.absent.clearAll', {
              defaultValue: 'Clear all (everyone present)',
            })}
          </button>
        </div>
      }
    >
      <div className="flex flex-col h-full gap-3 min-h-0 pt-4">
        {sortedStudents.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm italic">
            {t('widgets.random.absent.emptyRoster', {
              defaultValue: 'This class has no students yet.',
            })}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {sortedStudents.map((student) => {
                const isAbsent = absentIds.has(student.id);
                const fullName =
                  `${student.firstName} ${student.lastName}`.trim() ||
                  t('widgets.random.absent.unnamedStudent', {
                    defaultValue: 'Unnamed student',
                  });
                return (
                  <button
                    key={student.id}
                    onClick={() => toggleStudent(student.id)}
                    aria-pressed={isAbsent}
                    className={`relative flex items-center justify-center gap-2 px-3 py-3 rounded-xl border text-sm font-bold transition-colors motion-safe:transition-transform focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                      isAbsent
                        ? 'bg-red-50 border-red-300 text-red-700 line-through opacity-70 focus:ring-red-400'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-brand-blue-primary hover:text-brand-blue-primary focus:ring-brand-blue-primary'
                    }`}
                  >
                    {!isAbsent && (
                      <Check
                        size={14}
                        className="text-emerald-500 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <span className="truncate">{fullName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <p className="text-xs text-slate-400 italic shrink-0 text-center">
          {t('widgets.random.absent.footer', {
            defaultValue:
              'Absent marks apply to every Randomizer using this class. Resets automatically tomorrow.',
          })}
        </p>
      </div>
    </Modal>
  );
};
