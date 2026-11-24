// Shared state for the Assign dialog's check for classes that already have the item open.
import { useState } from 'react';
import type { ClassRoster } from '@/types';
import {
  findOpenAssignmentClasses,
  type OpenAssignmentClasses,
  type OpenAssignmentInput,
} from '@/utils/openAssignmentClasses';

export type AssignOpenChoice = 'join' | 'new';

export interface AssignOpenElsewhere {
  /** Class ids this item is already open for; they can't be picked again. */
  ids: ReadonlySet<string>;
  /** Names of those classes, in list order. */
  names: readonly string[];
  /** Offered once a new class is picked: add it to the open assignment instead. */
  join?: {
    targetNames: readonly string[];
    value: AssignOpenChoice;
    onChange: (next: AssignOpenChoice) => void;
  };
}

export const listNames = (names: readonly string[]): string =>
  names.length <= 1
    ? (names[0] ?? '')
    : names.length === 2
      ? `${names[0]} and ${names[1]}`
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

export interface AssignOpenCheck {
  /** For the class list: locks open classes and shows the notice. */
  checklist: AssignOpenElsewhere | undefined;
  /** The picks go to the open assignment instead of a new one. */
  joining: boolean;
  /** The assignment they join, while `joining`. */
  joinTarget: OpenAssignmentClasses['joinTarget'];
  /** Picked classes, without any that are already open. */
  classIds: string[];
  /** A picked class is already open, so Assign waits. */
  pickedOpen: boolean;
}

export const ALREADY_ASSIGNED_REASON = 'Already assigned to a picked class.';

/** Assign's two props in the open-check props shape: the extra props for a kind's stepper. */
export interface AssignOpenProps {
  /** This item's assignments, to lock classes it is open for; omit to skip the check. */
  openAssignments?: readonly OpenAssignmentInput[] | null;
  /** Adds the picked classes to an open assignment instead of making a new one. */
  onAddToOpen?: (assignmentId: string, rosterIds: string[]) => Promise<void>;
}

/** Shared state for the Assign dialog's open-class check; null `assignments` turns it off. */
export function useAssignOpenCheck(
  assignments: readonly OpenAssignmentInput[] | null | undefined,
  rosters: readonly ClassRoster[],
  picked: {
    classIds: readonly string[];
    studentsByClass?: Record<string, readonly unknown[] | undefined>;
  },
  /** The work kind or pacing being assigned; copies of another kind don't count. */
  kind?: string
): AssignOpenCheck {
  const pickedClassIds = picked.classIds;
  // Picked students go to a new assignment; joining adds whole classes only.
  const wholeClasses = !Object.values(picked.studentsByClass ?? {}).some(
    (list) => (list?.length ?? 0) > 0
  );
  const [choice, setChoice] = useState<AssignOpenChoice>('join');
  // The dialog mounts per Assign, so the time it opened is the check's time.
  const [openedAt] = useState(() => Date.now());
  const open = assignments
    ? findOpenAssignmentClasses(assignments, rosters, openedAt, kind)
    : null;
  const classIds = open
    ? pickedClassIds.filter((id) => !open.ids.has(id))
    : [...pickedClassIds];
  const pickedOpen = classIds.length !== pickedClassIds.length;
  if (!open || open.ids.size === 0)
    return {
      checklist: undefined,
      joining: false,
      joinTarget: null,
      classIds,
      pickedOpen,
    };
  // A pick the open copy already targets (closed there) would change nothing by joining.
  const target =
    wholeClasses &&
    open.joinTarget &&
    !classIds.some((id) => open.joinTarget?.rosterIds.includes(id))
      ? open.joinTarget
      : null;
  const joining = !!target && classIds.length > 0 && choice === 'join';
  return {
    checklist: {
      ids: open.ids,
      names: open.names,
      ...(target
        ? {
            join: {
              targetNames: target.names,
              value: choice,
              onChange: setChoice,
            },
          }
        : {}),
    },
    joining,
    joinTarget: joining ? target : null,
    classIds,
    pickedOpen,
  };
}
