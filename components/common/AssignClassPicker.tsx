/**
 * AssignClassPicker — shared class-assignment picker used by Quiz, Video
 * Activity, Guided Learning, and Mini-App assign modals.
 *
 * Shows a single multi-select list of the teacher's local rosters. Rosters
 * imported from ClassLink carry a "CL" badge (their `classlinkClassId`
 * metadata drives the student SSO gate downstream). Live ClassLink data is
 * NOT fetched here — it lives only in the Import dialog, keeping the
 * assignment flow uniform regardless of roster provenance.
 *
 * Controlled component: parents own the value and pass it back in via
 * `value` / `onChange`. Zero selection falls through to the classic
 * code/PIN-only join flow.
 */

import React from 'react';
import { Users, Check, Link2 } from 'lucide-react';
import type { ClassRoster } from '@/types';
import type { AssignClassPickerValue } from './AssignClassPicker.helpers';

export interface AssignClassPickerProps {
  rosters: ClassRoster[];
  value: AssignClassPickerValue;
  onChange: (next: AssignClassPickerValue) => void;
  disabled?: boolean;
}

export const AssignClassPicker: React.FC<AssignClassPickerProps> = ({
  rosters,
  value,
  onChange,
  disabled = false,
}) => {
  const toggleRosterId = (id: string): void => {
    const next = value.rosterIds.includes(id)
      ? value.rosterIds.filter((x) => x !== id)
      : [...value.rosterIds, id];
    onChange({ rosterIds: next });
  };

  const selectAll = (): void => {
    // Skip rosters whose Drive students failed to load — selecting them
    // would produce a session with zero PINs that nobody can join.
    onChange({
      rosterIds: rosters.filter((r) => !r.loadError).map((r) => r.id),
    });
  };

  const clearAll = (): void => {
    onChange({ rosterIds: [] });
  };

  const selectedCount = value.rosterIds.length;
  const totalCount = rosters.length;

  return (
    <div
      className={
        disabled ? 'opacity-50 pointer-events-none space-y-2' : 'space-y-2'
      }
    >
      <div className="flex items-center gap-2">
        <Users
          aria-hidden="true"
          focusable="false"
          className="w-4 h-4 text-brand-blue-primary"
        />
        <p className="text-sm font-bold text-brand-blue-dark">
          Assign to classes{' '}
          <span className="text-slate-400 font-normal">(optional)</span>
        </p>
      </div>

      {rosters.length === 0 ? (
        <EmptyStub message="No classes yet. Create one in My Classes or import from ClassLink to assign here." />
      ) : (
        <CheckList>
          {rosters.map((r) => (
            <RosterCheckItem
              key={r.id}
              roster={r}
              checked={value.rosterIds.includes(r.id)}
              onToggle={() => toggleRosterId(r.id)}
            />
          ))}
        </CheckList>
      )}

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

const CheckList: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="space-y-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
    {children}
  </div>
);

const RosterCheckItem: React.FC<{
  roster: ClassRoster;
  checked: boolean;
  onToggle: () => void;
}> = ({ roster, checked, onToggle }) => {
  const isClassLink = Boolean(roster.classlinkClassId);
  const badgeTitle = isClassLink
    ? [roster.classlinkSubject, roster.classlinkClassCode]
        .filter(Boolean)
        .join(' · ') || 'Imported from ClassLink'
    : undefined;
  // Rosters whose Drive students failed to load produce sessions with zero
  // PINs that no student can join. Disable selection and surface the reason
  // inline so teachers aren't surprised by a broken assignment later.
  const disabled = Boolean(roster.loadError);

  return (
    <label
      className={`flex items-center gap-2 rounded px-1.5 py-1 ${
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer hover:bg-slate-50'
      }`}
      title={disabled ? roster.loadError : undefined}
    >
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
        disabled={disabled}
        onChange={onToggle}
      />
      <span className="text-sm text-slate-800 flex-1 truncate">
        {roster.name}
      </span>
      {disabled && (
        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-red-500">
          Unavailable
        </span>
      )}
      {isClassLink && (
        <span
          className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-blue-lighter text-brand-blue-dark border border-brand-blue-light"
          title={badgeTitle}
        >
          <Link2 aria-hidden="true" focusable="false" className="w-2.5 h-2.5" />
          CL
        </span>
      )}
    </label>
  );
};

const EmptyStub: React.FC<{ message: string }> = ({ message }) => (
  <p className="text-xxs text-slate-500 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2">
    {message}
  </p>
);
