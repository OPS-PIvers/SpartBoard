import { useContext, useState } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import {
  useLastAssignSettings,
  resetLastAssignSettingsCache,
  type LastAssignSettingsSpec,
} from '@/hooks/useLastAssignSettings';
import type { AssignWhenValue } from '@/components/common/library/assignStepper/assignWhenValue';
import type { AssignActivity } from '@/components/common/library/assignStepper/assignSteps';
import { getLocalIsoDate } from '@/utils/localDate';
import { manualDueAt, type ManualDue } from '@/utils/assignAvailability';

/** Profile field holding the teacher's last When step choices for one activity. */
export const lastAssignWhenField = (activity: AssignActivity): string =>
  `lastAssignWhen_${activity}`;

/** Starting time for a Date & time due date. */
export const DEFAULT_DUE_TIME = '23:59';

export interface LastAssignWhen {
  mode: 'manual' | 'scheduled';
  allowLate: boolean;
  /** Late work on a Manual due, kept apart so a Scheduled choice never unlocks a Manual due. */
  manualLate: boolean;
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
    manualLate: r.manualLate === true,
    opens: r.opens === 'date' ? 'date' : 'now',
    due: r.due === 'date' ? 'date' : 'ended',
    dueTime:
      typeof r.dueTime === 'string' && TIME_RE.test(r.dueTime)
        ? r.dueTime
        : DEFAULT_DUE_TIME,
  };
}

const ACTIVITIES: readonly AssignActivity[] = [
  'quiz',
  'video',
  'gl',
  'flashcards',
  'miniapp',
  'writing',
];

// Stable per activity, since the read hook keys its effect on the spec.
const WHEN_SPECS = Object.fromEntries(
  ACTIVITIES.map((activity) => [
    activity,
    {
      field: lastAssignWhenField(activity),
      parse: parseLastAssignWhen,
      logTag: 'useLastAssignWhen',
    },
  ])
) as Record<AssignActivity, LastAssignSettingsSpec<LastAssignWhen>>;

/** Test hook: forget cached reads between cases. */
export function resetLastAssignWhenCache(): void {
  ACTIVITIES.forEach((a) =>
    resetLastAssignSettingsCache(lastAssignWhenField(a))
  );
}

/** Today at this time, or tomorrow once today's has passed. */
export function nextDue(time: string, now: Date): ManualDue {
  const today = getLocalIsoDate(now);
  const at = manualDueAt({ kind: 'date', day: today, time });
  if (at == null || at > now.getTime())
    return { kind: 'date', day: today, time };
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  );
  return { kind: 'date', day: getLocalIsoDate(tomorrow), time };
}

/** The starting When value with the due date on and the teacher's last choices applied. */
export function withRememberedWhen(
  seed: AssignWhenValue,
  last: LastAssignWhen | null,
  now: Date = new Date(),
  /** Offers the Manual due date; off leaves it unset. */
  manualDue = true
): AssignWhenValue {
  const due = last?.due ?? 'ended';
  return {
    mode: last?.mode ?? seed.mode,
    availability: {
      ...seed.availability,
      allowLate: !last
        ? seed.availability.allowLate
        : last.mode === 'manual'
          ? last.manualLate
          : last.allowLate,
      opensOnAssign: (last?.opens ?? 'now') === 'now',
      manualDue: !manualDue
        ? undefined
        : due === 'date'
          ? nextDue(last?.dueTime ?? DEFAULT_DUE_TIME, now)
          : { kind: 'ended', time: last?.dueTime ?? DEFAULT_DUE_TIME },
    },
  };
}

/** What to remember from the When value the teacher assigned with. */
export function lastWhenFrom(
  value: AssignWhenValue,
  previous: LastAssignWhen | null
): LastAssignWhen {
  const due = value.availability.manualDue;
  const manual = value.mode === 'manual';
  const late = value.availability.allowLate;
  return {
    mode: value.mode,
    allowLate: manual ? (previous?.allowLate ?? false) : late,
    manualLate: manual ? late : (previous?.manualLate ?? false),
    opens: value.availability.opensOnAssign === false ? 'date' : 'now',
    due: due?.kind ?? previous?.due ?? 'ended',
    dueTime: due?.time ?? previous?.dueTime ?? DEFAULT_DUE_TIME,
  };
}

export interface AssignWhenState {
  when: AssignWhenValue;
  setWhen: (next: AssignWhenValue) => void;
  /** Starts over from a new default, e.g. when Assign opens on another item. */
  reseed: (seed: AssignWhenValue) => void;
  /** Saves the choices for next time; call on Assign. */
  remember: (value: AssignWhenValue) => void;
}

/** The assign stepper's When value; it starts from the teacher's last choices for this activity. */
export function useAssignWhen(
  activity: AssignActivity,
  seed: () => AssignWhenValue,
  /** Offers the Manual due date, for hosts whose sessions keep a close with a class gate. */
  { manualDue = false }: { manualDue?: boolean } = {}
): AssignWhenState {
  const auth = useContext(AuthContext);
  const last = useLastAssignSettings(
    WHEN_SPECS[activity],
    auth?.user?.uid,
    true
  );
  const [state, setState] = useState<{
    seed: AssignWhenValue;
    edited: AssignWhenValue | null;
  }>(() => ({ seed: seed(), edited: null }));
  // Until the teacher edits it, a last-used value that loads late still applies.
  const when =
    state.edited ??
    withRememberedWhen(state.seed, last.lastUsed, new Date(), manualDue);
  return {
    when,
    setWhen: (next) => setState((s) => ({ ...s, edited: next })),
    reseed: (next) => setState({ seed: next, edited: null }),
    remember: (value) => {
      // Before the read lands, saving would overwrite choices the teacher never saw.
      if (last.loaded) last.save(lastWhenFrom(value, last.lastUsed));
    },
  };
}
