import type { ProjectGroup, ProjectGroupEvent, ProjectStep } from '@/types';
import {
  STEP_STATE_LABELS,
  resolveGroupColor,
  projectClassIdFor,
  stepStateOf,
} from './projectSteps';

/** D36 — per-row work/upload listeners stay on up to this many groups; past it only the expanded row listens. */
export const DOT_GROUP_LIMIT = 15;

/** D31 — past either count the cells drop their marks and become color-only chips. */
export const DENSE_GROUPS = 10;
export const DENSE_STEPS = 8;

interface RosterLike {
  id: string;
  name: string;
  classlinkClassId?: string;
  testClassId?: string;
}

export interface BoardClassOption {
  id: string;
  label: string;
}

/** The run's classes, or (in a sub share, where the run view has none) the classes its groups are in. */
export function boardClassIds(
  run: { classIds?: string[] } | null | undefined,
  groups: Pick<ProjectGroup, 'classId'>[]
): string[] {
  if (Array.isArray(run?.classIds) && run.classIds.length > 0) {
    return run.classIds;
  }
  return [...new Set(groups.map((g) => g.classId).filter(Boolean))];
}

/** D32 — run names first (D43), then a matching roster, then "Class N". */
export function boardClassOptions(
  classIds: string[],
  classNames: Record<string, string> | undefined,
  rosters: RosterLike[]
): BoardClassOption[] {
  return classIds.map((id, index) => {
    const roster = rosters.find((r) => projectClassIdFor(r) === id);
    // Blank names fall through, which `??` would not do.
    const label =
      [classNames?.[id], roster?.name]
        .map((name) => name?.trim() ?? '')
        .find((name) => name.length > 0) ?? `Class ${index + 1}`;
    return { id, label };
  });
}

/** D32 — the saved class when the run still has it, otherwise the run's first class. */
export function resolveBoardClassId(
  saved: string | null | undefined,
  classIds: string[]
): string | null {
  if (saved && classIds.includes(saved)) return saved;
  return classIds[0] ?? null;
}

export function rosterForClass<T extends RosterLike>(
  rosters: T[],
  classId: string | null | undefined
): T | undefined {
  if (!classId) return undefined;
  return rosters.find((r) => projectClassIdFor(r) === classId);
}

/** D33 — stored color, else dealt by order. */
export const groupColorOf = (group: Pick<ProjectGroup, 'color' | 'order'>) =>
  resolveGroupColor(group.color, group.order);

export const cellKey = (groupId: string, stepId: string): string =>
  `${groupId}:${stepId}`;

export interface ReviewCell {
  groupId: string;
  stepId: string;
}

/** D36 — every ready-for-review cell, in board order (row, then step). */
export function reviewCells(
  groups: Pick<ProjectGroup, 'id' | 'stepStates'>[],
  steps: ProjectStep[]
): ReviewCell[] {
  const cells: ReviewCell[] = [];
  for (const group of groups) {
    for (const step of steps) {
      if (stepStateOf(group, step.id) === 'readyForReview') {
        cells.push({ groupId: group.id, stepId: step.id });
      }
    }
  }
  return cells;
}

/** D36 — the steps a group has a link or file tagged to. */
export function stepsWithWork(
  links: { stepId?: string }[],
  uploads: { stepId?: string }[]
): Set<string> {
  const ids = new Set<string>();
  for (const item of [...links, ...uploads]) {
    if (item.stepId) ids.add(item.stepId);
  }
  return ids;
}

export function relativeTime(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const stepTitle = (steps: ProjectStep[], stepId?: string): string | null =>
  stepId ? (steps.find((s) => s.id === stepId)?.title ?? null) : null;

/** D35 — "Teacher set 'Research' to Done". */
export function describeEvent(
  event: Pick<
    ProjectGroupEvent,
    'actorRole' | 'actorUid' | 'kind' | 'stepId' | 'to' | 'detail'
  >,
  steps: ProjectStep[],
  nameOf: (uid: string) => string | undefined
): string {
  const actor =
    event.actorRole === 'teacher'
      ? 'Teacher'
      : (nameOf(event.actorUid) ?? 'A student');
  const step = stepTitle(steps, event.stepId);
  switch (event.kind) {
    case 'stepState': {
      const to = event.to ? STEP_STATE_LABELS[event.to] : '';
      return step
        ? `${actor} set '${step}' to ${to}`
        : `${actor} changed a step to ${to}`;
    }
    case 'workLink':
      return step
        ? `${actor} added a link for '${step}'`
        : `${actor} added a link`;
    case 'upload':
      return event.detail
        ? `${actor} uploaded ${event.detail}`
        : `${actor} uploaded a file`;
    default:
      return `${actor} changed the group`;
  }
}
