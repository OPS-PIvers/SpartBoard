// Settings on a launched self-paced Video Activity assignment: When and the rule steps, with Save (va-quiz-alignment slice 6).
import React, { useState } from 'react';
import { Pause, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ClassRoster, VideoActivityAssignment } from '@/types';
import type { VideoAssignmentSettingsPatch } from '@/hooks/useVideoActivityAssignments';
import {
  availabilityFromStored,
  changedWindow,
  closesBeforeOpens,
  periodAccessWindowEdits,
  resolveAvailability,
  specForRoster,
  type AssignAvailability,
  type PeriodAccessWindowEdits,
} from '@/utils/assignAvailability';
import { earliestDueAt } from '@/utils/perClassDueDates';
import { AssignStepper } from '@/components/common/library/assignStepper/AssignStepper';
import {
  getAssignStepTitle,
  type AssignStepDef,
} from '@/components/common/library/assignStepper/assignSteps';
import { AssignWhenStep } from '@/components/common/library/assignStepper/AssignWhenStep';
import { formatWhenValue } from '@/components/common/library/assignStepper/assignWhenValue';
import { videoRuleStepDefs } from '@/components/common/library/assignStepper/videoRuleStepDefs';
import type { VideoAssignRules } from '@/components/common/library/assignStepper/VideoRuleStepValues';
import {
  videoRulesFromAssignment,
  videoRulesPatch,
} from '../videoAssignmentSettings';

interface VideoAssignmentSettingsModalProps {
  assignment: VideoActivityAssignment;
  rosters: ClassRoster[];
  onClose: () => void;
  onSave: (patch: VideoAssignmentSettingsPatch) => Promise<void> | void;
}

/** The assignment's classes, by id or, on older assignments, by period name. */
function assignedRosters(
  a: VideoActivityAssignment,
  rosters: ClassRoster[]
): ClassRoster[] {
  if (a.rosterIds !== undefined)
    return rosters.filter((r) => a.rosterIds?.includes(r.id));
  const names = new Set(a.periodNames ?? (a.periodName ? [a.periodName] : []));
  return rosters.filter((r) => names.has(r.name));
}

export const VideoAssignmentSettingsModal: React.FC<
  VideoAssignmentSettingsModalProps
