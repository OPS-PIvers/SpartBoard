import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RosterBellPeriod } from '@/types';
import type { BuildingBellPeriodOption } from '@/utils/bellSchedule';
import type { EpochWindow, PeriodRoster } from '@/utils/periodPlan';
import { tourFieldAttr } from '@/config/tourAnchors';

export interface AssignPeriodAccessContext {
  /** Every bell period in the teacher's buildings, for the inline tag prompt. */
  bellOptions: BuildingBellPeriodOption[];
  /** The roster's bell times on `date`, from its tagged building schedule. */
  bellWindow: (roster: PeriodRoster, date: Date) => EpochWindow | null;
  onTagRoster: (
    rosterId: string,
    bellPeriod: RosterBellPeriod
  ) => Promise<void> | void;
}

const bellKey = (b: RosterBellPeriod): string =>
  `${b.buildingId}|${b.periodId}`;

export const TagPrompt: React.FC<{
  roster: PeriodRoster;
  context: AssignPeriodAccessContext;
}> = ({ roster, context }) => {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  if (context.bellOptions.length === 0) return null;
  return (
    <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
      {t('assignTargeting.periodTagPrompt', 'Which period is {{name}}?', {
        name: roster.name,
      })}
      <select
        className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
        value=""
        disabled={saving}
        {...tourFieldAttr('assign-periods.tag-roster', 'assign', roster.id)}
        onChange={async (e) => {
          const pick = context.bellOptions.find(
            (o) => bellKey(o) === e.target.value
          );
          if (!pick) return;
          setSaving(true);
          try {
            await context.onTagRoster(roster.id, {
              buildingId: pick.buildingId,
              periodId: pick.periodId,
            });
          } finally {
            setSaving(false);
          }
        }}
      >
        <option value="">
          {t('assignTargeting.periodTagPick', 'Pick a period')}
        </option>
        {context.bellOptions.map((o) => (
          <option key={bellKey(o)} value={bellKey(o)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
};
