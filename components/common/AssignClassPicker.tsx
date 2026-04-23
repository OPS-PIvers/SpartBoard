/**
 * AssignClassPicker — shared class-assignment picker used by the Quiz, Video
 * Activity, and Guided Learning assign modals.
 *
 * Replaces the previous split between a single-select ClassLink dropdown and
 * a separate multi-select local-rosters checklist. Teachers pick a source
 * (ClassLink classes XOR local rosters), then multi-select from the filtered
 * list. Zero selection falls through to the classic code/PIN-only flow.
 *
 * The component is controlled — parents own the value and pass it back in
 * via `value` / `onChange`. Source-switching clears the other source's
 * selection automatically so the shape stays consistent.
 */

import React from 'react';
import { Users, Check } from 'lucide-react';
import type { ClassLinkClass, ClassRoster } from '@/types';
import {
  formatClassLinkClassLabel,
  type AssignClassSource,
  type AssignClassPickerValue,
} from './AssignClassPicker.helpers';

export interface AssignClassPickerProps {
  classLinkClasses: ClassLinkClass[];
  rosters: ClassRoster[];
  value: AssignClassPickerValue;
  onChange: (next: AssignClassPickerValue) => void;
  disabled?: boolean;
}

export const AssignClassPicker: React.FC<AssignClassPickerProps> = ({
  classLinkClasses,
  rosters,
  value,
  onChange,
  disabled = false,
}) => {
  const hasClassLink = classLinkClasses.length > 0;
  const hasLocal = rosters.length > 0;

  const effectiveSource: AssignClassSource = hasClassLink
    ? value.source
    : 'local';

  const handleSourceChange = (next: AssignClassSource): void => {
    if (next === value.source) return;
    // Clear the other source's selection so the shape stays consistent.
    onChange({
      source: next,
      classIds: [],
      periodNames: [],
    });
  };

  const toggleClassId = (id: string): void => {
    const next = value.classIds.includes(id)
      ? value.classIds.filter((x) => x !== id)
      : [...value.classIds, id];
    onChange({ ...value, classIds: next });
  };

  const togglePeriodName = (name: string): void => {
    const next = value.periodNames.includes(name)
      ? value.periodNames.filter((x) => x !== name)
      : [...value.periodNames, name];
    onChange({ ...value, periodNames: next });
  };

  const selectAll = (): void => {
    if (effectiveSource === 'classlink') {
      onChange({
        ...value,
        source: 'classlink',
        classIds: classLinkClasses.map((c) => c.sourcedId),
      });
    } else {
      onChange({
        ...value,
        source: 'local',
        periodNames: rosters.map((r) => r.name),
      });
    }
  };

  const clearAll = (): void => {
    onChange({ ...value, classIds: [], periodNames: [] });
  };

  const selectedCount =
    effectiveSource === 'classlink'
      ? value.classIds.length
      : value.periodNames.length;

  const totalCount =
    effectiveSource === 'classlink' ? classLinkClasses.length : rosters.length;

  return (
    <div
      className={
        disabled ? 'opacity-50 pointer-events-none space-y-2' : 'space-y-2'
      }
    >
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-brand-blue-primary" />
        <label className="text-sm font-bold text-brand-blue-dark">
          Assign to classes{' '}
          <span className="text-slate-400 font-normal">(optional)</span>
        </label>
      </div>

      {hasClassLink && (
        <div
          role="radiogroup"
          aria-label="Class source"
          className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5"
        >
          <SourceToggleButton
            label="ClassLink classes"
            active={effectiveSource === 'classlink'}
            onClick={() => handleSourceChange('classlink')}
          />
          <SourceToggleButton
            label="Local rosters"
            active={effectiveSource === 'local'}
            onClick={() => handleSourceChange('local')}
            disabled={!hasLocal}
            disabledHint="No local rosters"
          />
        </div>
      )}

      <PickerList
        source={effectiveSource}
        classLinkClasses={classLinkClasses}
        rosters={rosters}
        value={value}
        onToggleClassId={toggleClassId}
        onTogglePeriodName={togglePeriodName}
      />

      {totalCount > 0 && (
        <div className="flex items-center justify-between text-xxs text-slate-500">
          <span>
            {selectedCount === 0
              ? 'None selected — students join with the code only.'
              : `${selectedCount} of ${totalCount} selected.`}
          </span>
          <div className="flex items-center gap-2">
            {selectedCount < totalCount && (
              <button
                type="button"
                onClick={selectAll}
                className="font-bold text-brand-blue-primary hover:text-brand-blue-dark"
              >
                Select all ({totalCount})
              </button>
            )}
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="font-bold text-slate-500 hover:text-slate-700"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const SourceToggleButton: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  disabledHint?: string;
}> = ({ label, active, onClick, disabled = false, disabledHint }) => (
  <button
    type="button"
    role="radio"
    aria-checked={active}
    onClick={onClick}
    disabled={disabled}
    title={disabled ? disabledHint : undefined}
    className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
      active
        ? 'bg-white text-brand-blue-dark shadow-sm'
        : 'text-slate-500 hover:text-slate-700'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    {label}
  </button>
);

interface PickerListProps {
  source: AssignClassSource;
  classLinkClasses: ClassLinkClass[];
  rosters: ClassRoster[];
  value: AssignClassPickerValue;
  onToggleClassId: (id: string) => void;
  onTogglePeriodName: (name: string) => void;
}

const PickerList: React.FC<PickerListProps> = ({
  source,
  classLinkClasses,
  rosters,
  value,
  onToggleClassId,
  onTogglePeriodName,
}) => {
  if (source === 'classlink') {
    if (classLinkClasses.length === 0) {
      return (
        <EmptyStub message="No ClassLink classes found. Switch to Local rosters or assign with a code/PIN only." />
      );
    }
    return (
      <CheckList>
        {classLinkClasses.map((cls) => (
          <CheckItem
            key={cls.sourcedId}
            checked={value.classIds.includes(cls.sourcedId)}
            label={formatClassLinkClassLabel(cls)}
            onToggle={() => onToggleClassId(cls.sourcedId)}
          />
        ))}
      </CheckList>
    );
  }

  // source === 'local'
  if (rosters.length === 0) {
    return (
      <EmptyStub message="No local rosters. Import a roster from the Classes panel, or assign with a code/PIN only." />
    );
  }
  return (
    <CheckList>
      {rosters.map((r) => (
        <CheckItem
          key={r.id}
          checked={value.periodNames.includes(r.name)}
          label={r.name}
          onToggle={() => onTogglePeriodName(r.name)}
        />
      ))}
    </CheckList>
  );
};

const CheckList: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="space-y-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
    {children}
  </div>
);

const CheckItem: React.FC<{
  checked: boolean;
  label: string;
  onToggle: () => void;
}> = ({ checked, label, onToggle }) => (
  <label className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded px-1.5 py-1">
    <span
      aria-hidden="true"
      className={`flex items-center justify-center w-4 h-4 rounded border transition-colors ${
        checked
          ? 'bg-brand-blue-primary border-brand-blue-primary text-white'
          : 'bg-white border-slate-300'
      }`}
    >
      {checked && <Check className="w-3 h-3" strokeWidth={3} />}
    </span>
    <input
      type="checkbox"
      className="sr-only"
      checked={checked}
      onChange={onToggle}
    />
    <span className="text-sm text-slate-800">{label}</span>
  </label>
);

const EmptyStub: React.FC<{ message: string }> = ({ message }) => (
  <p className="text-xxs text-slate-500 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2">
    {message}
  </p>
);
