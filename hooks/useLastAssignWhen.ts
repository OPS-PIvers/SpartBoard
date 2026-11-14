import { useContext, useState } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import {
  useLastAssignSettings,
  resetLastAssignSettingsCache,
  type LastAssignSettingsSpec,
} from '@/hooks/useLastAssignSettings';
import type { AssignWhenValue } from '@/components/common/library/assignStepper/assignWhenValue';
import { getLocalIsoDate } from '@/utils/localDate';

export const ASSIGN_DUE_DATE_FEATURE = 'assign-due-date';

/** Profile field holding the teacher's last When step choices, shared by every activity. */
export const LAST_ASSIGN_WHEN_FIELD = 'lastAssignWhen';

/** Starting time for a Date & time due date. */
export const DEFAULT_DUE_TIME = '23:59';

export interface LastAssignWhen {
  mode: 'manual' | 'scheduled';
  allowLate: boolean;
  /** Scheduled opens when assigned, or at a set date. */
  opens: 'now' | 'date';
  due: 'ended' | 'date';
  dueTime: string;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseLastAssignWhen(raw: unknown): LastAssignWhen | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.mode !== 'manual' && r.mode !== 'scheduled') return null;
  return {
    mode: r.mode,
    allowLate: r.allowLate === true,
    opens: r.opens === 'date' ? 'date' : 'now',
    due: r.due === 'date' ? 'date' : 'ended',
    dueTime:
      typeof r.dueTime === 'string' && TIME_RE.test(r.dueTime)
        ? r.dueTime
        : DEFAULT_DUE_TIME,
  };
}

const WHEN_SPEC: LastAssignSettingsSpec<LastAssignWhen> = {
  field: LAST_ASSIGN_WHEN_FIELD,
  parse: parseLastAssignWhen,
  logTag: 'useLastAssignWhen',
};

/** Test hook: forget cached reads between cases. */
export function resetLastAssignWhenCache(): void {
  resetLastAssignSettingsCache(LAST_ASSIGN_WHEN_FIELD);
}

/** The starting When value with the due date on and the teacher's last choices applied. */
export function withRememberedWhen(
  seed: AssignWhenValue,
  last: LastAssignWhen | null,
  now: Date = new Date()
): AssignWhenValue {
  const due = last?.due ?? 'ended';
  return {
    mode: last?.mode ?? seed.mode,
    availability: {
      ...seed.availability,
      allowLate: last?.allowLate ?? seed.availability.allowLate,
      opensOnAssign: (last?.opens ?? 'now') === 'now',
      manualDue:
        due === 'date'
          ? {
              kind: 'date',
              day: getLocalIsoDate(now),
              time: last?.dueTime ?? DEFAULT_DUE_TIME,
            }
          : { kind: 'ended' },
    },
  };
}

/** What to remember from the When value the teacher assigned with. */
export function lastWhenFrom(
  value: AssignWhenValue,
  previous: LastAssignWhen | null
): LastAssignWhen {
  const due = value.availability.manualDue;
  return {
    mode: value.mode,
    allowLate: value.availability.allowLate,
    opens: value.availability.opensOnAssign === false ? 'date' : 'now',
    due: due?.kind ?? previous?.due ?? 'ended',
    dueTime:
      due?.kind === 'date' ? due.time : (previous?.dueTime ?? DEFAULT_DUE_TIME),
  };
}

export interface AssignWhenState {
  when: AssignWhenValue;
  setWhen: (next: AssignWhenValue) => void;
  /** Starts over from a new default, e.g. when Assign opens on another item. */
  reseed: (seed: AssignWhenValue) => void;
  /** Saves the choices for next time; call on Assign. */
  remember: (value: AssignWhenValue) => void;
  /** The due date row shows. */
  dueDate: boolean;
}

/** The assign stepper's When value; with the due date flag on, it starts from the teacher's last choices. */
export function useAssignWhen(seed: () => AssignWhenValue): AssignWhenState {
  const auth = useContext(AuthContext);
  const dueDate = !!auth?.canAccessFeature(ASSIGN_DUE_DATE_FEATURE);
  const last = useLastAssignSettings(WHEN_SPEC, auth?.user?.uid, dueDate);
  const [state, setState] = useState<{
    seed: AssignWhenValue;
    edited: AssignWhenValue | null;
  }>(() => ({ seed: seed(), edited: null }));
  // Until the teacher edits it, a last-used value that loads late still applies.
  const when =
    state.edited ??
    (dueDate ? withRememberedWhen(state.seed, last.lastUsed) : state.seed);
  return {
    when,
    setWhen: (next) => setState((s) => ({ ...s, edited: next })),
    reseed: (next) => setState({ seed: next, edited: null }),
    remember: (value) => {
      if (dueDate) last.save(lastWhenFrom(value, last.lastUsed));
    },
    dueDate,
  };
}
