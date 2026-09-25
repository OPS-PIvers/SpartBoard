/** Pure edit model behind the group manager: a draft of one class's groups and the commit it becomes. */

import type { ProjectGroup, ProjectGroupImportEntry, Student } from '@/types';
import { resolveGroupColor } from './projectSteps';

/** A group member: a roster student, or a stored uid the client has not (yet) named. */
export interface DraftMember {
  studentId?: string;
  uid?: string;
}

export interface DraftGroup {
  id: string;
  name: string;
  /** D33 — absent on a stored group made before colors; the commit deals one by order. */
  color?: string;
  members: DraftMember[];
  isNew: boolean;
}

export interface GroupDraftContext {
  /** Stored member uid → roster `Student.id`, from the pseudonym lookup. */
  studentIdByUid: ReadonlyMap<string, string>;
  studentsById: ReadonlyMap<string, Student>;
  /** Test-class rosters sign students in by email rather than a ClassLink sourcedId. */
  testClass: boolean;
}

export const resolvedStudentId = (
  member: DraftMember,
  ctx: GroupDraftContext
): string | undefined =>
  member.studentId ??
  (member.uid ? ctx.studentIdByUid.get(member.uid) : undefined);

export const memberKey = (
  member: DraftMember,
  ctx: GroupDraftContext
): string => {
  const studentId = resolvedStudentId(member, ctx);
  return studentId ? `s:${studentId}` : `u:${member.uid ?? ''}`;
};

/** Only students with a sign-in can be a member students see. */
export const canJoinGroup = (student: Student, testClass: boolean): boolean =>
  Boolean(student.classLinkSourcedId) || (testClass && Boolean(student.email));

export function draftFromGroups(groups: ProjectGroup[]): DraftGroup[] {
  return [...groups]
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((group) => ({
      id: group.id,
      name: group.name,
      ...(group.color ? { color: group.color } : {}),
      members: (group.memberUids ?? []).map((uid) => ({ uid })),
      isNew: false,
    }));
}

/** Roster students who can join a group and are in none of this draft's groups. */
export function unassignedStudents(
  draft: DraftGroup[],
  students: Student[],
  ctx: GroupDraftContext
): Student[] {
  const grouped = new Set(
    draft.flatMap((g) =>
      g.members
        .map((m) => resolvedStudentId(m, ctx))
        .filter((id): id is string => Boolean(id))
    )
  );
  return students.filter(
    (s) => canJoinGroup(s, ctx.testClass) && !grouped.has(s.id)
  );
}

/** Moves `member` into `targetGroupId`, or out of every group when it is null. */
export function moveMember(
  draft: DraftGroup[],
  member: DraftMember,
  targetGroupId: string | null,
  ctx: GroupDraftContext
): DraftGroup[] {
  const key = memberKey(member, ctx);
  return draft.map((group) => {
    const without = group.members.filter((m) => memberKey(m, ctx) !== key);
    if (group.id !== targetGroupId) {
      return without.length === group.members.length
        ? group
        : { ...group, members: without };
    }
    return { ...group, members: [...without, member] };
  });
}

export function nextGroupName(draft: DraftGroup[]): string {
  const taken = new Set(draft.map((g) => g.name.trim().toLowerCase()));
  let n = draft.length + 1;
  while (taken.has(`group ${n}`)) n += 1;
  return `Group ${n}`;
}

/** Deals the unassigned students into the smallest groups first, in roster order. */
export function spreadUnassigned(
  draft: DraftGroup[],
  unassigned: Student[]
): DraftGroup[] {
  if (draft.length === 0) return draft;
  const next = draft.map((g) => ({ ...g, members: [...g.members] }));
  for (const student of unassigned) {
    const smallest = next.reduce((min, g) =>
      g.members.length < min.members.length ? g : min
    );
    smallest.members.push({ studentId: student.id });
  }
  return next;
}

export interface GroupCommit {
  entries: ProjectGroupImportEntry[];
  deleteGroupIds: string[];
}

/** The groups that changed, as full memberships, plus the ones removed. */
export function buildGroupCommit(
  original: DraftGroup[],
  draft: DraftGroup[],
  classId: string,
  ctx: GroupDraftContext
): GroupCommit {
  const originalById = new Map(original.map((g) => [g.id, g]));
  const keysOf = (g: DraftGroup) =>
    g.members
      .map((m) => memberKey(m, ctx))
      .sort()
      .join('|');

  const entries: ProjectGroupImportEntry[] = [];
  draft.forEach((group, order) => {
    const before = originalById.get(group.id);
    const beforeOrder = before ? original.indexOf(before) : -1;
    const name = group.name.trim() || `Group ${order + 1}`;
    const unchanged =
      before &&
      before.name === name &&
      before.color === group.color &&
      beforeOrder === order &&
      keysOf(before) === keysOf(group);
    if (unchanged) return;

    const sourcedIds: string[] = [];
    const testEmails: string[] = [];
    const keepMemberUids: string[] = [];
    for (const member of group.members) {
      const studentId = resolvedStudentId(member, ctx);
      const student = studentId ? ctx.studentsById.get(studentId) : undefined;
      if (student?.classLinkSourcedId) {
        sourcedIds.push(student.classLinkSourcedId);
      } else if (ctx.testClass && student?.email) {
        testEmails.push(student.email.toLowerCase());
      } else if (member.uid) {
        keepMemberUids.push(member.uid);
      }
    }
    entries.push({
      id: group.id,
      name,
      classId,
      order,
      color: resolveGroupColor(group.color, order),
      classLinkSourcedIds: sourcedIds,
      ...(testEmails.length > 0 ? { testEmails } : {}),
      ...(keepMemberUids.length > 0 ? { keepMemberUids } : {}),
    });
  });

  const kept = new Set(draft.map((g) => g.id));
  const deleteGroupIds = original
    .filter((g) => !kept.has(g.id))
    .map((g) => g.id);
  return { entries, deleteGroupIds };
}
