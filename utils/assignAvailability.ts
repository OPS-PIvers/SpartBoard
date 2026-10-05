import { combineDateAndTime, getLocalIsoDate } from '@/utils/localDate';
import type { PeriodAccess } from '@/types';
import {
  BELL_CLOSE_CUSHION_MS,
  type EpochWindow,
  type PeriodPlan,
  type PeriodPlanRow,
  type PeriodRoster,
} from '@/utils/periodPlan';
import type { AssignTargetingValue } from '@/utils/studentTargetRef';
import type { WorkKind } from '@/utils/gradebook/gradebookCore';

/** 'bell' follows the class period's bell; otherwise a local 'HH:MM'. */
export type AvailabilityTime = string;

export interface AvailabilityPoint {
  /** Local 'YYYY-MM-DD'. */
  day: string;
  time: AvailabilityTime;
}

export interface AvailabilitySpec {
  opens: AvailabilityPoint;
  closes: AvailabilityPoint;
}

/** The Availability & Due Date section's state; `byRoster` present means "Each class". */
export interface AssignAvailability {
  all: AvailabilitySpec;
  byRoster?: Record<string, AvailabilitySpec>;
  allowLate: boolean;
  /** Study Resource only: no close date, the resource stays available. */
  noEnd?: boolean;
}

/** Present when `study-resources` is on: the kind's default, and whether the teacher may change it. */
export interface WorkKindSetting {
  default: WorkKind;
  locked?: boolean;
}

/** The kind the assignment will save as; undefined when the setting is off. */
export function chosenWorkKind(
  value: Pick<AssignTargetingValue, 'workKind'>,
  setting: WorkKindSetting | undefined
): WorkKind | undefined {
  if (!setting) return undefined;
  return setting.locked ? setting.default : (value.workKind ?? setting.default);
}

export type BellWindowFn = (
  roster: PeriodRoster,
  date: Date
) => EpochWindow | null;

const pad = (n: number): string => String(n).padStart(2, '0');

const localTime = (d: Date): string =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Today, start to end of class when bells are known, else now to 11:59 PM. */
export function defaultAvailability(
  now: Date,
  bellAvailable: boolean,
  workKind?: WorkKind
): AssignAvailability {
  const day = getLocalIsoDate(now);
  const rounded = new Date(now);
  rounded.setMinutes(Math.floor(now.getMinutes() / 5) * 5, 0, 0);
  return {
    ...(workKind === 'resource' ? { noEnd: true } : {}),
    all: bellAvailable
      ? { opens: { day, time: 'bell' }, closes: { day, time: 'bell' } }
      : {
          opens: { day, time: localTime(rounded) },
          closes: { day, time: '23:59' },
        },
    allowLate: false,
  };
}

const dayDate = (day: string): Date => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

/** One point as epoch ms; a bell the roster can't resolve that day falls back to the whole day. */
export function resolvePoint(
  point: AvailabilityPoint,
  side: 'opens' | 'closes',
  roster: PeriodRoster | null,
  bellWindow: BellWindowFn | undefined
): number | null {
  if (point.time !== 'bell') return combineDateAndTime(point.day, point.time);
  const bell =
    roster && bellWindow ? bellWindow(roster, dayDate(point.day)) : null;
  if (bell) return side === 'opens' ? bell.openAt : bell.closeAt;
  return combineDateAndTime(point.day, side === 'opens' ? '00:00' : '23:59');
}

export interface ResolvedAvailability {
  openAt?: number;
  /** Absent when late work is allowed: the window never shuts. */
  closeAt?: number;
  /** Latest close across the classes. */
  dueAt?: number;
  /** Each class's close, when there is more than one class. */
  dueAtByRosterId?: Record<string, number>;
  periodPlan?: PeriodPlan;
}

export function specForRoster(
  availability: AssignAvailability,
  rosterId: string
): AvailabilitySpec {
  return availability.byRoster?.[rosterId] ?? availability.all;
}

/** True when the spec closes at or before it opens for any of the classes (or with none checked). */
export function closesBeforeOpens(
  spec: AvailabilitySpec,
  rosters: readonly PeriodRoster[],
  bellWindow: BellWindowFn | undefined
): boolean {
  return (rosters.length > 0 ? rosters : [null]).some((roster) => {
    const open = resolvePoint(spec.opens, 'opens', roster, bellWindow);
    const close = resolvePoint(spec.closes, 'closes', roster, bellWindow);
    return open != null && close != null && close <= open;
  });
}

