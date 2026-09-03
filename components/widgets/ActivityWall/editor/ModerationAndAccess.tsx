import React from 'react';
import type { ClassLinkClass } from '@/types';
import { formatClassLinkClassLabel } from '@/components/common/AssignClassPicker.helpers';
import { ToggleRow } from './ToggleRow';

interface ModerationAndAccessProps {
  moderationEnabled: boolean;
  allowGuests: boolean;
  showNames: boolean;
  studentsCanSeePosts: boolean;
  classIds: string[];
  classes: ClassLinkClass[];
  onChange: (patch: {
    moderationEnabled?: boolean;
    allowGuests?: boolean;
    showNames?: boolean;
    studentsCanSeePosts?: boolean;
    classIds?: string[];
  }) => void;
}

/** Moderation, guest access, attribution, and ClassLink targeting. */
export const ModerationAndAccess: React.FC<ModerationAndAccessProps> = ({
  moderationEnabled,
  allowGuests,
  showNames,
  studentsCanSeePosts,
  classIds,
  classes,
  onChange,
}) => (
  <div className="space-y-2">
    <ToggleRow
      label="Require moderation"
      hint="Posts wait for your approval before anyone sees them."
      checked={moderationEnabled}
      onChange={(next) => onChange({ moderationEnabled: next })}
    />
    <ToggleRow
      label="Allow guests"
      hint="Anyone with the link may post without signing in."
      checked={allowGuests}
      onChange={(next) => onChange({ allowGuests: next })}
    />
    <ToggleRow
      label="Show names"
      hint="Display each student's name on their post."
      checked={showNames}
      onChange={(next) => onChange({ showNames: next })}
    />
    <ToggleRow
      label="Students can see posts"
      hint="Turn off to hide everyone's posts until you reveal the wall."
      checked={studentsCanSeePosts}
      onChange={(next) => onChange({ studentsCanSeePosts: next })}
    />

    {classes.length > 0 && (
      <fieldset className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <legend className="text-sm font-semibold text-slate-700">
          Target classes
        </legend>
        <p className="mb-2 text-xs text-slate-600">
          Students in the selected classes see this wall in their assignments.
          Leave all off to share by link only.
        </p>
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {classes.map((cls) => {
            const checked = classIds.includes(cls.sourcedId);
            return (
              <label
                key={cls.sourcedId}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange({
                      classIds: checked
                        ? classIds.filter((id) => id !== cls.sourcedId)
                        : [...classIds, cls.sourcedId],
                    })
                  }
                  className="h-4 w-4 accent-brand-blue-primary"
                />
                {formatClassLinkClassLabel(cls)}
              </label>
            );
          })}
        </div>
      </fieldset>
    )}
  </div>
);
