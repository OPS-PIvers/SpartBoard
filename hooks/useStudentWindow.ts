import { useServerNow } from '@/hooks/useServerNow';
import {
  getWindowState,
  resolveEffectiveWindow,
  type AssignmentWindowState,
  type NullableWindowFields,
  type WindowFields,
} from '@/utils/assignmentWindow';
import { hasStudentWindows } from '@/utils/studentWindow';

export interface StudentWindowGate {
  /** False when this app leaves the window to the server. */
  enforced: boolean;
  window: WindowFields;
  state: AssignmentWindowState;
  /** Server-offset clock, ticking while the window has an edge. */
  now: number;
}

/** One student's Opens and Closes, re-checked as the clock passes an edge; only on sessions a flagged teacher saved. */
export function useStudentWindow(
  session:
    (NullableWindowFields & { studentWindows?: unknown }) | null | undefined,
  pointer: NullableWindowFields | null | undefined
): StudentWindowGate {
  const on = !!session && hasStudentWindows(session);
  const window = on ? resolveEffectiveWindow(session, pointer) : {};
  const bounded = window.openAt !== undefined || window.closeAt !== undefined;
  const now = useServerNow(bounded ? 5000 : null);
  return {
    enforced: on && bounded,
    window,
    state: getWindowState(window, now),
    now,
  };
}
