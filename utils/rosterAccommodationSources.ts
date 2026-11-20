import type { RosterGroup, Student, StudentOverride } from '@/types';
import {
  isEmptyStudentOverride,
  setRosterDefaultOverride,
  sharedStudentOverride,
} from './rosterDefaultOverrides';

export interface GroupAccommodations {
  group: RosterGroup;
  /** Members still on the roster, sorted as the roster is. */
  memberIds: string[];
  /** The settings every member has in common. */
  shared: StudentOverride;
}

export interface StudentAccommodationSources {
  /** Each group that gives this student something, with what it gives. */
  fromGroups: Array<{ group: RosterGroup; override: StudentOverride }>;
  /** What this student has beyond their groups. */
  own: StudentOverride;
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

export const groupAccommodations = (
  groups: RosterGroup[],
  sortedStudents: Student[],
  overrides: Record<string, StudentOverride>
): GroupAccommodations[] =>
  groups.map((group) => {
    const memberIds = sortedStudents
      .filter((s) => group.studentIds.includes(s.id))
      .map((s) => s.id);
    return {
      group,
      memberIds,
      shared: sharedStudentOverride(overrides, memberIds),
    };
  });

/** Splits a student's settings into what their groups give and what is their own. */
export const studentAccommodationSources = (
  studentId: string,
  groups: GroupAccommodations[],
  overrides: Record<string, StudentOverride>
): StudentAccommodationSources => {
  const mine = groups.filter(
    (g) => g.memberIds.includes(studentId) && !isEmptyStudentOverride(g.shared)
  );
  const merged: Record<string, unknown> = {};
  for (const g of mine) {
    for (const [key, value] of Object.entries(g.shared)) {
      if (key === 'supports') {
        const prev = (merged.supports as unknown[] | undefined) ?? [];
        merged.supports = [
          ...prev,
          ...(value as unknown[]).filter((x) => !prev.some((y) => same(x, y))),
        ];
      } else merged[key] = value;
    }
  }
  const own: Record<string, unknown> = {};
  const entries: Array<[string, unknown]> = Object.entries(
    overrides[studentId] ?? {}
  );
  for (const [key, value] of entries) {
    if (key === 'supports') {
      const base = (merged.supports as unknown[] | undefined) ?? [];
      const extra = (value as unknown[]).filter(
        (x) => !base.some((y) => same(x, y))
      );
      if (extra.length > 0) own.supports = extra;
    } else if (!same(merged[key], value)) own[key] = value;
  }
  return {
    fromGroups: mine.map((g) => ({ group: g.group, override: g.shared })),
    own: own,
  };
};

const MAX_SUPPORTS = 5;

/** Gives students who join a group its shared settings, and takes them back from students who leave. */
export const applyGroupMembershipChange = (
  overrides: Record<string, StudentOverride>,
  groupShared: StudentOverride,
  added: string[],
  removed: Array<{ id: string; keptByOtherGroups: StudentOverride }>
): Record<string, StudentOverride> => {
  const shared: Record<string, unknown> = { ...groupShared };
  if (Object.keys(shared).length === 0) return overrides;
  let result = overrides;
  for (const id of added) {
    const own: Record<string, unknown> = { ...(result[id] ?? {}) };
    for (const [key, value] of Object.entries(shared)) {
      if (key === 'supports') {
        const mine = (own.supports as unknown[] | undefined) ?? [];
        own.supports = [
          ...mine,
          ...(value as unknown[]).filter((x) => !mine.some((y) => same(x, y))),
        ].slice(0, MAX_SUPPORTS);
      } else own[key] = value;
    }
    result = setRosterDefaultOverride(result, id, own);
  }
  for (const { id, keptByOtherGroups } of removed) {
    const own: Record<string, unknown> = { ...(result[id] ?? {}) };
    const kept: Record<string, unknown> = { ...keptByOtherGroups };
    for (const [key, value] of Object.entries(shared)) {
      if (key === 'supports') {
        const keep = (kept.supports as unknown[] | undefined) ?? [];
        const next = ((own.supports as unknown[] | undefined) ?? []).filter(
          (x) =>
            keep.some((y) => same(x, y)) ||
            !(value as unknown[]).some((y) => same(x, y))
        );
        if (next.length > 0) own.supports = next;
        else delete own.supports;
      } else if (same(own[key], value) && !same(kept[key], value)) {
        delete own[key];
      }
    }
    result = setRosterDefaultOverride(result, id, own);
  }
  return result;
};