/** Epoch windows for the selected classes; with none selected, bells fall back to the whole day. */
export function resolveAvailability(
  availability: AssignAvailability,
  rosters: readonly PeriodRoster[],
  bellWindow: BellWindowFn | undefined,
  workKind?: WorkKind
): ResolvedAvailability {
  const resource = workKind === 'resource';
  const noEnd = resource && !!availability.noEnd;
  // A resource has no due date and no late work; its close is where it leaves the student view.
  const keepsOpen = resource ? noEnd : availability.allowLate;
  // "Each class" only applies while two or more classes are checked, as the section shows it.
  const eachClass = rosters.length > 1;
  // A resource keeps no due date to mark the cushion by, so it closes on the bell.
  const cushioned: BellWindowFn | undefined =
    bellWindow && !resource
      ? (roster, date) => {
          const bell = bellWindow(roster, date);
          return (
            bell && { ...bell, closeAt: bell.closeAt + BELL_CLOSE_CUSHION_MS }
          );
        }
      : bellWindow;
  const windows = (rosters.length > 0 ? rosters : [null]).map((roster) => {
    const spec =
      roster && eachClass
        ? specForRoster(availability, roster.id)
        : availability.all;
    return {
      roster,
      openAt: resolvePoint(spec.opens, 'opens', roster, bellWindow),
      dueAt: resolvePoint(spec.closes, 'closes', roster, bellWindow),
      closeAt: resolvePoint(spec.closes, 'closes', roster, cushioned),
    };
  });
  const opens = windows.flatMap((w) => (w.openAt == null ? [] : [w.openAt]));
  const closes = windows.flatMap((w) => (w.closeAt == null ? [] : [w.closeAt]));
  const latestClose = closes.length > 0 ? Math.max(...closes) : undefined;
  const dues = windows.flatMap((w) => (w.dueAt == null ? [] : [w.dueAt]));
  const latestDue = dues.length > 0 ? Math.max(...dues) : undefined;
  const out: ResolvedAvailability = {
    openAt: opens.length > 0 ? Math.min(...opens) : undefined,
    closeAt: keepsOpen ? undefined : latestClose,
    dueAt: resource ? undefined : latestDue,
  };
  if (rosters.length > 1) {
    const rows: Record<string, PeriodPlanRow> = {};
    const dueAtByRosterId: Record<string, number> = {};
    for (const w of windows) {
      if (!w.roster) continue;
      rows[w.roster.id] = {
        source: 'custom',
        openAt: w.openAt ?? undefined,
        closeAt: keepsOpen ? undefined : (w.closeAt ?? undefined),
      };
      if (!resource && w.dueAt != null) dueAtByRosterId[w.roster.id] = w.dueAt;
    }
    out.periodPlan = { mode: 'assignment', rows };
    if (!resource) out.dueAtByRosterId = dueAtByRosterId;
  }
  return out;
}

/** The targeting value a host saves: windows, due date and period plan resolved, the section state dropped. */
export function applyAvailability(
  value: AssignTargetingValue,
  {
    enabled,
    rosters,
    bellWindow,
    workKind: workKindSetting,
    now = new Date(),
  }: {
    /** The host's `assign-availability` flag; off leaves the value untouched. */
    enabled: boolean;
    /** The checked classes. */
    rosters: readonly PeriodRoster[];
    bellWindow: BellWindowFn | undefined;
    /** The host's `study-resources` setting; absent saves no work kind. */
    workKind?: WorkKindSetting;
    now?: Date;
  }
): {
  targeting: AssignTargetingValue;
  dueAtByRosterId?: Record<string, number>;
} {
  const { availability, workKind: _chosen, ...rest } = value;
  if (!enabled) return { targeting: rest };
  const workKind = chosenWorkKind(value, workKindSetting);
  const resolved = resolveAvailability(
    availability ?? defaultAvailability(now, !!bellWindow, workKind),
    rosters,
    bellWindow,
    workKind
  );
  return {
    targeting: {
      ...rest,
      ...(workKind ? { workKind } : {}),
      openAt: resolved.openAt,
      closeAt: resolved.closeAt,
      dueAt: resolved.dueAt,
      periodPlan: resolved.periodPlan,
    },
    dueAtByRosterId: resolved.dueAtByRosterId,
  };
}

const pointAt = (ms: number): AvailabilityPoint => {
  const d = new Date(ms);
  return { day: getLocalIsoDate(d), time: localTime(d) };
};

