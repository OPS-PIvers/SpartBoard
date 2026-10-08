import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pause } from 'lucide-react';
import type { ClassRoster } from '@/types';
import { Toggle } from '@/components/common/Toggle';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import {
  closesBeforeOpens,
  specForRoster,
  type AssignAvailability,
  type AssignWhenMode,
  type AvailabilitySpec,
} from '@/utils/assignAvailability';
import { SpecRows } from '../AssignAvailabilitySection';
import type { AssignWhenValue, AssignWhenVariant } from './assignWhenValue';
import {
  TagPrompt,
  type AssignPeriodAccessContext,
} from '../AssignPeriodAccessSection';

const StateLine: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
    <Pause className="h-4 w-4 shrink-0 text-brand-blue-primary" />
    {children}
  </p>
);

/** The When (Manual / Scheduled) or Available step body of the assign stepper. */
export const AssignWhenStep: React.FC<{
  value: AssignWhenValue;
  onChange: (next: AssignWhenValue) => void;
  variant: AssignWhenVariant;
  /** The checked classes. */
  rosters: ClassRoster[];
  /** Bell periods; absent hides the class bell times and Manual. */
  periodAccess?: AssignPeriodAccessContext;
  /** Each class keeps one Opens for all classes, where only one open time can be saved. */
  sharedOpens?: boolean;
}> = ({ value, onChange, variant, rosters, periodAccess, sharedOpens }) => {
  const { t } = useTranslation();

  if (variant === 'live')
    return (
      <StateLine>
        {t('assignWhen.liveState', {
          defaultValue: 'Starts paused. You start it from the board.',
        })}
      </StateLine>
    );

  const available = variant === 'available';
  const manualAvailable = !available && !!periodAccess;
  const manual = manualAvailable && value.mode === 'manual';
  const { availability } = value;
  const bellAvailable = !!periodAccess && rosters.length > 0;
  const scoped = rosters.length > 1;
  const eachClass = scoped && !!availability.byRoster;
  const bellWindow = periodAccess?.bellWindow;
  const setAvailability = (next: AssignAvailability) =>
    onChange({ ...value, availability: next });
  const usesBell = (spec: AvailabilitySpec) =>
    spec.opens.time === 'bell' || spec.closes.time === 'bell';
  const untagged =
    periodAccess && bellAvailable && !manual
      ? rosters.filter(
          (r) =>
            !r.bellPeriod &&
            usesBell(
              eachClass ? specForRoster(availability, r.id) : availability.all
            )
        )
      : [];
  const allowLateLabel = t('assignWhen.allowLate', {
    defaultValue: 'Allow submissions after close',
  });

  return (
    <div className="space-y-3">
      {manualAvailable && (
        <div className="[&>div]:flex [&>div]:w-full [&>div>button]:flex-1">
          <SegmentedControl<AssignWhenMode>
            role="radiogroup"
            ariaLabel={t('assignWhen.title', { defaultValue: 'When' })}
            value={manual ? 'manual' : 'scheduled'}
            onChange={(mode) => onChange({ ...value, mode })}
            options={[
              {
                value: 'manual',
                label: t('assignWhen.manual', { defaultValue: 'Manual' }),
              },
              {
                value: 'scheduled',
                label: t('assignWhen.scheduled', {
                  defaultValue: 'Scheduled',
                }),
              },
            ]}
          />
        </div>
      )}

      {manual ? (
        <StateLine>
          {t('assignWhen.manualState', {
            defaultValue: 'Starts paused. You start and pause each class.',
          })}
        </StateLine>
      ) : (
        <>
          {eachClass && sharedOpens && (
            <SpecRows
              spec={availability.all}
              bellAvailable={bellAvailable}
              backwards={false}
              onChange={({ opens }) =>
                setAvailability({
                  ...availability,
                  all: { ...availability.all, opens },
                  byRoster: Object.fromEntries(
                    rosters.map((r) => [
                      r.id,
                      { ...specForRoster(availability, r.id), opens },
                    ])
                  ),
                })
              }
              resource={available}
              noEnd
            />
          )}
          {eachClass ? (
            rosters.map((roster) => (
              <div key={roster.id} className="space-y-2">
                <p className="truncate text-xs font-bold text-slate-500">
                  {roster.name}
                </p>
                <SpecRows
                  spec={specForRoster(availability, roster.id)}
                  bellAvailable={bellAvailable}
                  backwards={closesBeforeOpens(
                    specForRoster(availability, roster.id),
                    [roster],
                    bellWindow
                  )}
                  onChange={(spec) =>
                    setAvailability({
                      ...availability,
                      byRoster: { ...availability.byRoster, [roster.id]: spec },
                    })
                  }
                  resource={available}
                  hideOpens={sharedOpens}
                />
              </div>
            ))
          ) : (
            <SpecRows
              spec={availability.all}
              bellAvailable={bellAvailable}
              backwards={closesBeforeOpens(
                availability.all,
                rosters,
                bellWindow
              )}
              onChange={(all) => setAvailability({ ...availability, all })}
              resource={available}
            />
          )}

          {periodAccess &&
            untagged.map((roster) => (
              <TagPrompt
                key={roster.id}
                roster={roster}
                context={periodAccess}
              />
            ))}

          {scoped && (
            <button
              type="button"
              onClick={() =>
                setAvailability(
                  eachClass
                    ? {
                        all: availability.all,
                        allowLate: availability.allowLate,
                      }
                    : {
                        ...availability,
                        byRoster: Object.fromEntries(
                          rosters.map((r) => [
                            r.id,
                            specForRoster(availability, r.id),
                          ])
                        ),
                      }
                )
              }
              className="text-xs font-bold text-brand-blue-primary hover:underline"
            >
              {eachClass
                ? t('assignWhen.sameTime', {
                    defaultValue: 'Same time for all classes',
                  })
                : t('assignWhen.eachTime', {
                    defaultValue: 'Different time for each class',
                  })}
            </button>
          )}

          {!available && (
            <div className="flex min-h-[2rem] items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-700">
                {allowLateLabel}
              </span>
              <Toggle
                size="sm"
                checked={availability.allowLate}
                onChange={(allowLate) =>
                  setAvailability({ ...availability, allowLate })
                }
                label={allowLateLabel}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};
