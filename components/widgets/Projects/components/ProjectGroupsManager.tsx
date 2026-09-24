/** View and edit one class's groups on a project: rename, add, delete, and move students between them. */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Plus,
  Shuffle,
  Trash2,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import type {
  ClassRoster,
  ProjectGroup,
  ProjectGroupImportEntry,
  Student,
} from '@/types';
import { Modal } from '@/components/common/Modal';
import { useAssignmentPseudonymsMulti } from '@/hooks/useAssignmentPseudonyms';
import { groupsForClass, projectClassIdFor } from '../projectSteps';
import {
  buildGroupCommit,
  canJoinGroup,
  draftFromGroups,
  memberKey,
  moveMember,
  nextGroupName,
  resolvedStudentId,
  spreadUnassigned,
  unassignedStudents,
  type DraftGroup,
  type DraftMember,
  type GroupDraftContext,
} from '../groupDraft';

/** Matches `commitProjectGroupsV1`'s MAX_GROUPS and MAX_MEMBERS_PER_GROUP. */
const MAX_GROUPS = 32;
const MAX_MEMBERS = 40;

const labelClass =
  'block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1';
const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40';
const quietButton =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

const DRAG_TYPE = 'application/x-spart-project-member';

interface ProjectGroupsManagerProps {
  isOpen: boolean;
  projectTitle: string;
  /** Absent until the project has run once; names need the run to exist. */
  runId: string | null;
  orgId: string | null | undefined;
  rosters: ClassRoster[];
  groups: ProjectGroup[];
  initialRosterId?: string | null;
  onSave: (
    classId: string,
    entries: ProjectGroupImportEntry[],
    deleteGroupIds: string[]
  ) => Promise<void>;
  onClose: () => void;
}

