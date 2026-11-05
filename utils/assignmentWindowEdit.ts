// The window part of an assignment Settings save, shared by Quiz and Flashcards.
import type { ClassRoster, PeriodAccess } from '@/types';
import {
  availabilityFromStored,
  changedWindow,
  closesBeforeOpens,
  periodAccessWindowEdits,
  resolveAvailability,
  specForRoster,
  type AssignAvailability,
  type PeriodAccessWindowEdits,
  type ResolvedAvailability,
} from '@/utils/assignAvailability';
import { earliestDueAt } from '@/utils/perClassDueDates';

export interface WindowBaseline {
  value: AssignAvailability;
  resolved: ResolvedAvailability;
}

/** The window as saved, resolved the same way as the edit so unchanged fields are never rewritten. */
export function windowBaselineFor(
  stored: Parameters<typeof availabilityFromStored>[0],
  rosters: readonly ClassRoster[]
): WindowBaseline {
  const value = availabilityFromStored(
    stored,
    rosters.map((r) => r.id)
  );
  return { value, resolved: resolveAvailability(value, rosters, undefined) };
}

/** True when any checked class closes at or before it opens. */
export function windowBackwards(
  availability: AssignAvailability,
  rosters: readonly ClassRoster[]
): boolean {
  return rosters.length > 1 && availability.byRoster
    ? rosters.some((r) =>
        closesBeforeOpens(specForRoster(availability, r.id), [r], undefined)
      )
    : closesBeforeOpens(availability.all, rosters, undefined);
}

export interface AssignmentWindowEdit {
  openAt?: number | null;
  closeAt?: number | null;
  periodAccessEdits?: PeriodAccessWindowEdits;
  /** Present only when the due date changed. */
  due?: { dueAt: number | null; perClass?: Record<string, number> };
}

/** What a Settings save writes for the window; a per-class session edits its rows instead of a shared window. */
export function assignmentWindowEdit({
  periodAccess,
  perPeriod,
  baseline,
  availability,
  rosters,
}: {
  periodAccess: Record<string, PeriodAccess> | undefined;
  perPeriod: boolean;
  baseline: WindowBaseline;
  availability: AssignAvailability;
  rosters: readonly ClassRoster[];
}): AssignmentWindowEdit {
  const resolved = resolveAvailability(availability, rosters, undefined);
  const changed = changedWindow(baseline.resolved, resolved);
  const out: AssignmentWindowEdit = {};
  if (perPeriod) {
    const rowEdits: PeriodAccessWindowEdits = resolved.periodPlan
      ? periodAccessWindowEdits(periodAccess ?? {}, baseline.resolved, resolved)
      : {};
    // Down to one class there is no per-class plan, so the shared window moves the kept rows.
    if (!resolved.periodPlan) {
      const edit: PeriodAccessWindowEdits[string] = {};
      if ('openAt' in changed) edit.openAt = changed.openAt ?? null;
      if ('closeAt' in changed) edit.closeAt = changed.closeAt ?? null;
      if (Object.keys(edit).length > 0) {
        for (const [key, row] of Object.entries(periodAccess ?? {})) {
          if (rosters.some((r) => r.id === row.rosterId)) rowEdits[key] = edit;
        }
      }
    }
    if (Object.keys(rowEdits).length > 0) out.periodAccessEdits = rowEdits;
  } else {
    if ('openAt' in changed) out.openAt = changed.openAt;
    if ('closeAt' in changed) out.closeAt = changed.closeAt;
  }
  if ('dueAt' in changed || 'dueAtByRosterId' in changed) {
    const perClass = resolved.dueAtByRosterId;
    out.due = {
      dueAt: perClass ? earliestDueAt(perClass) : (resolved.dueAt ?? null),
      ...(perClass ? { perClass } : {}),
    };
  }
  return out;
}