/** The section's state for a saved assignment, every point a set time; per-class closes come from its per-class due dates. */
export function availabilityFromStored(
  stored: {
    openAt?: number | null;
    closeAt?: number | null;
    dueAt?: number | null;
    dueAtByRosterId?: Record<string, number>;
    createdAt: number;
    /** Per-class windows of an assignment-mode session, by period key. */
    periodAccess?: Record<string, PeriodAccess>;
  },
  rosterIds: readonly string[]
): AssignAvailability {
  const rows = rowsByRosterId(stored.periodAccess);
  const rowOpens = Object.values(rows).flatMap((r) =>
    r.openAt == null ? [] : [r.openAt]
  );
  const opens = pointAt(
    stored.openAt ??
      (rowOpens.length > 0 ? Math.min(...rowOpens) : stored.createdAt)
  );
  // A close one cushion past the due time is the class bell, so show the bell.
  const cushioned =
    stored.closeAt != null &&
    stored.dueAt != null &&
    stored.closeAt - stored.dueAt === BELL_CLOSE_CUSHION_MS;
  const closeMs = cushioned ? stored.dueAt : (stored.closeAt ?? stored.dueAt);
  const closes =
    closeMs != null ? pointAt(closeMs) : { day: opens.day, time: '23:59' };
  const perClass = stored.dueAtByRosterId ?? {};
  const differs = (id: string) =>
    perClass[id] != null ||
    (rows[id] != null && (rows[id].openAt != null || rows[id].closeAt != null));
  const eachClass = rosterIds.filter(differs).length > 1;
  const specFor = (id: string): AvailabilitySpec => {
    const row = rows[id];
    const close = perClass[id] ?? row?.closeAt;
    return {
      opens: row?.openAt != null ? pointAt(row.openAt) : opens,
      closes: close != null ? pointAt(close) : closes,
    };
  };
  return {
    all: { opens, closes },
    ...(eachClass
      ? {
          byRoster: Object.fromEntries(
            rosterIds.map((id) => [id, specFor(id)])
          ),
        }
      : {}),
    allowLate: stored.closeAt == null && stored.dueAt != null,
  };
}

const rowsByRosterId = (
  periodAccess: Record<string, PeriodAccess> | undefined
): Record<string, PeriodAccess> =>
  Object.fromEntries(
    Object.values(periodAccess ?? {}).flatMap((row) =>
      row.rosterId ? [[row.rosterId, row]] : []
    )
  );

/** Dot-path writes for each class row whose window the edit changed. */
export function periodAccessWindowEdits(
  periodAccess: Record<string, PeriodAccess>,
  before: ResolvedAvailability,
  after: ResolvedAvailability
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const [key, row] of Object.entries(periodAccess)) {
    if (!row.rosterId) continue;
    const prev = before.periodPlan?.rows?.[row.rosterId];
    const next = after.periodPlan?.rows?.[row.rosterId];
    if (!next) continue;
    if (prev?.openAt !== next.openAt)
      out[`periodAccess.${key}.openAt`] = next.openAt ?? null;
    if (prev?.closeAt !== next.closeAt)
      out[`periodAccess.${key}.closeAt`] = next.closeAt ?? null;
  }
  return out;
}

export interface WindowEdit {
  openAt?: number | null;
  closeAt?: number | null;
  dueAt?: number | null;
  /** Present with undefined to clear the per-class dates. */
  dueAtByRosterId?: Record<string, number>;
}

/** Only the stored fields an edit actually changed, so an untouched section writes nothing. */
export function changedWindow(
  before: ResolvedAvailability,
  after: ResolvedAvailability
): WindowEdit {
  const out: WindowEdit = {};
  if (before.openAt !== after.openAt) out.openAt = after.openAt ?? null;
  if (before.closeAt !== after.closeAt) out.closeAt = after.closeAt ?? null;
  if (before.dueAt !== after.dueAt) out.dueAt = after.dueAt ?? null;
  if (
    JSON.stringify(before.dueAtByRosterId ?? null) !==
    JSON.stringify(after.dueAtByRosterId ?? null)
  )
    out.dueAtByRosterId = after.dueAtByRosterId;
  return out;
}

/** An edit of a saved assignment: only the window fields the section changed, the section state dropped. */
export function applyWindowEdit(
  value: AssignTargetingValue,
  stored: Parameters<typeof availabilityFromStored>[0],
  withDue: boolean
): AssignTargetingValue {
  const { availability, ...rest } = value;
  if (!availability) return rest;
  const before = resolveAvailability(
    availabilityFromStored(stored, []),
    [],
    undefined
  );
  const edit = changedWindow(
    before,
    resolveAvailability(availability, [], undefined)
  );
  return {
    ...rest,
    ...('openAt' in edit ? { openAt: edit.openAt ?? undefined } : {}),
    ...('closeAt' in edit ? { closeAt: edit.closeAt ?? undefined } : {}),
    ...(withDue && 'dueAt' in edit ? { dueAt: edit.dueAt ?? undefined } : {}),
  };
}