export const ProjectGroupsManager: React.FC<ProjectGroupsManagerProps> = ({
  isOpen,
  projectTitle,
  runId,
  orgId,
  rosters,
  groups,
  initialRosterId,
  onSave,
  onClose,
}) => {
  const [rosterId, setRosterId] = useState<string>(() => {
    const preferred = rosters.find((r) => r.id === initialRosterId);
    return preferred?.id ?? rosters[0]?.id ?? '';
  });
  const roster = rosters.find((r) => r.id === rosterId);
  const classId = projectClassIdFor(roster) ?? '';
  const classGroups = useMemo(
    () => groupsForClass(groups, classId),
    [classId, groups]
  );

  const groupCountByRoster = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rosters) {
      const id = projectClassIdFor(r);
      counts.set(r.id, groups.filter((g) => g.classId === id).length);
    }
    return counts;
  }, [groups, rosters]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Groups — ${projectTitle}`}
      maxWidth="max-w-5xl"
      contentClassName="flex min-h-0 flex-col px-6 pb-5"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 py-2">
        {roster ? (
          <ClassGroupsEditor
            // A fresh draft per class; the stored groups seed it once.
            key={classId}
            roster={roster}
            classId={classId}
            classGroups={classGroups}
            runId={runId}
            orgId={orgId}
            classPicker={(locked) => (
              <div>
                <label className={labelClass} htmlFor="project-groups-class">
                  Class
                </label>
                <select
                  id="project-groups-class"
                  value={rosterId}
                  disabled={locked}
                  onChange={(e) => setRosterId(e.target.value)}
                  className={`${inputClass} sm:max-w-md`}
                >
                  {rosters.length === 0 && (
                    <option value="">No classes yet</option>
                  )}
                  {rosters.map((r) => {
                    const count = groupCountByRoster.get(r.id) ?? 0;
                    return (
                      <option key={r.id} value={r.id}>
                        {count > 0
                          ? `${r.name} (${count} group${count === 1 ? '' : 's'})`
                          : r.name}
                      </option>
                    );
                  })}
                </select>
                {locked && (
                  <p className="mt-1 text-xs text-slate-500">
                    Save or undo your changes before switching class.
                  </p>
                )}
              </div>
            )}
            onSave={(entries, deleteGroupIds) =>
              onSave(classId, entries, deleteGroupIds)
            }
            onClose={onClose}
          />
        ) : (
          <p className="text-sm text-slate-500">
            Add a class in Classes first, then build its groups here.
          </p>
        )}
      </div>
    </Modal>
  );
};

interface ClassGroupsEditorProps {
  roster: ClassRoster;
  classId: string;
  classGroups: ProjectGroup[];
  runId: string | null;
  orgId: string | null | undefined;
  /** Rendered here so switching class can be locked while edits are unsaved. */
  classPicker: (locked: boolean) => React.ReactNode;
  onSave: (
    entries: ProjectGroupImportEntry[],
    deleteGroupIds: string[]
  ) => Promise<void>;
  onClose: () => void;
}

const studentName = (student: Student): string =>
  `${student.firstName} ${student.lastName}`.trim() || 'Unnamed student';

const ClassGroupsEditor: React.FC<ClassGroupsEditorProps> = ({
  roster,
  classId,
  classGroups,
  runId,
  orgId,
  classPicker,
  onSave,
  onClose,
}) => {
  const [original] = useState<DraftGroup[]>(() => draftFromGroups(classGroups));
  const [draft, setDraft] = useState<DraftGroup[]>(original);
  const [selected, setSelected] = useState<DraftMember | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSignIn = !classId.startsWith('local:');
  const testClass =
    !roster.classlinkClassId?.trim() && Boolean(roster.testClassId?.trim());
  const hasStoredMembers = original.some((g) => g.members.length > 0);
  // The same HMAC pseudonyms `commitProjectGroupsV1` minted, mapped back to roster rows.
  const { byStudentUid, targetRefKeyByStudentUid } =
    useAssignmentPseudonymsMulti(
      hasSignIn && hasStoredMembers ? runId : null,
      [classId],
      orgId
    );

  const ctx = useMemo<GroupDraftContext>(() => {
    const studentsById = new Map(roster.students.map((s) => [s.id, s]));
    // Same `classlink:{sourcedId}` / `test:{emailLower}` keys the pseudonym lookup returns.
    const byRefKey = new Map<string, string>();
    for (const s of roster.students) {
      if (s.classLinkSourcedId)
        byRefKey.set(`classlink:${s.classLinkSourcedId}`, s.id);
      if (s.email) byRefKey.set(`test:${s.email.toLowerCase()}`, s.id);
    }
    const studentIdByUid = new Map<string, string>();
    for (const [uid, refKey] of targetRefKeyByStudentUid) {
      const studentId = byRefKey.get(refKey);
      if (studentId) studentIdByUid.set(uid, studentId);
    }
    return { studentIdByUid, studentsById, testClass };
  }, [roster.students, targetRefKeyByStudentUid, testClass]);

  const namesPending =
    hasSignIn && hasStoredMembers && targetRefKeyByStudentUid.size === 0;

  const commit = useMemo(
    () => buildGroupCommit(original, draft, classId, ctx),
    [classId, ctx, draft, original]
  );
  const changeCount = commit.entries.length + commit.deleteGroupIds.length;
  const isDirty = changeCount > 0;

  const unassigned = namesPending
    ? []
    : unassignedStudents(draft, roster.students, ctx);
  const noSignIn = roster.students.filter((s) => !canJoinGroup(s, testClass));
  const oversized = draft.filter((g) => g.members.length > MAX_MEMBERS);

  const labelFor = (member: DraftMember): string => {
    const studentId = resolvedStudentId(member, ctx);
    const student = studentId ? ctx.studentsById.get(studentId) : undefined;
    if (student) return studentName(student);
    const named = member.uid ? byStudentUid.get(member.uid) : undefined;
    if (named) return `${named.givenName} ${named.familyName}`.trim();
    return namesPending ? 'Loading name…' : 'Student not on this roster';
  };

  const selectedKey = selected ? memberKey(selected, ctx) : null;
  const selectedGroupId = selectedKey
    ? (draft.find((g) =>
        g.members.some((m) => memberKey(m, ctx) === selectedKey)
      )?.id ?? null)
    : null;

  const moveTo = (member: DraftMember, groupId: string | null): void => {
    setDraft((current) => moveMember(current, member, groupId, ctx));
    setSelected(null);
  };

  const toggleSelected = (member: DraftMember): void =>
    setSelected((current) =>
      current && memberKey(current, ctx) === memberKey(member, ctx)
        ? null
        : member
    );

  const addGroup = (): void => {
    setDraft((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: nextGroupName(current),
        members: [],
        isNew: true,
      },
    ]);
  };

  const renameGroup = (groupId: string, name: string): void =>
    setDraft((current) =>
      current.map((g) => (g.id === groupId ? { ...g, name } : g))
    );

  const deleteGroup = (groupId: string): void => {
    setDraft((current) => current.filter((g) => g.id !== groupId));
    setConfirmDeleteId(null);
    if (selectedGroupId === groupId) setSelected(null);
  };

  const handleSave = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await onSave(commit.entries, commit.deleteGroupIds);
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'The groups could not be saved.'
      );
    } finally {
      setBusy(false);
    }
  };

  const dragProps = (member: DraftMember) => ({
    draggable: !namesPending,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, memberKey(member, ctx));
      e.dataTransfer.effectAllowed = 'move';
      setSelected(member);
    },
  });

  const dropProps = (groupId: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (selected) moveTo(selected, groupId);
    },
  });

  const memberChip = (member: DraftMember, groupName: string | null) => {
    const key = memberKey(member, ctx);
    const label = labelFor(member);
    const isSelected = key === selectedKey;
    return (
      <li
        key={key}
        {...dragProps(member)}
        className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-sm ${
          isSelected
            ? 'border-brand-blue-primary bg-brand-blue-primary/10 ring-2 ring-brand-blue-primary/40'
            : 'border-slate-200 bg-white'
        }`}
      >
        <button
          type="button"
          onClick={() => toggleSelected(member)}
          disabled={namesPending}
          aria-pressed={isSelected}
          className="min-w-0 flex-1 truncate text-left font-medium text-slate-800 disabled:cursor-default"
          title={isSelected ? 'Selected — choose where to move' : 'Move'}
        >
          {label}
          {isSelected && (
            <span className="ml-1 text-xs font-bold text-brand-blue-primary">
              · moving
            </span>
          )}
        </button>
        {groupName && (
          <button
            type="button"
            onClick={() => moveTo(member, null)}
            disabled={namesPending}
            aria-label={`Take ${label} out of ${groupName}`}
            title="Take out of group"
            className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </li>
    );
  };

  return (
    <>
      {classPicker(isDirty)}
      {!hasSignIn && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {roster.name} is a hand-built roster, so its students have no district
          sign-in and can&apos;t be put in groups here. You can still name
          groups and move them along the board yourself.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addGroup}
          disabled={draft.length >= MAX_GROUPS}
          className={quietButton}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add group
        </button>
        {unassigned.length > 0 && draft.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setDraft((current) => spreadUnassigned(current, unassigned))
            }
            className={quietButton}
          >
            <Shuffle className="h-4 w-4" aria-hidden />
            Spread {unassigned.length} ungrouped student
            {unassigned.length === 1 ? '' : 's'} across groups
          </button>
        )}
        <p className="text-xs text-slate-500 sm:ml-auto">
          Tap a student, then tap where they go. You can also drag them.
        </p>
      </div>

      {namesPending && (
        <p role="status" className="text-xs text-slate-500">
          Loading student names. You can rename, add and delete groups
          meanwhile.
        </p>
      )}

      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto pr-1 md:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {draft.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              No groups in this class yet. Choose Add group to make one.
            </div>
          )}
          {draft.map((group, index) => {
            const name = group.name.trim() || `Group ${index + 1}`;
            const canReceive =
              selected !== null && selectedGroupId !== group.id;
            return (
              <section
                key={group.id}
                aria-label={name}
                {...dropProps(group.id)}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex items-center gap-1.5">
                  <input
                    value={group.name}
                    onChange={(e) => renameGroup(group.id, e.target.value)}
                    aria-label={`Name of ${name}`}
                    maxLength={60}
                    className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm font-bold text-slate-800 hover:border-slate-300 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
                  />
                  <span className="shrink-0 text-xs text-slate-500">
                    {group.members.length} student
                    {group.members.length === 1 ? '' : 's'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      group.isNew
                        ? deleteGroup(group.id)
                        : setConfirmDeleteId(group.id)
                    }
                    aria-label={`Delete ${name}`}
                    title="Delete group"
                    className="shrink-0 rounded p-1 text-slate-500 hover:bg-red-50 hover:text-brand-red-primary"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>

                {confirmDeleteId === group.id && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-white p-2 text-xs text-slate-700"
                  >
                    <p>
                      Delete {name}? Its progress, links and grade are removed
                      when you save, and its students go back to Not in a group.
                      Files already saved to your Drive stay there.
                    </p>
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-md px-2 py-1 font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteGroup(group.id)}
                        className="rounded-md bg-brand-red-primary px-2 py-1 font-bold text-white"
                      >
                        Delete group
                      </button>
                    </div>
                  </div>
                )}

                <ul className="flex flex-col gap-1">
                  {group.members.map((m) => memberChip(m, name))}
                </ul>
                {group.members.length === 0 && !canReceive && (
                  <p className="text-xs text-slate-400">No students yet.</p>
                )}
                {group.members.length > MAX_MEMBERS && (
                  <p className="text-xs font-semibold text-brand-red-primary">
                    A group holds at most {MAX_MEMBERS} students.
                  </p>
                )}
                {canReceive && (
                  <button
                    type="button"
                    onClick={() => selected && moveTo(selected, group.id)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-brand-blue-primary/50 px-2 py-1.5 text-sm font-semibold text-brand-blue-primary hover:bg-brand-blue-primary/5"
                  >
                    <ArrowRightLeft className="h-4 w-4" aria-hidden />
                    Move here
                  </button>
                )}
              </section>
            );
          })}
        </div>

        {hasSignIn && (
          <section
            aria-label="Not in a group"
            {...dropProps(null)}
            className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3"
          >
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
              <Users className="h-4 w-4" aria-hidden />
              Not in a group
              <span className="text-xs font-normal text-slate-500">
                {unassigned.length}
              </span>
            </h3>
            {selected && selectedGroupId && (
              <button
                type="button"
                onClick={() => moveTo(selected, null)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 px-2 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                <UserMinus className="h-4 w-4" aria-hidden />
                Take out of group
              </button>
            )}
            <ul className="flex flex-col gap-1">
              {unassigned.map((s) => memberChip({ studentId: s.id }, null))}
            </ul>
            {!namesPending && unassigned.length === 0 && (
              <p className="text-xs text-slate-400">Everyone is in a group.</p>
            )}
            {noSignIn.length > 0 && (
              <p className="text-xs text-slate-500">
                {noSignIn.map(studentName).join(', ')}{' '}
                {noSignIn.length === 1 ? 'has' : 'have'} no district sign-in on
                this roster, so they can&apos;t join a group.
              </p>
            )}
          </section>
        )}
      </div>

      {error && (
        <p
          role="status"
          className="flex items-start gap-1.5 text-xs font-semibold text-brand-red-primary"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
        <span className="mr-auto text-xs text-slate-500" role="status">
          {isDirty
            ? `${changeCount} group${changeCount === 1 ? '' : 's'} changed, not saved yet`
            : 'No changes'}
        </span>
        {isDirty && (
          <button
            type="button"
            onClick={() => {
              setDraft(original);
              setSelected(null);
              setConfirmDeleteId(null);
            }}
            disabled={busy}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Undo changes
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          {isDirty ? 'Cancel' : 'Close'}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy || !isDirty || oversized.length > 0}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-blue-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </>
  );
};