> = ({ assignment, rosters, onClose, onSave }) => {
  const { t } = useTranslation();
  const [classes] = useState(() => assignedRosters(assignment, rosters));
  const [initialRules] = useState<VideoAssignRules>(() =>
    videoRulesFromAssignment(assignment)
  );
  const [rules, setRules] = useState<VideoAssignRules>(initialRules);

  const periodRows = assignment.periodAccess ?? {};
  const hasRows = !!assignment.accessMode && Object.keys(periodRows).length > 0;
  const perPeriod = hasRows && assignment.accessMode === 'assignment';
  // A Manual start has no dates to edit: the teacher starts and pauses each class.
  const manualStart =
    assignment.accessMode === 'assessment' &&
    Object.keys(periodRows).length > 0 &&
    assignment.openAt == null &&
    assignment.closeAt == null &&
    assignment.dueAt == null;
  // The window as saved, resolved the same way as the edit so unchanged fields are never rewritten.
  const [baseline] = useState(() => {
    const value = availabilityFromStored(
      assignment,
      classes.map((r) => r.id)
    );
    return { value, resolved: resolveAvailability(value, classes, undefined) };
  });
  const [availability, setAvailability] = useState<AssignAvailability>(
    baseline.value
  );
  const backwards =
    classes.length > 1 && availability.byRoster
      ? classes.some((r) =>
          closesBeforeOpens(specForRoster(availability, r.id), [r], undefined)
        )
      : closesBeforeOpens(availability.all, classes, undefined);

  const windowFields = (): VideoAssignmentSettingsPatch => {
    if (manualStart) return {};
    const resolved = resolveAvailability(availability, classes, undefined);
    const changed = changedWindow(baseline.resolved, resolved);
    let edit: VideoAssignmentSettingsPatch;
    // A session gated by its rows never gets a shared window, which would add a second gate.
    if (hasRows) {
      const rowEdits =
        perPeriod && resolved.periodPlan
          ? periodAccessWindowEdits(periodRows, baseline.resolved, resolved)
          : singleClassRowEdits(changed);
      edit =
        Object.keys(rowEdits).length > 0 ? { periodAccessEdits: rowEdits } : {};
    } else {
      edit = {
        ...('openAt' in changed ? { openAt: changed.openAt ?? null } : {}),
        ...('closeAt' in changed ? { closeAt: changed.closeAt ?? null } : {}),
      };
    }
    if (!('dueAt' in changed) && !('dueAtByRosterId' in changed)) return edit;
    // A Video Activity keeps one due date; per-class ones save the earliest, as Assign does.
    const dueAt = resolved.dueAtByRosterId
      ? earliestDueAt(resolved.dueAtByRosterId)
      : (resolved.dueAt ?? null);
    return {
      ...edit,
      dueAt,
      sessionOptionEdits: { dueAt, dueAtHasTime: dueAt != null },
    };
  };

  // Down to one class there is no per-class plan, so the shared window moves the kept rows.
  const singleClassRowEdits = (
    changed: ReturnType<typeof changedWindow>
  ): PeriodAccessWindowEdits => {
    const edit: PeriodAccessWindowEdits[string] = {};
    if ('openAt' in changed) edit.openAt = changed.openAt ?? null;
    if ('closeAt' in changed) edit.closeAt = changed.closeAt ?? null;
    if (Object.keys(edit).length === 0) return {};
    const ids = new Set(classes.map((r) => r.id));
    // With none of its classes left on this account, the edit moves every row.
    return Object.fromEntries(
      Object.entries(periodRows)
        .filter(
          ([, row]) =>
            ids.size === 0 || (!!row.rosterId && ids.has(row.rosterId))
        )
        .map(([key]) => [key, edit])
    );
  };

  const handleSave = async () => {
    const window = windowFields();
    const rulePatch = videoRulesPatch(assignment, initialRules, rules);
    const patch: VideoAssignmentSettingsPatch = {
      ...window,
      ...rulePatch,
      ...(window.sessionOptionEdits || rulePatch.sessionOptionEdits
        ? {
            sessionOptionEdits: {
              ...rulePatch.sessionOptionEdits,
              ...window.sessionOptionEdits,
            },
          }
        : {}),
    };
    try {
      if (Object.keys(patch).length > 0) await onSave(patch);
      onClose();
    } catch (err) {
      if (import.meta.env.DEV)
        console.error('[VideoAssignmentSettingsModal] save failed:', err);
    }
  };

  const ctx = { kind: 'work' as const };
  const whenStep: AssignStepDef = {
    id: 'when',
    title: getAssignStepTitle('when', 'video', ctx),
    value: formatWhenValue(
      { mode: manualStart ? 'manual' : 'scheduled', availability },
      {
        variant: 'when',
        rosterCount: classes.length,
        manualAvailable: manualStart,
        t,
      }
    ),
    body: manualStart ? (
      <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <Pause className="h-4 w-4 shrink-0 text-brand-blue-primary" />
        {t('assignWhen.manualState', {
          defaultValue: 'Starts paused. You start and pause each class.',
        })}
      </p>
    ) : (
      <AssignWhenStep
        value={{ mode: 'scheduled', availability }}
        onChange={(next) => setAvailability(next.availability)}
        variant="when"
        rosters={classes}
        sharedOpens={!perPeriod}
        perClass={perPeriod}
      />
    ),
  };

  return (
    <AssignStepper
      isOpen
      onClose={onClose}
      title={assignment.activityTitle}
      steps={[
        whenStep,
        ...videoRuleStepDefs({ value: rules, onChange: setRules }),
      ]}
      submitLabel="Save"
      submitIcon={Save}
      onSubmit={handleSave}
      disabled={backwards}
      disabledReason={
        backwards
          ? t('assignAvailability.closesBeforeOpens', 'Closes before it opens.')
          : undefined
      }
    />
  );
};
