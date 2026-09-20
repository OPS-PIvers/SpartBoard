/**
 * PlcTeammatePrintModal — pick a PLC teammate who is out, then see exactly
 * what would print for them (docs/plans/PLC_DELEGATED_PAPER_PRINTING.md §6).
 *
 * Increment 1 stops at the preview: everything here reads, nothing writes.
 * The Print button lands with `createTeammatePaperBatchV1`.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CloudOff,
  Info,
  Loader2,
  Printer,
  UserRound,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import type { Plc, PlcMember } from '@/types';
import {
  countSelectedSheets,
  useTeammatePrintContext,
  type TeammatePrintRoster,
} from '@/hooks/usePlcTeammatePrintContext';

interface PlcTeammatePrintModalProps {
  plc: Plc;
  plcQuizId: string;
  quizTitle: string;
  /** Teammates the caller may print for — the PLC's members minus themselves. */
  teammates: PlcMember[];
  onClose: () => void;
}

const bannerClass =
  'flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed';

const memberSort = (a: PlcMember, b: PlcMember): number =>
  (a.displayName || a.email).localeCompare(b.displayName || b.email);

export const PlcTeammatePrintModal: React.FC<PlcTeammatePrintModalProps> = ({
  plc,
  plcQuizId,
  quizTitle,
  teammates,
  onClose,
}) => {
  const { t } = useTranslation();
  const [targetUid, setTargetUid] = useState<string | null>(null);
  const [selectedRosterIds, setSelectedRosterIds] = useState<Set<string>>(
    new Set()
  );
  const [excludedStudentIds, setExcludedStudentIds] = useState<Set<string>>(
    new Set()
  );
  const [expandedRosterId, setExpandedRosterId] = useState<string | null>(null);

  const { context, loading, error } = useTeammatePrintContext(
    plc.id,
    plcQuizId,
    targetUid
  );

  const sortedTeammates = useMemo(
    () => [...teammates].sort(memberSort),
    [teammates]
  );

  const rosters = context?.rosters ?? [];
  const sheetCount = countSelectedSheets(
    rosters,
    selectedRosterIds,
    excludedStudentIds
  );

  const backToPicker = () => {
    setTargetUid(null);
    setSelectedRosterIds(new Set());
    setExcludedStudentIds(new Set());
    setExpandedRosterId(null);
  };

  const toggleRoster = (roster: TeammatePrintRoster) => {
    setSelectedRosterIds((prev) => {
      const next = new Set(prev);
      if (next.has(roster.id)) next.delete(roster.id);
      else next.add(roster.id);
      return next;
    });
  };

  const toggleStudent = (studentId: string) => {
    setExcludedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const picker = (
    <div className="flex flex-col gap-3 py-4">
      <p className="text-sm text-slate-600">
        {t('plcDashboard.teammatePrint.pickerPrompt', {
          defaultValue:
            'Whose classes are these sheets for? They still scan and grade their own stack — and they will see that you printed it.',
        })}
      </p>
      {sortedTeammates.length === 0 ? (
        <p className="text-sm text-slate-500">
          {t('plcDashboard.teammatePrint.noTeammates', {
            defaultValue: 'This PLC has no other members yet.',
          })}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sortedTeammates.map((m) => (
            <li key={m.uid}>
              <button
                type="button"
                onClick={() => setTargetUid(m.uid)}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-brand-blue-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-blue-primary/10">
                  <UserRound
                    className="h-4 w-4 text-brand-blue-primary"
                    aria-hidden="true"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-800">
                    {m.displayName || m.email}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {m.email}
                  </span>
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-slate-400"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const banners = context ? (
    <div className="flex flex-col gap-2">
      {context.blocked === 'no-copy-no-drive' && (
        <p
          className={`${bannerClass} border-brand-red-primary/30 bg-brand-red-primary/5 text-brand-red-dark`}
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span>
            {t('plcDashboard.teammatePrint.blocked', {
              defaultValue:
                '{{name}} has not added this quiz to their library, and SpartBoard cannot reach their Google Drive to add it for them. Ask them to open SpartBoard once and reconnect Drive — then this will work even when they are out.',
              name: context.targetName,
            })}
          </span>
        </p>
      )}
      {context.blocked === null && !context.driveReachable && (
        <p
          className={`${bannerClass} border-amber-200 bg-amber-50 text-amber-800`}
        >
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {t('plcDashboard.teammatePrint.noDrive', {
              defaultValue:
                'SpartBoard cannot reach {{name}}’s Google Drive, so their students’ names are unavailable. This would print an unnamed stack — students write their own names and {{name}} assigns them while reviewing the scan.',
              name: context.targetName,
            })}
          </span>
        </p>
      )}
      {context.driveReachable && context.contentSource === 'synced-group' && (
        <p
          className={`${bannerClass} border-slate-200 bg-slate-50 text-slate-600`}
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {t('plcDashboard.teammatePrint.fromGroup', {
              defaultValue:
                'These questions come from the PLC’s shared copy, not from {{name}}’s own. If they have edited theirs since, the sheets would not match it.',
              name: context.targetName,
            })}
          </span>
        </p>
      )}
      {context.existingBatches.length > 0 && (
        <p
          className={`${bannerClass} border-amber-200 bg-amber-50 text-amber-800`}
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span>
            {t('plcDashboard.teammatePrint.alreadyPrinted', {
              defaultValue:
                '{{count}} stack(s) for this quiz already exist for {{name}}. Printing again is allowed, but each student would get two sheets.',
              count: context.existingBatches.length,
              name: context.targetName,
            })}
          </span>
        </p>
      )}
    </div>
  ) : null;

  const rosterList = (
    <ul className="flex flex-col gap-2">
      {rosters.map((roster) => {
        const selected = selectedRosterIds.has(roster.id);
        const expanded = expandedRosterId === roster.id;
        const namesUnavailable = roster.students.length === 0;
        const count = namesUnavailable
          ? roster.studentCount
          : roster.students.filter((s) => !excludedStudentIds.has(s.id)).length;
        return (
          <li
            key={roster.id}
            className="rounded-xl border border-slate-200 bg-white"
          >
            <div className="flex items-center gap-3 px-3 py-2.5">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggleRoster(roster)}
                aria-label={roster.name}
                className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-800">
                  {roster.name}
                </span>
                <span className="block text-xs text-slate-500">
                  {namesUnavailable
                    ? t('plcDashboard.teammatePrint.unnamedSheets', {
                        defaultValue: '{{count}} unnamed sheets',
                        count,
                      })
                    : t('plcDashboard.teammatePrint.studentCount', {
                        defaultValue: '{{count}} students',
                        count,
                      })}
                </span>
              </span>
              {!namesUnavailable && (
                <button
                  type="button"
                  onClick={() =>
                    setExpandedRosterId(expanded ? null : roster.id)
                  }
                  aria-expanded={expanded}
                  className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span className="sr-only">
                    {t('plcDashboard.teammatePrint.toggleStudents', {
                      defaultValue: 'Show students in {{roster}}',
                      roster: roster.name,
                    })}
                  </span>
                </button>
              )}
            </div>
            {expanded && (
              <ul className="border-t border-slate-100 px-3 py-2">
                {roster.students.map((student) => (
                  <li key={student.id}>
                    <label className="flex items-center gap-2 py-1 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={!excludedStudentIds.has(student.id)}
                        onChange={() => toggleStudent(student.id)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40"
                      />
                      {`${student.lastName}, ${student.firstName}`.trim()}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );

  const preview = (
    <div className="flex flex-col gap-4 py-4">
      {loading && (
        <p className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t('plcDashboard.teammatePrint.loading', {
            defaultValue: 'Loading their classes…',
          })}
        </p>
      )}
      {error && (
        <p
          className={`${bannerClass} border-brand-red-primary/30 bg-brand-red-primary/5 text-brand-red-dark`}
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span>{error}</span>
        </p>
      )}
      {context && (
        <>
          {banners}
          <div>
            <p className="text-xxs font-bold uppercase tracking-wider text-slate-500">
              {t('plcDashboard.teammatePrint.quizHeading', {
                defaultValue: 'Sheets for',
              })}
            </p>
            <p className="mt-0.5 text-sm font-bold text-slate-800">
              {context.quiz.title || quizTitle}
            </p>
            <p className="text-xs text-slate-500">
              {t('plcDashboard.teammatePrint.questionCount', {
                defaultValue: '{{count}} questions',
                count: context.quiz.questions.length,
              })}
            </p>
          </div>
          {rosters.length === 0 ? (
            <p className="text-sm text-slate-500">
              {t('plcDashboard.teammatePrint.noRosters', {
                defaultValue: '{{name}} has no classes set up yet.',
                name: context.targetName,
              })}
            </p>
          ) : (
            <div>
              <p className="mb-2 text-xxs font-bold uppercase tracking-wider text-slate-500">
                {t('plcDashboard.teammatePrint.classesHeading', {
                  defaultValue: 'Which classes are sitting the test?',
                })}
              </p>
              {rosterList}
            </div>
          )}
        </>
      )}
    </div>
  );

  const footer =
    targetUid === null ? null : (
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={backToPicker}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
        >
          {t('plcDashboard.teammatePrint.back', {
            defaultValue: 'Pick a different teacher',
          })}
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {t('plcDashboard.teammatePrint.sheetCount', {
              defaultValue: '{{count}} sheets',
              count: sheetCount,
            })}
          </span>
          <button
            type="button"
            disabled
            title={t('plcDashboard.teammatePrint.printComingSoon', {
              defaultValue:
                'Printing for a teammate is not switched on yet — this preview shows what it would produce.',
            })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            {t('plcDashboard.teammatePrint.print', {
              defaultValue: 'Print',
            })}
          </button>
        </div>
      </div>
    );

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="max-w-lg"
      title={t('plcDashboard.teammatePrint.title', {
        defaultValue: 'Print answer sheets for a teammate',
      })}
      footer={footer}
    >
      {targetUid === null ? picker : preview}
    </Modal>
  );
};
