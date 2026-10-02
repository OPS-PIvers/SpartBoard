import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, ChevronDown, Clock, X } from 'lucide-react';
import type { ClassRoster } from '@/types';
import { Toggle } from '@/components/common/Toggle';
import {
  closesBeforeOpens,
  specForRoster,
  type AssignAvailability,
  type AvailabilityPoint,
  type AvailabilitySpec,
} from '@/utils/assignAvailability';
import type { WorkKind } from '@/utils/gradebook/gradebookCore';
import {
  TagPrompt,
  type AssignPeriodAccessContext,
} from './AssignPeriodAccessSection';
import { scaledFont } from './assignWindowUtils';

type Side = 'opens' | 'closes';

const PointField: React.FC<{
  label: string;
  side: Side;
  point: AvailabilityPoint;
  minDay?: string;
  bellAvailable: boolean;
  onChange: (point: AvailabilityPoint) => void;
  cqScaled?: boolean;
  wideLabel?: boolean;
}> = ({
  label,
  side,
  point,
  minDay,
  bellAvailable,
  onChange,
  cqScaled,
  wideLabel,
}) => {
  const { t } = useTranslation();
  const dateId = useId();
  const [justPicked, setJustPicked] = useState(false);
  const bellLabel =
    side === 'opens'
      ? t('assignAvailability.startOfClass', 'Start of class')
      : t('assignAvailability.endOfClass', 'End of class');
  const usesBell = bellAvailable && point.time === 'bell';
  const pickedTime = side === 'opens' ? '08:00' : '15:00';
  const timeValue =
    point.time !== 'bell' ? point.time : side === 'opens' ? '00:00' : '23:59';
  const text = cqScaled ? '' : 'text-sm';
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={dateId}
        className={`${wideLabel ? 'w-28' : 'w-14'} shrink-0 font-semibold text-slate-700 ${text}`}
        style={scaledFont(cqScaled, 14, 5.5)}
      >
        {label}
      </label>
      <div
        className={`flex h-8 items-stretch rounded-lg border border-slate-300 bg-white text-slate-800 focus-within:border-brand-blue-primary ${text}`}
        style={scaledFont(cqScaled, 14, 5.5)}
      >
        <span className="flex items-center border-r border-slate-200 pl-2.5 pr-1.5">
          <input
            id={dateId}
            type="date"
            required
            min={minDay}
            value={point.day}
            onChange={(e) => {
              if (e.target.value) onChange({ ...point, day: e.target.value });
            }}
            className="w-[8.25rem] bg-transparent focus:outline-none"
          />
        </span>
        <span className="relative flex w-40 items-center gap-1.5 pl-2.5 pr-2">
          {usesBell ? (
            <>
              <Clock className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <select
                aria-label={t('assignAvailability.timeFor', '{{label}} time', {
                  label,
                })}
                value="bell"
                onChange={(e) => {
                  if (e.target.value !== 'time') return;
                  setJustPicked(true);
                  onChange({ ...point, time: pickedTime });
                }}
                className="min-w-0 flex-1 appearance-none bg-transparent pr-4 focus:outline-none"
              >
                <option value="bell">{bellLabel}</option>
                <option value="time">
                  {t('assignAvailability.setTime', 'Set a time')}
                </option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-slate-400" />
            </>
          ) : (
            <>
              <input
                type="time"
                required
                aria-label={t('assignAvailability.timeFor', '{{label}} time', {
                  label,
                })}
                autoFocus={justPicked}
                value={timeValue}
                onChange={(e) => {
                  if (e.target.value)
                    onChange({ ...point, time: e.target.value });
                }}
                className="min-w-0 flex-1 bg-transparent focus:outline-none"
              />
              {bellAvailable && (
                <button
                  type="button"
                  aria-label={bellLabel}
                  title={bellLabel}
                  onClick={() => onChange({ ...point, time: 'bell' })}
                  className="rounded p-0.5 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
        </span>
      </div>
    </div>
  );
};

const SpecRows: React.FC<{
  spec: AvailabilitySpec;
  bellAvailable: boolean;
  backwards: boolean;
  onChange: (spec: AvailabilitySpec) => void;
  cqScaled?: boolean;
  resource?: boolean;
  noEnd?: boolean;
}> = ({
  spec,
  bellAvailable,
  backwards,
  onChange,
  cqScaled,
  resource,
  noEnd,
}) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <PointField
        label={t('assignAvailability.opens', 'Opens')}
        side="opens"
        point={spec.opens}
        wideLabel={resource}
        bellAvailable={bellAvailable}
        onChange={(opens) => {
          const closes =
            spec.closes.day < opens.day
              ? { ...spec.closes, day: opens.day }
              : spec.closes;
          onChange({ opens, closes });
        }}
        cqScaled={cqScaled}
      />
      {!noEnd && (
        <PointField
          label={
            resource
              ? t('assignAvailability.availableUntil', 'Available until')
              : t('assignAvailability.closes', 'Closes')
          }
          side="closes"
          point={spec.closes}
          minDay={spec.opens.day}
          wideLabel={resource}
          bellAvailable={bellAvailable}
          onChange={(closes) => onChange({ ...spec, closes })}
          cqScaled={cqScaled}
        />
      )}
      {backwards && !noEnd && (
        <p
          role="alert"
          className={`font-medium text-brand-red-primary ${cqScaled ? '' : 'text-xs'}`}
          style={scaledFont(cqScaled, 12, 4.5)}
        >
          {t('assignAvailability.closesBeforeOpens', 'Closes before it opens.')}
        </p>
      )}
    </div>
  );
};

const WorkKindToggle: React.FC<{
  value: WorkKind;
  onChange: (next: WorkKind) => void;
  cqScaled?: boolean;
}> = ({ value, onChange, cqScaled }) => {
  const { t } = useTranslation();
  const options: { id: WorkKind; label: string; hint: string }[] = [
    {
      id: 'work',
      label: t('assignAvailability.submissionsEnabled', 'Submissions Enabled'),
      hint: t(
        'assignAvailability.submissionsHint',
        'Students will submit this activity for grading. Unsubmitted assignments will be marked as missing or expired automatically.'
      ),
    },
    {
      id: 'resource',
      label: t('assignAvailability.studyResource', 'Study Resource'),
      hint: t(
        'assignAvailability.studyResourceHint',
        'Students can access this resource until it closes. Some activities allow you to track their progress, but students do not submit their work.'
      ),
    },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t('assignAvailability.workKind', 'Student work')}
      className="grid grid-cols-2 rounded-lg bg-slate-100 p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          title={option.hint}
          onClick={() => onChange(option.id)}
          className={`rounded-md px-2 py-1 font-semibold ${cqScaled ? '' : 'text-xs'} ${
            value === option.id
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
          style={scaledFont(cqScaled, 12, 4.5)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

/** Opens, closes and late work for an assignment, for all checked classes or each one. */
export const AssignAvailabilitySection: React.FC<{
  value: AssignAvailability;
  onChange: (next: AssignAvailability) => void;
  /** The checked classes. */
  rosters: ClassRoster[];
  periodAccess?: AssignPeriodAccessContext;
  cqScaled?: boolean;
  /** `study-resources` on: the kind this assignment saves as. */
  workKind?: WorkKind;
  /** Set when the teacher may switch; also receives the availability that fits the new kind. */
  onWorkKindChange?: (next: WorkKind, availability: AssignAvailability) => void;
}> = ({
  value,
  onChange,
  rosters,
  periodAccess,
  cqScaled,
  workKind,
  onWorkKindChange,
}) => {
  const { t } = useTranslation();
  const bellAvailable = !!periodAccess && rosters.length > 0;
  const resource = workKind === 'resource';
  const noEnd = resource && !!value.noEnd;
  const eachClass = !!value.byRoster && rosters.length > 1;
  const usesBell = (spec: AvailabilitySpec) =>
    spec.opens.time === 'bell' || spec.closes.time === 'bell';
  const bellWindow = periodAccess?.bellWindow;
  const untagged =
    periodAccess && bellAvailable
      ? rosters.filter(
          (r) =>
            !r.bellPeriod &&
            usesBell(eachClass ? specForRoster(value, r.id) : value.all)
        )
      : [];

  return (
    <div className="space-y-2.5 border-t border-slate-200/70 pt-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`flex items-center gap-2 font-bold text-brand-blue-dark ${cqScaled ? '' : 'text-sm'}`}
          style={scaledFont(cqScaled, 14, 5.5)}
        >
          <CalendarClock className="h-4 w-4 text-brand-blue-primary" />
          {t('assignAvailability.title', 'Availability & Due Date')}
        </span>
        {rosters.length > 1 && (
          <span className="relative flex items-center">
            <select
              aria-label={t('assignAvailability.scope', 'Dates for')}
              value={eachClass ? 'each' : 'all'}
              onChange={(e) =>
                onChange(
                  e.target.value === 'each'
                    ? {
                        ...value,
                        byRoster: Object.fromEntries(
                          rosters.map((r) => [r.id, specForRoster(value, r.id)])
                        ),
                      }
                    : { all: value.all, allowLate: value.allowLate }
                )
              }
              className={`appearance-none bg-transparent pr-4 font-semibold text-brand-blue-primary focus:outline-none ${cqScaled ? '' : 'text-xs'}`}
              style={scaledFont(cqScaled, 12, 4.5)}
            >
              <option value="all">
                {t('assignAvailability.allClasses', 'All classes')}
              </option>
              <option value="each">
                {t('assignAvailability.eachClass', 'Each class')}
              </option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-brand-blue-primary" />
          </span>
        )}
      </div>

      {workKind && onWorkKindChange && (
        <WorkKindToggle
          value={workKind}
          cqScaled={cqScaled}
          onChange={(next) => {
            if (next === workKind) return;
            const { noEnd: _noEnd, ...rest } = value;
            onWorkKindChange(
              next,
              next === 'resource' ? { ...rest, noEnd: true } : rest
            );
          }}
        />
      )}

      {eachClass ? (
        rosters.map((roster) => (
          <div key={roster.id} className="space-y-2">
            <p
              className={`truncate font-bold text-slate-600 ${cqScaled ? '' : 'text-xs'}`}
              style={scaledFont(cqScaled, 12, 4.5)}
            >
              {roster.name}
            </p>
            <SpecRows
              spec={specForRoster(value, roster.id)}
              bellAvailable={bellAvailable}
              backwards={closesBeforeOpens(
                specForRoster(value, roster.id),
                [roster],
                bellWindow
              )}
              onChange={(spec) =>
                onChange({
                  ...value,
                  byRoster: { ...value.byRoster, [roster.id]: spec },
                })
              }
              cqScaled={cqScaled}
              resource={resource}
              noEnd={noEnd}
            />
          </div>
        ))
      ) : (
        <SpecRows
          spec={value.all}
          bellAvailable={bellAvailable}
          backwards={closesBeforeOpens(value.all, rosters, bellWindow)}
          onChange={(all) => onChange({ ...value, all })}
          cqScaled={cqScaled}
          resource={resource}
          noEnd={noEnd}
        />
      )}

      {periodAccess &&
        untagged.map((roster) => (
          <TagPrompt key={roster.id} roster={roster} context={periodAccess} />
        ))}

      <div className="flex items-center justify-between gap-2 pt-1">
        <span
          className={`font-semibold text-slate-700 ${cqScaled ? '' : 'text-sm'}`}
          style={scaledFont(cqScaled, 14, 5.5)}
        >
          {resource
            ? t('assignAvailability.noEndDate', 'No end date')
            : t(
                'assignAvailability.allowLate',
                'Allow submissions after close'
              )}
        </span>
        {resource ? (
          <Toggle
            size="xs"
            showLabels={false}
            checked={noEnd}
            onChange={(next) => {
              const { noEnd: _noEnd, ...rest } = value;
              onChange(next ? { ...rest, noEnd: true } : rest);
            }}
            label={t('assignAvailability.noEndDate', 'No end date')}
          />
        ) : (
          <Toggle
            size="xs"
            showLabels={false}
            checked={value.allowLate}
            onChange={(allowLate) => onChange({ ...value, allowLate })}
            label={t(
              'assignAvailability.allowLate',
              'Allow submissions after close'
            )}
          />
        )}
      </div>
    </div>
  );
};
