/**
 * AssignStudentPicker — two-panel student picker for M17 individual
 * targeting (spec §5 B1, Decision 15).
 *
 * Left panel: rosters with saved group chips. Right panel: a searchable
 * student checklist for the active roster, with per-roster select-all.
 * A removable-chip strip summarizes the full cross-roster selection; the
 * footer shows the selected count. Reads students via `useRosters` (Drive)
 * — this component takes the already-loaded `rosters` array and never
 * writes PII to Firestore itself.
 *
 * Manually-created students (`classLinkSourcedId` undefined, and not a
 * test-class roster member) render disabled with an inline explanation —
 * they are never selectable-then-silently-dropped (spec §2a).
 *
 * Reference cloned: `components/common/library/AssignModal.tsx` (light-
 * surface modal chrome) and `PeriodSelector.tsx` (checkbox-list pattern).
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Search, SearchX, Users, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import type { ClassRoster, StudentOverride, StudentTargetRef } from '@/types';
import {
  resolveStudentTargetRef,
  studentTargetRefKey,
} from '@/utils/studentTargetRef';

const MODAL_LABEL_ID = 'assign-student-picker-title';

export interface AssignStudentPickerProps {
  isOpen: boolean;
  onClose: () => void;
  rosters: ClassRoster[];
  /** Currently-selected targets (controlled — e.g. re-opening on an existing assignment). */
  selected: StudentTargetRef[];
  /** Per-student overrides, keyed by `studentTargetRefKey`. Merged with roster defaults on selection. */
  overridesByKey: Record<string, StudentOverride>;
  /** Group ids previously picked via a group chip (provenance only, spec §2a `targetGroupIds`). */
  selectedGroupIds?: string[];
  onConfirm: (
    selected: StudentTargetRef[],
    overridesByKey: Record<string, StudentOverride>,
    groupIds: string[]
  ) => void;
}

interface RosterStudentRow {
  studentId: string;
  name: string;
  ref: StudentTargetRef | null;
}

