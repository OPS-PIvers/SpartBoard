import React from 'react';
import { Target, ChevronDown, Filter } from 'lucide-react';
import { ChipSelect } from '@/components/common/ChipSelect';
import {
  anyRosterHasGroups,
  groupMakerGroups,
  countRosterGroupMembers,
} from '@/utils/rosterGroups';
import { useDashboard } from '@/context/useDashboard';
import type { TourAnchorAttrs } from '@/config/tourAnchors';

/**
 * Optional pool selection (docs/plans/shipped/ROSTER_GROUPS_INTEGRATION.md D8/D16).
 * A host passes this only when the rollout switch and the `roster-groups`
 * permission are both on; without it the chip is the class switcher it has
 * always been.
 */
export interface ActiveClassChipGroupSelection {
  /** `null` selects the whole class. */
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string | null) => void;
}

interface ActiveClassChipProps {
  className?: string;
  /**
   * When true, render the trigger as a compact button matching the
   * Shuffle/Rotate-style header buttons used in the Stations widget
   * (white shell, slate border, brand-blue icon/label, smaller height).
   * Default keeps the original pill visual used by Random / SeatingChart /
   * LunchCount.
   */
  compact?: boolean;
  groupSelection?: ActiveClassChipGroupSelection;
  anchor?: TourAnchorAttrs;
}

const GROUP_SEP = '|';

export const ActiveClassChip: React.FC<ActiveClassChipProps> = ({
  className,
  compact = false,
  groupSelection,
  anchor,
}) => {
  const { rosters, activeRosterId, setActiveRoster } = useDashboard();
  const activeRoster = rosters.find((r) => r.id === activeRosterId);

  // A group the teacher can only have named privately ("Modified Assessments")
  // must never reach the front face, so the chip shows its size instead.
  const selectedGroupId = groupSelection?.selectedGroupId ?? null;
  const selectedGroupSize =
    selectedGroupId && activeRoster
      ? countRosterGroupMembers(activeRoster, selectedGroupId)
      : null;
  const groupSelectable =
    groupSelection !== undefined && anyRosterHasGroups(rosters);

  const interactive = rosters.length > 1 || groupSelectable;

  if (!activeRoster) return null;

  const iconSizeStyle = compact
    ? {
        width: 'clamp(14px, 4cqmin, 22px)',
        height: 'clamp(14px, 4cqmin, 22px)',
      }
    : {
        width: 'clamp(14px, 3.6cqmin, 28px)',
        height: 'clamp(14px, 3.6cqmin, 28px)',
      };
  const labelFontStyle = compact
    ? { fontSize: 'clamp(13px, 3.5cqmin, 18px)' }
    : { fontSize: 'clamp(12px, 3cqmin, 20px)' };
  const chevronSizeStyle = compact
    ? {
        width: 'clamp(12px, 3.5cqmin, 18px)',
        height: 'clamp(12px, 3.5cqmin, 18px)',
      }
    : {
        width: 'clamp(12px, 3cqmin, 22px)',
        height: 'clamp(12px, 3cqmin, 22px)',
      };

  const faceLabel =
    selectedGroupSize === null
      ? activeRoster.name
      : `${activeRoster.name} · ${selectedGroupSize} ${
          selectedGroupSize === 1 ? 'student' : 'students'
        }`;

  const chipContent = (
    <>
      {selectedGroupSize === null ? (
        <Target
          className="text-brand-blue-primary shrink-0"
          style={iconSizeStyle}
        />
      ) : (
        <Filter
          className="text-brand-blue-primary shrink-0"
          style={iconSizeStyle}
        />
      )}
      <span
        className={`font-black uppercase text-brand-blue-primary truncate min-w-0 ${
          compact ? 'tracking-widest' : 'tracking-wider'
        }`}
        style={labelFontStyle}
      >
        {faceLabel}
      </span>
      {interactive && (
        <ChevronDown
          className="text-brand-blue-primary shrink-0 opacity-70"
          style={{
            ...chevronSizeStyle,
          }}
          aria-hidden
        />
      )}
    </>
  );

  const chipClass = compact
    ? 'flex items-center rounded-xl bg-white border border-slate-200'
    : 'flex items-center bg-brand-blue-lighter rounded-full border border-brand-blue-light';
  const chipStyle: React.CSSProperties = compact
    ? {
        gap: 'clamp(6px, 1.5cqmin, 10px)',
        padding: 'clamp(6px, 1.5cqmin, 10px) clamp(10px, 2.5cqmin, 18px)',
        minHeight: 'clamp(32px, 8cqmin, 48px)',
      }
    : {
        gap: 'clamp(6px, 2cqmin, 14px)',
        padding: 'clamp(6px, 1.6cqmin, 12px) clamp(12px, 3cqmin, 22px)',
        minHeight: 'clamp(32px, 8cqmin, 48px)',
      };

  const interactiveHoverClass = compact
    ? 'hover:bg-slate-50 transition-colors cursor-pointer'
    : 'hover:bg-brand-blue-light/40 transition-colors cursor-pointer';

  if (!interactive) {
    return (
      <div
        className={`${chipClass} ${className ?? ''}`.trim()}
        style={chipStyle}
        aria-label={`Active class: ${faceLabel}`}
      >
        {chipContent}
      </div>
    );
  }

  const listedGroup =
    groupSelectable &&
    groupMakerGroups(activeRoster).some((g) => g.id === selectedGroupId);
  const value = listedGroup
    ? `${activeRoster.id}${GROUP_SEP}${selectedGroupId}`
    : activeRoster.id;
  const classOption = (r: (typeof rosters)[number]) => (
    <option key={r.id} value={r.id}>
      {`${r.name} (${r.studentCount})`}
    </option>
  );

  return (
    <ChipSelect
      face={chipContent}
      value={value}
      anchor={anchor}
      ariaLabel={`Active class: ${faceLabel}`}
      onChange={(next) => {
        const [rosterId, groupId = null] = next.split(GROUP_SEP);
        if (rosterId !== activeRosterId) setActiveRoster(rosterId);
        // A group id belongs to one roster, so switching class drops it.
        groupSelection?.onSelectGroup(groupId);
      }}
      className={`${chipClass} ${interactiveHoverClass} ${className ?? ''}`.trim()}
      style={chipStyle}
    >
      {rosters.map((r) => {
        const groups = groupSelectable ? groupMakerGroups(r) : [];
        if (groups.length === 0) return classOption(r);
        return (
          <optgroup key={r.id} label={r.name}>
            {classOption(r)}
            {groups.map((g) => (
              <option key={g.id} value={`${r.id}${GROUP_SEP}${g.id}`}>
                {`${g.name} (${countRosterGroupMembers(r, g.id) ?? 0})`}
              </option>
            ))}
          </optgroup>
        );
      })}
    </ChipSelect>
  );
};
