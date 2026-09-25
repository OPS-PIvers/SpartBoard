/**
 * ProjectSetupGroupsModal — turns a library project into a running one.
 *
 * Creates the run, then commits a group set for one class: either the set the
 * Group Maker pushed over (D7/D8), or hand-named groups for a class with no
 * ClassLink roster, which is the teacher-only tracker of D6.
 */

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Users } from 'lucide-react';
import type {
  ClassRoster,
  ProjectDefinition,
  ProjectGroup,
  ProjectGroupImportEntry,
  ProjectsPendingImport,
} from '@/types';
import { Modal } from '@/components/common/Modal';
import {
  NO_STUDENT_SIGN_IN_WARNING,
  defaultGroupColor,
  projectClassIdFor,
  rosterHasStudentSignIn,
} from '../projectSteps';

/** Matches `commitProjectGroupsV1`'s MAX_GROUPS. */
const MAX_GROUPS = 32;

const labelClass =
  'block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1';
const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40';

interface ProjectSetupGroupsModalProps {
  isOpen: boolean;
  project: ProjectDefinition;
  rosters: ClassRoster[];
  existingGroups: ProjectGroup[];
  pendingImport: ProjectsPendingImport | null | undefined;
  /** Roster to preselect when there is no push to consume. */
  defaultRosterId?: string | null;
  onCommit: (
    entries: ProjectGroupImportEntry[]
  ) => Promise<{ groupsWritten: number; membersResolved: number }>;
  onClose: () => void;
}

export const ProjectSetupGroupsModal: React.FC<
  ProjectSetupGroupsModalProps