export const AssignStudentPicker: React.FC<AssignStudentPickerProps> = ({
  isOpen,
  onClose,
  rosters,
  selected,
  overridesByKey,
  selectedGroupIds = [],
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [activeRosterId, setActiveRosterId] = useState<string | null>(
    rosters[0]?.id ?? null
  );
  const [search, setSearch] = useState('');
  const [draftSelected, setDraftSelected] =
    useState<StudentTargetRef[]>(selected);
  const [draftOverrides, setDraftOverrides] =
    useState<Record<string, StudentOverride>>(overridesByKey);
  const [draftGroupIds, setDraftGroupIds] =
    useState<string[]>(selectedGroupIds);

  // Reset the draft to the caller's controlled values whenever the modal
  // (re)opens, rather than on every prop change — this is the
  // "adjusting state while rendering" pattern (CLAUDE.md), keyed on isOpen.
  const [syncedForOpen, setSyncedForOpen] = useState(isOpen);
  if (isOpen !== syncedForOpen) {
    setSyncedForOpen(isOpen);
    if (isOpen) {
      setDraftSelected(selected);
      setDraftOverrides(overridesByKey);
      setDraftGroupIds(selectedGroupIds);
      setActiveRosterId(rosters[0]?.id ?? null);
      setSearch('');
    }
  }

  // Rosters can populate asynchronously after the modal is already open
  // (rosters=[] at open time). Adjust-state-during-render (CLAUDE.md) rather
  // than an effect: once rosters arrive, seed the first one as active.
  if (activeRosterId === null && rosters.length > 0) {
    setActiveRosterId(rosters[0].id);
  }

  const activeRoster = useMemo(
    () => rosters.find((r) => r.id === activeRosterId) ?? null,
    [rosters, activeRosterId]
  );

  const selectedKeys = useMemo(
    () => new Set(draftSelected.map(studentTargetRefKey)),
    [draftSelected]
  );

  const rows: RosterStudentRow[] = useMemo(() => {
    if (!activeRoster) return [];
    const query = search.trim().toLowerCase();
    return activeRoster.students
      .map((s) => ({
        studentId: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        ref: resolveStudentTargetRef(s, activeRoster),
      }))
      .filter((row) => (query ? row.name.toLowerCase().includes(query) : true));
  }, [activeRoster, search]);

  const applyDefaultOverride = (
    ref: StudentTargetRef,
    roster: ClassRoster,
    studentId: string
  ) => {
    const key = studentTargetRefKey(ref);
    if (draftOverrides[key]) return;
    const defaultOverride = roster.defaultOverridesByStudentId?.[studentId];
    if (!defaultOverride) return;
    setDraftOverrides((prev) => ({ ...prev, [key]: defaultOverride }));
  };

  const toggleStudent = (row: RosterStudentRow) => {
    if (!row.ref || !activeRoster) return;
    const key = studentTargetRefKey(row.ref);
    if (selectedKeys.has(key)) {
      setDraftSelected((prev) =>
        prev.filter((r) => studentTargetRefKey(r) !== key)
      );
    } else {
      setDraftSelected((prev) => [...prev, row.ref as StudentTargetRef]);
      applyDefaultOverride(row.ref, activeRoster, row.studentId);
    }
  };

  // Next roster besides the active one, for the load-error / empty-roster
  // empty-state actions (spec §4 Design Contract: every empty state needs
  // an action). Falls back to closing the modal when there's nowhere else
  // to go.
  const anotherRosterId = activeRoster
    ? (rosters.find((r) => r.id !== activeRoster.id)?.id ?? null)
    : null;

  const switchToAnotherRoster = () => {
    if (anotherRosterId) {
      setActiveRosterId(anotherRosterId);
      setSearch('');
    } else {
      onClose();
    }
  };

  const removeSelected = (key: string) => {
    setDraftSelected((prev) =>
      prev.filter((r) => studentTargetRefKey(r) !== key)
    );
  };

  const targetableRows = rows.filter(
    (r): r is RosterStudentRow & { ref: StudentTargetRef } => r.ref !== null
  );
  const allTargetableSelected =
    targetableRows.length > 0 &&
    targetableRows.every((r) => selectedKeys.has(studentTargetRefKey(r.ref)));

  const toggleSelectAll = () => {
    if (!activeRoster) return;
    if (allTargetableSelected) {
      const keysToRemove = new Set(
        targetableRows.map((r) => studentTargetRefKey(r.ref))
      );
      setDraftSelected((prev) =>
        prev.filter((r) => !keysToRemove.has(studentTargetRefKey(r)))
      );
    } else {
      const toAdd = targetableRows.filter(
        (r) => !selectedKeys.has(studentTargetRefKey(r.ref))
      );
      setDraftSelected((prev) => [...prev, ...toAdd.map((r) => r.ref)]);
      toAdd.forEach((r) =>
        applyDefaultOverride(r.ref, activeRoster, r.studentId)
      );
    }
  };

  const nameByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rosters) {
      for (const s of r.students) {
        const ref = resolveStudentTargetRef(s, r);
        if (ref)
          map.set(
            studentTargetRefKey(ref),
            `${s.firstName} ${s.lastName}`.trim()
          );
      }
    }
    return map;
  }, [rosters]);

  const handleConfirm = () => {
    // Prune overrides for students no longer selected.
    const selectedSet = new Set(draftSelected.map(studentTargetRefKey));
    const prunedOverrides: Record<string, StudentOverride> = {};
    for (const [key, override] of Object.entries(draftOverrides)) {
      if (selectedSet.has(key)) prunedOverrides[key] = override;
    }
    onConfirm(draftSelected, prunedOverrides, draftGroupIds);
    onClose();
  };

  const customHeader = (
    <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <Users
          className="w-4 h-4 text-brand-blue-primary shrink-0"
          aria-hidden="true"
        />
        <h3
          id={MODAL_LABEL_ID}
          className="font-black text-lg text-slate-800 truncate"
        >
          {t('assignStudentPicker.title', { defaultValue: 'Choose students' })}
        </h3>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-slate-400 hover:text-slate-600 p-1 rounded-full transition-colors"
        aria-label={t('common.close', { defaultValue: 'Close' })}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between gap-3 px-6 py-3">
      <span className="text-xs font-bold text-slate-500">
        {t('assignStudentPicker.selectedCount', {
          count: draftSelected.length,
          defaultValue: '{{count}} selected',
        })}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
        >
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={draftSelected.length === 0}
          className="px-5 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-sm font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('assignStudentPicker.confirm', { defaultValue: 'Add students' })}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      customHeader={customHeader}
      footer={footer}
      footerClassName="shrink-0 border-t border-slate-200 bg-white"
      maxWidth="max-w-3xl"
      className="bg-white rounded-2xl shadow-2xl"
      contentClassName="p-0"
      ariaLabelledby={MODAL_LABEL_ID}
    >
      {draftSelected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 py-3 border-b border-slate-100">
          {draftSelected.map((ref) => {
            const key = studentTargetRefKey(ref);
            const resolvedName = nameByKey.get(key);
            const unknownLabel = t('assignStudentPicker.unknownStudent', {
              defaultValue: 'Unknown student',
            });
            const displayName = resolvedName ?? unknownLabel;
            return (
              <span
                key={key}
                title={resolvedName ? undefined : key}
                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-brand-blue-lighter/40 text-brand-blue-dark text-xxs font-bold"
              >
                {displayName}
                <button
                  type="button"
                  onClick={() => removeSelected(key)}
                  className="hover:bg-brand-blue-primary/20 rounded-full p-0.5 transition-colors"
                  aria-label={t('assignStudentPicker.removeStudent', {
                    name: displayName,
                    defaultValue: 'Remove {{name}}',
                  })}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="flex" style={{ height: 380 }}>
        <div className="w-56 shrink-0 border-r border-slate-100 overflow-y-auto custom-scrollbar py-2">
          {rosters.map((roster) => (
            <div key={roster.id}>
              <button
                type="button"
                onClick={() => setActiveRosterId(roster.id)}
                className={`w-full text-left px-4 py-2 text-sm font-bold transition-colors ${
                  roster.id === activeRosterId
                    ? 'bg-brand-blue-lighter/30 text-brand-blue-dark'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {roster.name}
                <span className="block text-xxs font-medium text-slate-400">
                  {roster.studentCount}{' '}
                  {t('assignStudentPicker.students', {
                    defaultValue: 'students',
                  })}
                </span>
              </button>
              {roster.groups && roster.groups.length > 0 && (
                <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                  {roster.groups.map((group) => {
                    const groupIdSet = new Set(group.studentIds);
                    const members = roster.students.filter((s) =>
                      groupIdSet.has(s.id)
                    );
                    const targetableMembers = members
                      .map((s) => ({
                        studentId: s.id,
                        ref: resolveStudentTargetRef(s, roster),
                      }))
                      .filter(
                        (
                          r
                        ): r is { studentId: string; ref: StudentTargetRef } =>
                          r.ref !== null
                      );
                    const skippedMembers = members.filter(
                      (s) => resolveStudentTargetRef(s, roster) === null
                    );
                    const hasSkipped = skippedMembers.length > 0;
                    return (
                      <div key={group.id} className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveRosterId(roster.id);
                            setSearch('');
                            const toAdd = targetableMembers.filter(
                              (r) =>
                                !selectedKeys.has(studentTargetRefKey(r.ref))
                            );
                            setDraftSelected((prev) => [
                              ...prev,
                              ...toAdd.map((r) => r.ref),
                            ]);
                            toAdd.forEach((r) =>
                              applyDefaultOverride(r.ref, roster, r.studentId)
                            );
                            // Provenance only (spec §2a) — recorded once, never
                            // retroactively edited by later individual removals.
                            setDraftGroupIds((prev) =>
                              prev.includes(group.id)
                                ? prev
                                : [...prev, group.id]
                            );
                          }}
                          className="px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xxs font-bold text-slate-600 transition-colors"
                        >
                          {group.name}
                          {hasSkipped &&
                            ` (${targetableMembers.length}/${members.length})`}
                        </button>
                        {hasSkipped && (
                          <span className="text-xxs text-slate-400 pl-1 max-w-[11rem]">
                            {t('assignStudentPicker.groupSkippedNote', {
                              names: skippedMembers
                                .map((s) =>
                                  `${s.firstName} ${s.lastName}`.trim()
                                )
                                .join(', '),
                              defaultValue:
                                'Not added (no ClassLink sign-in): {{names}}',
                            })}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {rosters.length === 0 && (
            <p className="text-xs text-slate-400 italic px-4 py-3">
              {t('assignStudentPicker.noRosters', {
                defaultValue: 'No rosters available.',
              })}
            </p>
          )}
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 shrink-0">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('assignStudentPicker.searchPlaceholder', {
                  defaultValue: 'Search students…',
                })}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
              />
            </div>
            {activeRoster && targetableRows.length > 0 && (
              <label className="flex items-center gap-1.5 text-xxs font-bold text-slate-500 whitespace-nowrap cursor-pointer">
                <input
                  type="checkbox"
                  checked={allTargetableSelected}
                  onChange={toggleSelectAll}
                  className="rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary"
                />
                {t('assignStudentPicker.selectAll', {
                  defaultValue: 'Select all',
                })}
              </label>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
            {rows.map((row) => {
              const disabled = row.ref === null;
              const checked = row.ref
                ? selectedKeys.has(studentTargetRefKey(row.ref))
                : false;
              return (
                <label
                  key={row.studentId}
                  className={`flex flex-col gap-0.5 px-4 py-1.5 ${
                    disabled
                      ? 'opacity-60 cursor-not-allowed'
                      : 'cursor-pointer hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleStudent(row)}
                      className="rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary disabled:opacity-50"
                    />
                    <span className="text-sm text-slate-800">{row.name}</span>
                  </span>
                  {disabled && (
                    <span className="text-xxs text-slate-400 pl-6">
                      {t('assignStudentPicker.needsSso', {
                        defaultValue:
                          'Individual assignment requires ClassLink sign-in',
                      })}
                    </span>
                  )}
                </label>
              );
            })}
            {activeRoster && rows.length === 0 && (
              <div
                className="h-full min-h-[12rem]"
                style={{ containerType: 'size' }}
              >
                {activeRoster.loadError ? (
                  <ScaledEmptyState
                    icon={AlertCircle}
                    title={t('assignStudentPicker.loadErrorTitle', {
                      defaultValue: "Couldn't load students",
                    })}
                    subtitle={t('assignStudentPicker.loadErrorSubtitle', {
                      defaultValue: 'Reopen the roster to try again.',
                    })}
                    iconClassName="text-brand-red-primary"
                    titleClassName="text-slate-700"
                    subtitleClassName="text-slate-500"
                    action={
                      <button
                        type="button"
                        onClick={switchToAnotherRoster}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                      >
                        {anotherRosterId
                          ? t('assignStudentPicker.chooseAnotherRoster', {
                              defaultValue: 'Choose another class',
                            })
                          : t('common.close', { defaultValue: 'Close' })}
                      </button>
                    }
                  />
                ) : search.trim() ? (
                  <ScaledEmptyState
                    icon={SearchX}
                    title={t('assignStudentPicker.noMatchesTitle', {
                      defaultValue: 'No matches',
                    })}
                    subtitle={t('assignStudentPicker.noMatches', {
                      defaultValue: 'No students match your search.',
                    })}
                    iconClassName="text-slate-300"
                    titleClassName="text-slate-700"
                    subtitleClassName="text-slate-500"
                    action={
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                      >
                        {t('assignStudentPicker.clearSearch', {
                          defaultValue: 'Clear search',
                        })}
                      </button>
                    }
                  />
                ) : (
                  <ScaledEmptyState
                    icon={Users}
                    title={t('assignStudentPicker.emptyRosterTitle', {
                      defaultValue: 'No students',
                    })}
                    subtitle={t('assignStudentPicker.emptyRosterSubtitle', {
                      defaultValue: 'This roster has no students yet.',
                    })}
                    iconClassName="text-slate-300"
                    titleClassName="text-slate-700"
                    subtitleClassName="text-slate-500"
                    action={
                      <button
                        type="button"
                        onClick={switchToAnotherRoster}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                      >
                        {anotherRosterId
                          ? t('assignStudentPicker.chooseAnotherRoster', {
                              defaultValue: 'Choose another class',
                            })
                          : t('common.close', { defaultValue: 'Close' })}
                      </button>
                    }
                  />
                )}
              </div>
            )}
            {!activeRoster && (
              <div
                className="h-full min-h-[12rem]"
                style={{ containerType: 'size' }}
              >
                <ScaledEmptyState
                  icon={Users}
                  title={t('assignStudentPicker.selectRosterTitle', {
                    defaultValue: 'Select a roster',
                  })}
                  subtitle={t('assignStudentPicker.selectRoster', {
                    defaultValue: 'Select a roster to see its students.',
                  })}
                  iconClassName="text-slate-300"
                  titleClassName="text-slate-700"
                  subtitleClassName="text-slate-500"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
