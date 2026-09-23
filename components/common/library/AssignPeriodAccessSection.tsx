import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { AccessMode, RosterBellPeriod } from '@/types';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import type { BuildingBellPeriodOption } from '@/utils/bellSchedule';
import {
  rosterIsVerified,
  type EpochWindow,
  type PeriodPlan,
  type PeriodPlanRow,
  type PeriodRoster,
  type PeriodWindowSource,
} from '@/utils/periodPlan';
import { WindowField } from './AssignWindowField';

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

const DEFAULT_PLAN: PeriodPlan = { mode: 'assignment' };

const bellKey = (b: RosterBellPeriod): string =>
  `${b.buildingId}|${b.periodId}`;

const formatTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

const TagPrompt: React.FC<{
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

const AssignmentRow: React.FC<{
  roster: PeriodRoster;
  row: PeriodPlanRow | undefined;
  onRowChange: (row: PeriodPlanRow) => void;
  context: AssignPeriodAccessContext;
  bellDate: Date;
}> = ({ roster, row, onRowChange, context, bellDate }) => {
  const { t } = useTranslation();
  const openId = useId();
  const closeId = useId();
  const source = row?.source ?? 'same';
  const bell = source === 'bell' ? context.bellWindow(roster, bellDate) : null;
  return (
    <div className="space-y-1.5 rounded-lg border border-slate-200 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-slate-700">
          {roster.name}
        </span>
        <select
          aria-label={t(
            'assignTargeting.periodWindowFor',
            'Window for {{name}}',
            {
              name: roster.name,
            }
          )}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
          value={source}
          onChange={(e) =>
            onRowChange({ source: e.target.value as PeriodWindowSource })
          }
        >
          <option value="same">
            {t('assignTargeting.periodSame', 'Same as above')}
          </option>
          <option value="bell">
            {t('assignTargeting.periodBell', 'Bell times')}
          </option>
          <option value="custom">
            {t('assignTargeting.periodCustom', 'Custom')}
          </option>
        </select>
      </div>
      {source === 'bell' &&
        (!roster.bellPeriod ? (
          <TagPrompt roster={roster} context={context} />
        ) : bell ? (
          <p className="text-xs text-slate-500">
            {t('assignTargeting.periodBellTimes', '{{open}} – {{close}}', {
              open: formatTime(bell.openAt),
              close: formatTime(bell.closeAt),
            })}
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            {t(
              'assignTargeting.periodNoBell',
              'This period has no bell that day, so it uses the window above.'
            )}
          </p>
        ))}
      {source === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <WindowField
            id={openId}
            label={t('assignTargeting.opensAt', 'Opens')}
            value={row?.openAt}
            onChange={(ms) => onRowChange({ ...row, source, openAt: ms })}
          />
          <WindowField
            id={closeId}
            label={t('assignTargeting.closesAt', 'Closes')}
            value={row?.closeAt}
            onChange={(ms) => onRowChange({ ...row, source, closeAt: ms })}
          />
        </div>
      )}
    </div>
  );
};

/** Mode toggle and per-period windows, shown once an assignment targets more than one class. */
export const AssignPeriodAccessSection: React.FC<{
  rosters: PeriodRoster[];
  plan: PeriodPlan | undefined;
  onChange: (plan: PeriodPlan) => void;
  context: AssignPeriodAccessContext;
  /** The shared window's open time; bell times are read for that day, else today. */
  sharedOpenAt?: number;
}> = ({ rosters, plan = DEFAULT_PLAN, onChange, context, sharedOpenAt }) => {
  const { t } = useTranslation();
  const [customizing, setCustomizing] = useState(
    Object.keys(plan.rows ?? {}).length > 0
  );
  const regionId = useId();
  const [openedAt] = useState(() => Date.now());
  const bellDate = new Date(sharedOpenAt ?? openedAt);
  const setRow = (rosterId: string, row: PeriodPlanRow) =>
    onChange({ ...plan, rows: { ...plan.rows, [rosterId]: row } });

  return (
    <div className="space-y-2 border-t border-slate-200/70 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold text-brand-blue-dark">
          {t('assignTargeting.periodsLabel', 'Class periods')}
        </span>
        <SegmentedControl<AccessMode>
          role="radiogroup"
          ariaLabel={t('assignTargeting.periodModeLabel', 'How periods open')}
          value={plan.mode}
          onChange={(mode) => onChange({ ...plan, mode })}
          options={[
            {
              value: 'assessment',
              label: t(
                'assignTargeting.periodModeAssessment',
                'In-class assessment'
              ),
            },
            {
              value: 'assignment',
              label: t('assignTargeting.periodModeAssignment', 'Assignment'),
            },
          ]}
        />
      </div>

      {plan.mode === 'assessment' ? (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-500">
            {t(
              'assignTargeting.periodAssessmentHint',
              'Every period stays closed until you start it from the monitor. It closes at the end bell.'
            )}
          </p>
          {rosters.map((roster) => {
            const verified = rosterIsVerified(roster);
            if (verified && roster.bellPeriod) return null;
            return (
              <div
                key={roster.id}
                className="space-y-1 rounded-lg border border-slate-200 p-2"
              >
                <span className="text-sm font-semibold text-slate-700">
                  {roster.name}
                </span>
                {!verified && (
                  <p className="text-xs text-slate-600">
                    {t(
                      'assignTargeting.periodUnverified',
                      'PIN only, not verified: students without a school sign-in can’t join an in-class assessment.'
                    )}
                  </p>
                )}
                {!roster.bellPeriod && (
                  <TagPrompt roster={roster} context={context} />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setCustomizing((v) => !v)}
            aria-expanded={customizing}
            aria-controls={regionId}
            className="flex items-center gap-1 text-xs font-semibold text-brand-blue-primary hover:text-brand-blue-dark"
          >
            {t('assignTargeting.periodCustomize', 'Customize per period')}
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${customizing ? 'rotate-90' : ''}`}
            />
          </button>
          {customizing && (
            <div id={regionId} className="space-y-1.5">
              {rosters.map((roster) => (
                <AssignmentRow
                  key={roster.id}
                  roster={roster}
                  row={plan.rows?.[roster.id]}
                  onRowChange={(row) => setRow(roster.id, row)}
                  context={context}
                  bellDate={bellDate}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