> = ({
  isOpen,
  project,
  rosters,
  existingGroups,
  pendingImport,
  defaultRosterId,
  onCommit,
  onClose,
}) => {
  const [rosterId, setRosterId] = useState<string>(
    () => pendingImport?.rosterId ?? defaultRosterId ?? rosters[0]?.id ?? ''
  );
  const [carryNames, setCarryNames] = useState(false);
  const [manualCount, setManualCount] = useState(6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roster = rosters.find((r) => r.id === rosterId);
  const classId = projectClassIdFor(roster) ?? '';
  const isTestRoster = Boolean(
    roster && !roster.classlinkClassId && roster.testClassId
  );
  const usingPush = Boolean(
    pendingImport && pendingImport.rosterId === rosterId
  );

  const groupsInClass = useMemo(
    () => existingGroups.filter((g) => g.classId === classId).length,
    [classId, existingGroups]
  );

  /** The push, resolved against the roster that produced it (D8). */
  const resolved = useMemo(() => {
    if (!pendingImport || !usingPush) return [];
    const byId = new Map(roster?.students.map((s) => [s.id, s]) ?? []);
    // Test-class students sign in by email, so the email is their identity.
    const testEmailOf = (s: { classLinkSourcedId?: string; email?: string }) =>
      isTestRoster && !s.classLinkSourcedId && s.email?.trim()
        ? s.email.trim().toLowerCase()
        : null;
    return pendingImport.groups.map((group, index) => {
      const students = group.studentIds
        .map((id) => byId.get(id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s));
      return {
        // D11 — carrying the Group Maker's own names across is opt-in.
        name: carryNames ? group.name : `Group ${groupsInClass + index + 1}`,
        order: index,
        // D33 — the Group Maker's color comes along; otherwise one is dealt by order.
        color: group.color ?? defaultGroupColor(groupsInClass + index),
        sourcedIds: students
          .map((s) => s.classLinkSourcedId)
          .filter((id): id is string => Boolean(id)),
        testEmails: students
          .map(testEmailOf)
          .filter((email): email is string => Boolean(email)),
        unresolvable: students
          .filter((s) => !s.classLinkSourcedId && !testEmailOf(s))
          .map((s) => `${s.firstName} ${s.lastName}`.trim()),
      };
    });
  }, [
    carryNames,
    groupsInClass,
    isTestRoster,
    pendingImport,
    roster?.students,
    usingPush,
  ]);

  const unresolvable = resolved.flatMap((g) => g.unresolvable);
  const count = usingPush ? resolved.length : manualCount;
  const wouldExceed = groupsInClass + count > MAX_GROUPS;

  // D9 — fresh ids, so a re-import lands alongside what is already tracked.
  const buildEntries = (): ProjectGroupImportEntry[] =>
    usingPush
      ? resolved.map((group) => ({
          id: crypto.randomUUID(),
          name: group.name,
          classId,
          order: groupsInClass + group.order,
          color: group.color,
          classLinkSourcedIds: group.sourcedIds,
          ...(group.testEmails.length > 0
            ? { testEmails: group.testEmails }
            : {}),
        }))
      : Array.from({ length: manualCount }, (_, index) => ({
          id: crypto.randomUUID(),
          name: `Group ${groupsInClass + index + 1}`,
          classId,
          order: groupsInClass + index,
          color: defaultGroupColor(groupsInClass + index),
          classLinkSourcedIds: [],
        }));

  const handleCommit = async (): Promise<void> => {
    if (!roster) return;
    setBusy(true);
    setError(null);
    try {
      await onCommit(buildEntries());
      onClose();
    } catch (commitError) {
      setError(
        commitError instanceof Error
          ? commitError.message
          : 'The groups could not be set up.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Set up groups — ${project.title}`}
      maxWidth="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCommit()}
            disabled={busy || !roster || count === 0 || wouldExceed}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-blue-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            <Users className="h-4 w-4" aria-hidden />
            {busy
              ? 'Setting up…'
              : `Add ${count} group${count === 1 ? '' : 's'}`}
          </button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <div>
          <label className={labelClass} htmlFor="project-setup-class">
            Class
          </label>
          <select
            id="project-setup-class"
            value={rosterId}
            onChange={(e) => setRosterId(e.target.value)}
            className={inputClass}
          >
            {rosters.length === 0 && <option value="">No classes yet</option>}
            {rosters.map((r) => (
              <option key={r.id} value={r.id}>
                {rosterHasStudentSignIn(r)
                  ? r.name
                  : `${r.name}, no student sign-in`}
              </option>
            ))}
          </select>
          {groupsInClass > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              This class already has {groupsInClass} group
              {groupsInClass === 1 ? '' : 's'} on this project. New ones are
              added alongside them.
            </p>
          )}
        </div>

        {roster && !rosterHasStudentSignIn(roster) && (
          <p
            role="note"
            className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            {NO_STUDENT_SIGN_IN_WARNING}
          </p>
        )}

        {usingPush ? (
          <div className="space-y-3">
            <p className="text-sm font-bold text-slate-700">
              From the Group Maker
            </p>
            <ul className="space-y-1">
              {resolved.map((group) => (
                <li
                  key={group.name}
                  className="flex items-center justify-between text-sm text-slate-700"
                >
                  <span className="font-semibold">{group.name}</span>
                  <span className="text-xs text-slate-500">
                    {group.sourcedIds.length + group.testEmails.length} student
                    {group.sourcedIds.length + group.testEmails.length === 1
                      ? ''
                      : 's'}
                  </span>
                </li>
              ))}
            </ul>

            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={carryNames}
                onChange={(e) => setCarryNames(e.target.checked)}
                className="rounded border-slate-300"
              />
              Use the Group Maker&apos;s own group names on the board
            </label>

            {unresolvable.length > 0 && (
              <p className="text-xs text-amber-700">
                {unresolvable.join(', ')}{' '}
                {unresolvable.length === 1 ? 'has' : 'have'} no district account
                on this roster, so they cannot update their group. You can still
                track them yourself.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <label className={labelClass} htmlFor="project-setup-count">
              How many groups?
            </label>
            <input
              id="project-setup-count"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_GROUPS}
              value={manualCount}
              onChange={(e) =>
                setManualCount(
                  Math.max(1, Math.min(MAX_GROUPS, Number(e.target.value) || 1))
                )
              }
              className={`${inputClass} w-28`}
            />
            <p className="text-xs text-slate-500">
              Named Group {groupsInClass + 1}–{groupsInClass + manualCount}. Put
              students in them afterwards with Manage groups.
            </p>
            {pendingImport && !usingPush && (
              <p className="text-xs text-slate-500">
                A Group Maker set is waiting for a different class — pick that
                class above to use it.
              </p>
            )}
          </div>
        )}

        {wouldExceed && (
          <p className="flex items-start gap-1.5 text-xs font-semibold text-brand-red-primary">
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              aria-hidden
            />
            That would put this class over {MAX_GROUPS} groups.
          </p>
        )}

        {error && (
          <p
            role="status"
            className="text-xs font-semibold text-brand-red-primary"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
};
